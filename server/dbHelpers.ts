import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Case-insensitive match of a stored email against an already-normalised (trimmed, lower-cased) address.
 * MySQL's default collation compared emails case-insensitively; PostgreSQL does not, and stored values
 * such as `users.email` come from OAuth without normalisation.
 */
export function emailEquals(column: AnyColumn, normalisedEmail: string): SQL {
  return sql`lower(${column}) = ${normalisedEmail.trim().toLowerCase()}`;
}

/**
 * The database clock for persisted `updatedAt`. Rows are inserted with `DEFAULT now()`, so updates must use the same
 * clock: mixing in the application's `new Date()` lets `updatedAt` move backwards by the app/database clock skew.
 * (MySQL's `ON UPDATE CURRENT_TIMESTAMP` was always the database clock.)
 */
/** True when PostgreSQL reported an undefined table (42P01): a migration that has not been applied yet. */
export function isUndefinedTable(error: unknown) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01";
}

export function databaseNow(): SQL {
  return sql`now()`;
}
