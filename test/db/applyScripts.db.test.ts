import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * The guarded scripts in drizzle/supabase/ are what ET pastes into the Supabase SQL Editor, one per migration. Each must do
 * exactly what `pnpm db:migrate` would: run every statement of its migration, record it with the same hash and date, and
 * refuse to run unless the database is at the migration before it.
 */
const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "drizzle/migrations");
const SCRIPTS = resolve(ROOT, "drizzle/supabase");
const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string; when: number }[] };
const statementsOf = (text: string) => text.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean);
const scriptFor = (idx: number) => readdirSync(SCRIPTS).find(name => name.startsWith(`apply-${String(idx).padStart(4, "0")}-`));

/** A database built from the migrations before `upTo`, recorded as `pnpm db:migrate` records them. */
async function databaseAt(upTo: number) {
  const pg = await PGlite.create();
  await pg.exec('create schema drizzle; create table drizzle."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint);');
  for (const { idx, tag, when } of journal.entries.filter(entry => entry.idx < upTo)) {
    void idx;
    const text = readFileSync(join(MIGRATIONS, `${tag}.sql`), "utf8");
    for (const statement of statementsOf(text)) await pg.exec(statement);
    await pg.query('insert into drizzle."__drizzle_migrations" (hash, created_at) values ($1, $2)', [createHash("sha256").update(text).digest("hex"), when]);
  }
  return pg;
}

describe("the Supabase apply scripts", () => {
  const latest = journal.entries.at(-1)!;

  it("match their migration: every statement, the same hash and date, and a guard on the migration count", () => {
    for (const { idx, tag, when } of journal.entries.filter(entry => entry.idx >= 20)) {
      const name = scriptFor(idx);
      expect(name, `drizzle/supabase/apply-${String(idx).padStart(4, "0")}-*.sql`).toBeTruthy();
      const script = readFileSync(join(SCRIPTS, name!), "utf8");
      const migration = readFileSync(join(MIGRATIONS, `${tag}.sql`), "utf8");
      for (const statement of statementsOf(migration)) expect(script, `${name}: ${statement}`).toContain(statement);
      expect(script).toContain(`values ('${createHash("sha256").update(migration).digest("hex")}', ${when});`);
      expect(script).toContain(`if applied <> ${idx} then`);
    }
  });

  it("apply the latest migration to a database at the one before, and refuse to run twice", async () => {
    const pg = await databaseAt(latest.idx);
    const script = readFileSync(join(SCRIPTS, scriptFor(latest.idx)!), "utf8");
    await pg.exec(script);
    const recorded = await pg.query<{ count: number }>('select count(*)::int as count from drizzle."__drizzle_migrations"');
    expect(recorded.rows[0]!.count).toBe(latest.idx + 1);
    await expect(pg.exec(script)).rejects.toThrow(/Stopped, nothing changed/);
    await pg.close();
  }, 60_000);

  it("0021: the two Digital marketing roles and the three new columns exist", async () => {
    const pg = await databaseAt(21);
    await pg.exec(readFileSync(join(SCRIPTS, scriptFor(21)!), "utf8"));
    const roles = await pg.query<{ value: string }>("select unnest(enum_range(null::engagement_team_role))::text as value");
    expect(roles.rows.map(row => row.value)).toEqual(expect.arrayContaining(["digital_marketer", "content_producer"]));
    const columns = await pg.query<{ table_name: string; column_name: string }>("select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('users', 'engagement_tasks') and column_name in ('whatsapp', 'whatsappConsentAt', 'responseLink') order by table_name, column_name");
    expect(columns.rows.map(row => `${row.table_name}.${row.column_name}`)).toEqual(["engagement_tasks.responseLink", "users.whatsapp", "users.whatsappConsentAt"]);
    await pg.close();
  }, 60_000);
});
