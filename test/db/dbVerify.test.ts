import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `pnpm db:verify` is the read-only check that the production database matches the committed migrations. It runs here
 * against a database built from the migrations exactly as `pnpm db:migrate` builds one (each file run, then recorded with
 * its SHA-256 and journal timestamp), served over a local socket so the script connects the way it does to Supabase.
 */
const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts/dbVerify.mjs");
const MIGRATIONS = resolve(ROOT, "drizzle/migrations");

let pg: PGlite;
let server: { start: () => Promise<void>; stop: () => Promise<void> };
let url = "";
const temporary: string[] = [];

async function freePort() {
  return new Promise<number>(resolvePort => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolvePort(port));
    });
  });
}

function runVerify(cwd = ROOT) {
  return new Promise<{ code: number | null; output: string }>(done => {
    const child = spawn(process.execPath, [SCRIPT], { cwd, env: { ...process.env, MIGRATION_DATABASE_URL: url, DATABASE_SSL_CA: "" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => (output += chunk));
    child.stderr.on("data", chunk => (output += chunk));
    child.on("close", code => done({ code, output }));
  });
}

/** A copy of the migrations folder as a Windows checkout with `core.autocrlf=true` writes it: CRLF line endings. */
function windowsCheckout() {
  const root = mkdtempSync(join(tmpdir(), "db-verify-crlf-"));
  temporary.push(root);
  const target = join(root, "drizzle/migrations");
  cpSync(MIGRATIONS, target, { recursive: true });
  for (const file of readdirSync(target).filter(name => name.endsWith(".sql"))) {
    const path = join(target, file);
    writeFileSync(path, readFileSync(path, "utf8").replace(/\r?\n/g, "\r\n"));
  }
  return root;
}

beforeAll(async () => {
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  pg = await PGlite.create();
  await pg.exec('create schema drizzle; create table drizzle."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint);');
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] };
  for (const { tag, when } of journal.entries) {
    const text = readFileSync(join(MIGRATIONS, `${tag}.sql`), "utf8");
    for (const statement of text.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) await pg.exec(statement);
    await pg.query('insert into drizzle."__drizzle_migrations" (hash, created_at) values ($1, $2)', [createHash("sha256").update(text).digest("hex"), when]);
  }
  const port = await freePort();
  server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
  await server.start();
  url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
}, 60_000);

afterAll(async () => {
  await server?.stop();
  await new Promise(resolveTurn => setImmediate(resolveTurn));
  await pg?.close();
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

describe("pnpm db:verify", () => {
  it("passes on a database built from the committed migrations, decimal columns with a set precision included", async () => {
    const { code, output } = await runVerify();
    expect(output).not.toMatch(/FAIL/);
    expect(output).toMatch(/Overall: PASS/);
    expect(code).toBe(0);
  }, 60_000);

  it("passes from a Windows checkout, where the migration files have CRLF line endings", async () => {
    const { code, output } = await runVerify(windowsCheckout());
    expect(output).not.toMatch(/FAIL/);
    expect(output).toMatch(/Overall: PASS/);
    expect(code).toBe(0);
  }, 60_000);

  it("still fails when a decimal column's precision differs from the migrations", async () => {
    await pg.exec('alter table "engagement_measures" alter column "targetValue" type numeric(10, 2)');
    try {
      const { code, output } = await runVerify();
      expect(output).toMatch(/FAIL\s+column types match -> engagement_measures\.targetValue \(expected numeric\(18, 4\), found numeric\(10, 2\)\)/);
      expect(code).toBe(1);
    } finally {
      await pg.exec('alter table "engagement_measures" alter column "targetValue" type numeric(18, 4)');
    }
  }, 60_000);

  it("still fails when a recorded migration differs from the file in the repository", async () => {
    await pg.exec(`update drizzle."__drizzle_migrations" set hash = 'not-the-file' where id = 2`);
    try {
      const { code, output } = await runVerify();
      expect(output).toMatch(/FAIL\s+applied migration hashes and timestamps match the journal -> 0001_business_check_pipeline/);
      expect(code).toBe(1);
    } finally {
      const text = readFileSync(join(MIGRATIONS, "0001_business_check_pipeline.sql"), "utf8");
      await pg.query(`update drizzle."__drizzle_migrations" set hash = $1 where id = 2`, [createHash("sha256").update(text).digest("hex")]);
    }
  }, 60_000);
});
