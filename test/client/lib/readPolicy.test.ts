import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isRefusal, lagosClock, READ_RETRIES, readRetryDelay, retryRead } from "@/lib/readPolicy";

const sources = (dir: string): string[] => readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? sources(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []));

describe("how a read behaves on a weak connection (R69)", () => {
  it("tells a refusal from a request that failed", () => {
    expect(isRefusal({ message: "No", data: { code: "FORBIDDEN", httpStatus: 403 } })).toBe(true);
    expect(isRefusal({ message: "Gone", data: { code: "NOT_FOUND" } })).toBe(true);
    expect(isRefusal({ message: "Slow down", data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } })).toBe(true);
    expect(isRefusal(new Error("Failed to fetch"))).toBe(false);
    expect(isRefusal({ message: "Fault", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } })).toBe(false);
    expect(isRefusal({ message: "Timed out", data: { code: "TIMEOUT", httpStatus: 408 } })).toBe(false);
    expect(isRefusal(null)).toBe(false);
  });

  it("tries a failed read twice more, and never retries a refusal", () => {
    expect(READ_RETRIES).toBe(2);
    expect([0, 1, 2].map((count) => retryRead(count, new Error("Failed to fetch")))).toEqual([true, true, false]);
    expect(retryRead(0, { message: "No", data: { code: "UNAUTHORIZED", httpStatus: 401 } })).toBe(false);
    expect(readRetryDelay(0) + readRetryDelay(1)).toBeLessThan(3000);
  });

  it("says the time of the last copy in Lagos", () => {
    expect(lagosClock(Date.parse("2026-11-09T09:42:00Z"))).toBe("10:42 am");
    expect(lagosClock(Date.parse("2026-11-09T14:05:00Z"))).toBe("3:05 pm");
  });

  it("is the policy for every read: the app uses it, and no read turns retries off", () => {
    expect(readFileSync(resolve(process.cwd(), "client/src/main.tsx"), "utf8")).toMatch(/retry: retryRead, retryDelay: readRetryDelay/);
    // The clickable preview simulates the server, so it has nothing to retry.
    const offenders = sources("client/src").filter((file) => !file.startsWith("client/src/preview/") && /retry:\s*false/.test(readFileSync(resolve(process.cwd(), file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
