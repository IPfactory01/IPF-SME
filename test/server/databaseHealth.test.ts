import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { checkDatabase, describeDatabaseError, EXPECTED_MIGRATIONS, migrationState, UNEXPECTED_ERROR_MESSAGE } from "@server/databaseHealth";
import journal from "../../drizzle/migrations/meta/_journal.json";
import { safeErrorShape } from "@server/_core/trpc";

/** The shape Drizzle throws: "Failed query: …" with the driver's error underneath. */
const drizzleError = (cause: object) => Object.assign(new Error('Failed query: select "id" from "users" where lower("users"."email") = $1 params: ada@example.com,1'), { cause });

describe("describing a database failure safely", () => {
  it("gives the driver's code and reason, never the query or its parameters", () => {
    const described = describeDatabaseError(drizzleError(Object.assign(new Error("password authentication failed for user \"postgres.abc\""), { code: "28P01" })));
    expect(described).toEqual({ code: "28P01", reason: 'password authentication failed for user "postgres.abc"' });
    expect(JSON.stringify(described)).not.toContain("ada@example.com");
  });

  it("hides connection strings and passwords that appear in a message", () => {
    const described = describeDatabaseError(new Error("connect failed: postgresql://user:s3cret@db.example.com:6543/postgres password=s3cret"));
    expect(described.reason).not.toContain("s3cret");
    expect(described.reason).toContain("[connection string]");
  });

  it("never shows a host name that is really part of a password broken out of the connection string", () => {
    const broken = describeDatabaseError(Object.assign(new Error("getaddrinfo ENOTFOUND Pa55wo*&rd"), { code: "ENOTFOUND" }));
    expect(broken.reason).not.toContain("Pa55wo");
    expect(broken.reason).toContain("check the connection string");
    const real = describeDatabaseError(Object.assign(new Error("getaddrinfo ENOTFOUND aws-0-eu-west-1.pooler.supabase.com"), { code: "ENOTFOUND" }));
    expect(real.reason).toBe("getaddrinfo ENOTFOUND aws-0-eu-west-1.pooler.supabase.com");
  });

  it("checks with one select, says when there is no database or no answer, and never throws", async () => {
    expect(await checkDatabase({ execute: async () => [] })).toEqual({ ok: true });
    expect(await checkDatabase(null)).toEqual({ ok: false, code: null, reason: "DATABASE_URL is not set" });
    const refused = await checkDatabase({ execute: async () => { throw drizzleError(Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:6543"), { code: "ECONNREFUSED" })); } });
    expect(refused).toEqual({ ok: false, code: "ECONNREFUSED", reason: "connect ECONNREFUSED 10.0.0.1:6543" });
    vi.useFakeTimers();
    const pending = checkDatabase({ execute: () => new Promise(() => undefined) }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ ok: false, code: "TIMEOUT" });
    vi.useRealTimers();
  });
});

describe("whether the database has every migration this build needs", () => {
  /** A database that answers `select 1` and has recorded `applied` migrations. */
  const recorded = (applied: number) => ({ execute: async () => ({ rows: [{ applied }] }) });

  it("knows the migrations this build was written for, from the journal, in order", () => {
    expect(EXPECTED_MIGRATIONS).toEqual(journal.entries.map(entry => entry.tag));
    expect(EXPECTED_MIGRATIONS[0]).toBe("0000_postgres_baseline");
    expect(EXPECTED_MIGRATIONS.length).toBeGreaterThanOrEqual(23);
  });

  it("is healthy with every migration applied, and with more than this build knows (a migration applied just before its code)", async () => {
    const expected = EXPECTED_MIGRATIONS.length;
    expect(await checkDatabase(recorded(expected))).toEqual({ ok: true, migrations: { applied: expected, expected } });
    expect(await checkDatabase(recorded(expected + 1))).toEqual({ ok: true, migrations: { applied: expected + 1, expected } });
  });

  it("is not healthy when the database is behind, and names the first migration it lacks", async () => {
    // The live case on 10 November 2026: the code needed 0022, the database had 0000 to 0021.
    const expected = EXPECTED_MIGRATIONS.length;
    const behind = await checkDatabase(recorded(22));
    expect(behind).toEqual({ ok: false, code: "MIGRATION_MISSING", reason: `The database is missing migration 0022: it has 22 of the ${expected} this build needs.`, migrations: { applied: 22, expected, missing: "0022" } });
    expect(await migrationState(recorded(expected - 1))).toEqual({ applied: expected - 1, expected, missing: EXPECTED_MIGRATIONS[expected - 1].slice(0, 4) });
  });

  it("claims nothing when the migration record cannot be read", async () => {
    let calls = 0;
    const noRecord = { execute: async () => { calls += 1; if (calls > 1) throw Object.assign(new Error('relation "drizzle.__drizzle_migrations" does not exist'), { code: "42P01" }); return []; } };
    expect(await checkDatabase(noRecord)).toEqual({ ok: true });
    expect(await migrationState({ execute: async () => ({ rows: [] }) })).toBeNull();
  });
});

describe("what the browser is told when the server fails", () => {
  const shape = (message: string) => ({ message, code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: "account.signInInternal", stack: "Error: at ..." } });

  it("replaces an unplanned failure (a broken query) with one plain sentence, without the stack", () => {
    const error = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: drizzleError({ code: "57P01" }) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const safe = safeErrorShape(shape(error.message), error);
    spy.mockRestore();
    expect(safe.message).toBe(UNEXPECTED_ERROR_MESSAGE);
    expect(JSON.stringify(safe)).not.toMatch(/Failed query|select|ada@example\.com/);
    expect("stack" in safe.data).toBe(false);
  });

  it("keeps messages the code wrote for people, and every other kind of error", () => {
    const planned = new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    expect(safeErrorShape(shape(planned.message), planned).message).toBe("Database not available");
    const refused = new TRPCError({ code: "UNAUTHORIZED", message: "Your email or password is not correct." });
    expect(safeErrorShape({ ...shape(refused.message), data: { ...shape("").data, code: "UNAUTHORIZED" } }, refused).message).toBe("Your email or password is not correct.");
  });
});
