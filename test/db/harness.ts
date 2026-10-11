import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { is, sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { getTableConfig, PgTable, type PgDatabase } from "drizzle-orm/pg-core";
import { vi } from "vitest";
import * as schema from "../../drizzle/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDb = PgDatabase<any, any, any>;

export type DbHarness = {
  label: string;
  db: AnyPgDb;
  /** Runs a raw statement and returns its rows. */
  query: (statement: SQL) => Promise<Record<string, unknown>[]>;
  close: () => Promise<void>;
};

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle/migrations");

/** Every active migration statement, in journal order. */
export function activeMigrationStatements(schemaName?: string): string[] {
  const journal = JSON.parse(readFileSync(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  return journal.entries.flatMap(({ tag }) =>
    readFileSync(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map(statement => statement.trim())
      .filter(Boolean)
      .map(statement => (schemaName ? statement.replaceAll('"public".', `"${schemaName}".`) : statement)),
  );
}

export function rowsOf(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : (result as { rows: Record<string, unknown>[] }).rows) ?? [];
}

/** An in-process PostgreSQL (PGlite) with the baseline migration applied. Hermetic: no network, no secrets. */
export async function createPgliteHarness(): Promise<DbHarness> {
  const pg = new PGlite();
  for (const statement of activeMigrationStatements()) await pg.exec(statement);
  const db = drizzlePglite(pg);
  return {
    label: "PGlite",
    db,
    query: async statement => rowsOf(await db.execute(statement)),
    close: () => pg.close(),
  };
}

/**
 * A real PostgreSQL database (TEST_DATABASE_URL). The baseline migration is applied into a throwaway
 * schema that is dropped afterwards, so no existing table is touched. Use a session-mode or direct URL.
 */
export async function createRemoteHarness(url: string): Promise<DbHarness> {
  const { default: pg } = await vi.importActual<typeof import("pg")>("pg");
  const { drizzle } = await vi.importActual<typeof import("drizzle-orm/node-postgres")>("drizzle-orm/node-postgres");
  const schemaName = `contract_${randomBytes(6).toString("hex")}`;
  const { createPoolConfig } = await vi.importActual<typeof import("@server/db")>("@server/db");
  // The production pool settings; the search_path is set on every new connection, so it applies to every statement.
  const pool = new pg.Pool(createPoolConfig(url));
  pool.on("connect", client => void client.query(`set search_path to "${schemaName}"`));
  await pool.query(`create schema "${schemaName}"`);
  for (const statement of activeMigrationStatements(schemaName)) await pool.query(statement);
  const db = drizzle(pool);
  return {
    label: "TEST_DATABASE_URL",
    db,
    query: async statement => rowsOf(await db.execute(statement)),
    close: async () => {
      await pool.query(`drop schema "${schemaName}" cascade`);
      await pool.end();
    },
  };
}

export const allTables = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));

/** Postgres error code, whether raised directly or wrapped by Drizzle in `cause`. */
export function pgErrorCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | undefined;
  return candidate?.code ?? candidate?.cause?.code;
}

let counter = 0;

/**
 * Inserts a minimal valid row, first inserting a parent row for every foreign key (recursively), and returns it.
 * Lets generic per-table tests cover tables that reference others.
 */
export async function insertFixture(db: AnyPgDb, table: PgTable, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const values = fixtureRow(table, overrides);
  for (const foreignKey of getTableConfig(table).foreignKeys) {
    const reference = foreignKey.reference();
    const [local] = reference.columns;
    const [remote] = reference.foreignColumns;
    if (overrides[local.name] !== undefined) continue;
    const parent = await insertFixture(db, reference.foreignTable as PgTable);
    values[local.name] = parent[remote.name];
  }
  const [row] = await db.insert(table).values(values as never).returning();
  return row as Record<string, unknown>;
}

/** A minimal valid row for any table: only columns that are NOT NULL and have no default. */
export function fixtureRow(table: PgTable, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of getTableConfig(table).columns) {
    if (!column.notNull || column.hasDefault || column.generatedIdentity) continue;
    counter += 1;
    const unique = `${counter}-${randomBytes(3).toString("hex")}`;
    switch (column.columnType) {
      case "PgInteger": row[column.name] = counter; break;
      case "PgText": row[column.name] = `text-${unique}`; break;
      case "PgVarchar": row[column.name] = `v-${unique}`.slice(0, (column as unknown as { length?: number }).length ?? 255); break;
      case "PgTimestamp": row[column.name] = new Date(); break;
      case "PgEnumColumn": row[column.name] = column.enumValues![0]; break;
      default: throw new Error(`fixtureRow: unsupported column type ${column.columnType} on ${column.name}`);
    }
  }
  return { ...row, ...overrides };
}

/**
 * `pglite-socket` (a test-only server) drops the TCP connection after any server-side SQL error, which real
 * PostgreSQL never does; the pool then reconnects on the next query. Call this after a test that deliberately
 * provokes a server error so the following test starts on a live connection.
 */
export async function recoverDriverConnection(db: AnyPgDb) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await db.execute(sql`select 1`);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  throw new Error("test server connection did not recover");
}

/**
 * The PRODUCTION driver path: PGlite served over a local TCP socket, with `getDb()` (node-postgres Pool +
 * drizzle-orm/node-postgres, exactly as on Vercel) connected to it. Hermetic: loopback only, no credentials.
 */
export async function createDriverHarness(): Promise<DbHarness> {
  const { default: net } = await import("node:net");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const port = await new Promise<number>(resolvePort => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port: free } = probe.address() as import("node:net").AddressInfo;
      probe.close(() => resolvePort(free));
    });
  });
  const pg = await PGlite.create();
  for (const statement of activeMigrationStatements()) await pg.exec(statement);
  const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  // pglite-socket serves one client at a time, so the pool is pinned to one connection here (production uses five).
  process.env.DATABASE_POOL_MAX = "1";
  const database = await vi.importActual<typeof import("@server/db")>("@server/db");
  const db = (await database.getDb()) as AnyPgDb;
  return {
    label: "node-postgres over PGlite socket",
    db,
    query: async statement => rowsOf(await db.execute(statement)),
    close: async () => {
      await database.closeDb();
      await server.stop();
      // The socket server detaches each connection on a later event-loop turn; let those handlers finish before the
      // database underneath them is closed, or they run against a closed instance and throw.
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      await pg.close();
    },
  };
}
