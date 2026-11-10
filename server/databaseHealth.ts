/**
 * Whether the server can reach the database, said in a way that is safe to show anyone: the driver's error code and a
 * short reason, with any connection string or password taken out. Used by /api/health, so an owner can see why sign-in
 * fails ("password authentication failed", "Tenant or user not found", a timeout) without opening the hosting logs.
 */
import { sql } from "drizzle-orm";
import journal from "../drizzle/migrations/meta/_journal.json";

type Described = { code: string | null; reason: string };
type Executes = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/** The migrations this build was written for, in order (drizzle/migrations/meta/_journal.json, bundled at build time). */
export const EXPECTED_MIGRATIONS: readonly string[] = journal.entries.map(entry => entry.tag);

/** How far the database's migrations are from what this build needs; `missing` is the number of the first it lacks. */
export type MigrationState = { applied: number; expected: number; missing: string | null };

/**
 * How many migrations the database has recorded (drizzle.__drizzle_migrations, written by `pnpm db:migrate` and by
 * every apply script) against how many this build needs. A database that lacks one breaks every screen that reads its
 * tables, so this says which one ("0022"). Null when the record cannot be read, so nothing is claimed that is not known.
 */
export async function migrationState(db: Executes): Promise<MigrationState | null> {
  try {
    const result = await db.execute(sql`select count(*)::int as applied from drizzle.__drizzle_migrations`);
    const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] } | null)?.rows) ?? [];
    const applied = Number((rows[0] as { applied?: unknown } | undefined)?.applied);
    if (!Number.isInteger(applied)) return null;
    const expected = EXPECTED_MIGRATIONS.length;
    return { applied, expected, missing: applied < expected ? EXPECTED_MIGRATIONS[applied].slice(0, 4) : null };
  } catch {
    return null;
  }
}

const CONNECTION_STRING = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi;
const PASSWORD_PAIR = /(password|pwd|secret|key)=\S+/gi;

/** The innermost useful code and message in an error chain (Drizzle wraps the driver's error as `cause`). */
export function describeDatabaseError(error: unknown): Described {
  let code: string | null = null;
  let reason = "";
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const item = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof item.code === "string" && !code) code = item.code;
    if (typeof item.message === "string" && item.message && !item.message.startsWith("Failed query")) reason = item.message;
    current = item.cause;
  }
  reason = (reason || "Unknown database error").replace(CONNECTION_STRING, "[connection string]").replace(PASSWORD_PAIR, "$1=[hidden]");
  // A host name is shown only when it looks like one. A broken connection string (a password with "@" or "#" in it)
  // makes the driver treat part of the password as the host, and that must never be shown.
  reason = reason.replace(/\b(getaddrinfo (?:ENOTFOUND|EAI_AGAIN)) (\S+)/g, (_match, prefix: string, host: string) =>
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) ? `${prefix} ${host}` : `${prefix} [not a valid host name: check the connection string; a password with @, #, / or ? in it breaks it]`);
  reason = reason.slice(0, 240);
  return { code, reason };
}

/**
 * One `select 1`, then the migrations recorded against those this build needs, with a time limit. Never throws. A
 * database behind the build is not healthy: health answers 503 and names the migration to apply, so a deployment that
 * runs ahead of its database is seen at once, not when a screen fails.
 */
export async function checkDatabase(db: Executes | null, timeoutMs = 5000): Promise<{ ok: true; migrations?: Omit<MigrationState, "missing"> } | ({ ok: false } & Described & { migrations?: MigrationState })> {
  if (!db) return { ok: false, code: null, reason: "DATABASE_URL is not set" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = await Promise.race([
      db.execute(sql`select 1`).then(() => migrationState(db)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`No answer from the database within ${timeoutMs / 1000} seconds`), { code: "TIMEOUT" })), timeoutMs); }),
    ]);
    if (!state) return { ok: true };
    if (state.missing) {
      return { ok: false, code: "MIGRATION_MISSING", reason: `The database is missing migration ${state.missing}: it has ${state.applied} of the ${state.expected} this build needs.`, migrations: state };
    }
    return { ok: true, migrations: { applied: state.applied, expected: state.expected } };
  } catch (error) {
    return { ok: false, ...describeDatabaseError(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * What a visitor is told when the server fails in a way nobody planned for (a database that does not answer, a query
 * that breaks): a plain sentence, never the query or the driver's message. The full error goes to the hosting log.
 */
export const UNEXPECTED_ERROR_MESSAGE = "Something went wrong on our side. Please try again in a minute. If it keeps happening, write to us.";
