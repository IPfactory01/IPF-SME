import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { databaseNow } from "@server/dbHelpers";
import * as schema from "../../drizzle/schema";
import { allTables } from "../db/harness";

const mocked = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://user:secret@db.example.test:6543/postgres?sslmode=require&application_name=ipf";
  return {
    pools: [] as { config: Record<string, unknown>; on: ReturnType<typeof vi.fn> }[],
    drizzle: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  };
});

vi.mock("pg", () => ({
  default: {
    Pool: class {
      on = vi.fn();
      constructor(public config: Record<string, unknown>) {
        mocked.pools.push(this);
      }
    },
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocked.drizzle }));

import { createPoolConfig, getDb, upsertUser } from "@server/db";
import { emailEquals } from "@server/dbHelpers";

const root = process.cwd();

describe("database pool for Vercel and the Supabase transaction pooler", () => {
  it("uses a single connection, short idle timeouts and no TLS parameters from the URL", () => {
    const config = createPoolConfig("postgresql://user:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&application_name=ipf", {});
    expect(config).toMatchObject({ max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, allowExitOnIdle: true });
    const url = new URL(config.connectionString!);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.get("application_name")).toBe("ipf");
    expect(url.port).toBe("6543");
  });

  it("encrypts remote connections, verifying the server only when DATABASE_SSL_CA is provided", () => {
    const remote = "postgresql://user:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres";
    expect(createPoolConfig(remote, {}).ssl).toEqual({ rejectUnauthorized: false });
    expect(createPoolConfig(remote, { DATABASE_SSL_CA: " -----BEGIN CERTIFICATE-----x " }).ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----x", rejectUnauthorized: true });
  });

  it("does not use TLS for a local database", () => {
    expect(createPoolConfig("postgresql://user:secret@localhost:5432/postgres", {}).ssl).toBe(false);
    expect(createPoolConfig("postgresql://user:secret@127.0.0.1:5432/postgres", {}).ssl).toBe(false);
  });

  it("creates the pool once, lazily, and reuses the cached Drizzle instance", async () => {
    mocked.drizzle.mockReturnValue({ insert: vi.fn() });
    expect(mocked.pools).toHaveLength(0);
    const first = await getDb();
    expect(await getDb()).toBe(first);
    expect(await getDb()).toBe(first);
    expect(mocked.pools).toHaveLength(1);
    expect(mocked.drizzle).toHaveBeenCalledTimes(1);
    expect(mocked.drizzle.mock.calls[0][0]).toBe(mocked.pools[0]);
    expect(mocked.pools[0].config.max).toBe(1);
    expect(mocked.pools[0].on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("never prepares named statements", () => {
    const sources = ["server/db.ts"].map(file => readFileSync(resolve(root, file), "utf8")).join("\n");
    expect(sources).not.toMatch(/\.prepare\(|name:\s*["']/);
  });
});

describe("upsertUser conflict handling", () => {
  it("upserts on openId and refreshes updatedAt explicitly", async () => {
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate: mocked.onConflictDoUpdate.mockResolvedValue(undefined) });
    mocked.drizzle.mockReturnValue({ insert: vi.fn().mockReturnValue({ values }) });
    vi.resetModules();
    const { upsertUser: freshUpsert } = await import("@server/db");
    await freshUpsert({ openId: "open-1", name: "Name" });
    const arguments_ = mocked.onConflictDoUpdate.mock.calls.at(-1)![0];
    // The module graph was reloaded, so compare by column identity rather than object reference.
    expect(arguments_.target.name).toBe("openId");
    expect(getTableConfig(arguments_.target.table).name).toBe("users");
    expect(arguments_.set.name).toBe("Name");
    // The database clock, not the application's: rows insert with DEFAULT now().
    expect(new PgDialect().sqlToQuery(arguments_.set.updatedAt).sql).toBe("now()");
  });

  it("exports upsertUser", () => expect(typeof upsertUser).toBe("function"));
});

describe("emailEquals", () => {
  it("compares lower(column) with the trimmed, lower-cased address as a bound parameter", () => {
    const query = new PgDialect().sqlToQuery(emailEquals(schema.users.email, "  Admin@Example.COM "));
    expect(query.sql).toBe('lower("users"."email") = $1');
    expect(query.params).toEqual(["admin@example.com"]);
  });
});

describe("PostgreSQL schema and migration history", () => {
  const archive = readFileSync(resolve(root, "drizzle/mysql-archive/schema.mysql.ts.txt"), "utf8");
  const mysqlTables = [...archive.matchAll(/mysqlTable\("(\w+)"/g)].map(match => match[1]).sort();
  const pgTables = allTables.map(table => getTableConfig(table).name).sort();
  const baseline = readFileSync(resolve(root, "drizzle/migrations/0000_postgres_baseline.sql"), "utf8");

  // The 30 inherited tables are kept; later migrations may add tables, and each addition is listed here on purpose.
  const ADDED_AFTER_MYSQL = ["account_invitations", "business_member_access", "business_memberships", "businesses", "client_onboarding_invitations", "engagement_checkins", "engagement_comments", "engagement_deliverables", "engagement_files", "engagement_measures", "engagement_sessions", "engagement_tasks", "engagement_team", "engagements", "full_reports", "payment_requests", "user_credentials", "user_platform_roles", "user_sessions"];

  it("keeps all 30 table names from the MySQL schema and adds only the listed new tables", () => {
    expect(mysqlTables).toHaveLength(30);
    expect(pgTables.filter(name => mysqlTables.includes(name))).toEqual(mysqlTables);
    expect(pgTables.filter(name => !mysqlTables.includes(name))).toEqual(ADDED_AFTER_MYSQL);
  });

  // Columns added after the migration (in later migrations) are allowed; none from MySQL may be lost.
  it("keeps every column name from the MySQL schema", () => {
    for (const table of allTables) {
      const { name, columns } = getTableConfig(table);
      if (ADDED_AFTER_MYSQL.includes(name)) continue;
      const block = archive.split(`mysqlTable("${name}"`)[1]!.split("export type")[0]!;
      const mysqlColumns = [...block.matchAll(/^\s+\w+: \w+\("(\w+)"/gm)].map(match => match[1]).sort();
      expect(columns.map(column => column.name), name).toEqual(expect.arrayContaining(mysqlColumns));
    }
  });

  it("creates all 30 tables and 42 enum types in the baseline migration", () => {
    expect(baseline.match(/^CREATE TABLE /gm)).toHaveLength(30);
    expect(baseline.match(/^CREATE TYPE /gm)).toHaveLength(42);
  });

  it("contains no MySQL-specific SQL in the active migration directory", () => {
    const files = readdirSync(resolve(root, "drizzle/migrations")).filter(file => file.endsWith(".sql")).sort();
    const journal = JSON.parse(readFileSync(resolve(root, "drizzle/migrations/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    expect(files[0]).toBe("0000_postgres_baseline.sql");
    expect(files).toEqual(journal.entries.map(entry => `${entry.tag}.sql`));
    for (const file of files) {
      const migration = readFileSync(resolve(root, "drizzle/migrations", file), "utf8");
      for (const pattern of [/`/, /AUTO_INCREMENT/i, /\bENGINE\s*=/i, /CHARSET/i, /ON UPDATE CURRENT_TIMESTAMP/i, /\bmysql/i, /\bdatetime\b/i, /\btinyint\b/i]) {
        expect(migration, file).not.toMatch(pattern);
      }
    }
  });

  it("archives the inherited MySQL history instead of deleting it", () => {
    const archived = readdirSync(resolve(root, "drizzle/mysql-archive")).filter(file => file.endsWith(".sql"));
    expect(archived).toHaveLength(24);
    expect(JSON.parse(readFileSync(resolve(root, "drizzle/migrations/meta/_journal.json"), "utf8")).dialect).toBe("postgresql");
  });

  it("no longer references MySQL in application code or dependencies", () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies.mysql2).toBeUndefined();
    expect(packageJson.dependencies.postgres).toBeUndefined();
    expect(packageJson.dependencies.pg).toBeDefined();
    const walk = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)]));
    const offenders = ["server", "scripts", "shared"].flatMap(directory => walk(resolve(root, directory)))
      .filter(file => /\.(ts|tsx|mjs)$/.test(file))
      .filter(file => /mysql|insertId|onDuplicateKeyUpdate|affectedRows|ER_DUP_ENTRY/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("updatedAt uses one authoritative clock (the database)", () => {
  const dialect = new PgDialect();
  const updatedAtColumns = allTables.flatMap(table => getTableConfig(table).columns.filter(column => column.name === "updatedAt").map(column => ({ table: getTableConfig(table).name, column })));

  it("defaults to now() on insert and rewrites to now() on every update for all 30 tables", () => {
    expect(updatedAtColumns).toHaveLength(30);
    for (const { table, column } of updatedAtColumns) {
      expect(column.hasDefault, `${table} default`).toBe(true);
      const onUpdate = (column as unknown as { onUpdateFn?: () => unknown }).onUpdateFn?.();
      expect(onUpdate, `${table} $onUpdate`).toBeDefined();
      expect(dialect.sqlToQuery(onUpdate as never).sql, `${table} $onUpdate`).toBe("now()");
    }
  });

  it("databaseNow() renders the database function", () => {
    expect(dialect.sqlToQuery(databaseNow()).sql).toBe("now()");
  });

  it("no application code writes updatedAt from the application clock", () => {
    const walk = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)]));
    const offenders = ["server"].flatMap(directory => walk(resolve(root, directory)))
      .filter(file => file.endsWith(".ts"))
      // sdk.ts builds an in-memory user for scheduled-task callers; it is never written to the database.
      .filter(file => !file.endsWith("server/_core/sdk.ts"))
      .filter(file => /updatedAt:\s*(new Date\(|now\b)/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

