import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { checkDatabase, describeDatabaseError, UNEXPECTED_ERROR_MESSAGE } from "@server/databaseHealth";
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
