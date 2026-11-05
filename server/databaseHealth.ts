/**
 * Whether the server can reach the database, said in a way that is safe to show anyone: the driver's error code and a
 * short reason, with any connection string or password taken out. Used by /api/health, so an owner can see why sign-in
 * fails ("password authentication failed", "Tenant or user not found", a timeout) without opening the hosting logs.
 */
import { sql } from "drizzle-orm";

type Described = { code: string | null; reason: string };

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
  reason = (reason || "Unknown database error").replace(CONNECTION_STRING, "[connection string]").replace(PASSWORD_PAIR, "$1=[hidden]").slice(0, 240);
  return { code, reason };
}

/** One `select 1`, with a time limit. Never throws. */
export async function checkDatabase(db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } | null, timeoutMs = 5000): Promise<{ ok: true } | ({ ok: false } & Described)> {
  if (!db) return { ok: false, code: null, reason: "DATABASE_URL is not set" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`No answer from the database within ${timeoutMs / 1000} seconds`), { code: "TIMEOUT" })), timeoutMs); }),
    ]);
    return { ok: true };
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
