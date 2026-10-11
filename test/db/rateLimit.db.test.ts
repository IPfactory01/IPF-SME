/**
 * The shared rate-limit store on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`): one
 * counter per key, advanced in one statement, so the limit holds across function instances.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
vi.mock("pg", () => ({ default: { Pool: class { on() { return this; } } } }));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () =>
    new Proxy({}, {
      get: (_target, property) => {
        const value = holder.current[property as string];
        return typeof value === "function" ? value.bind(holder.current) : value;
      },
    }),
}));

import { consumeLimit, limitKey, purgeExpiredLimits, releaseLimit, resetRateLimitsForTests } from "@server/rateLimit";

const targets = [
  { name: "PGlite", enabled: true, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];
const rule = { scope: "db_unit", max: 3, windowMs: 60_000 };

for (const target of targets) {
  describe.skipIf(!target.enabled)(`shared rate-limit counters on ${target.name}`, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
    }, 60_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => resetRateLimitsForTests());
    const rowFor = async (subject: string) => (await db.select().from(schema.rateLimitCounters).where(eq(schema.rateLimitCounters.key, limitKey(rule, subject))))[0];

    it("counts attempts in one row, refuses past the maximum, and starts a new window once the old one has passed", async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) expect(await consumeLimit(rule, "203.0.113.20")).toBe(true);
      expect(await consumeLimit(rule, "203.0.113.20")).toBe(false);
      expect((await rowFor("203.0.113.20")).count).toBe(4);
      expect(await db.select().from(schema.rateLimitCounters)).toHaveLength(1);
      // The window ends: the next attempt starts a fresh count.
      await db.update(schema.rateLimitCounters).set({ windowEndsAt: new Date(Date.now() - 1000) }).where(eq(schema.rateLimitCounters.key, limitKey(rule, "203.0.113.20")));
      expect(await consumeLimit(rule, "203.0.113.20")).toBe(true);
      expect((await rowFor("203.0.113.20")).count).toBe(1);
    });

    it("stores only the hashed key, never the address or email", async () => {
      await consumeLimit(rule, "203.0.113.21:ada@example.test");
      const rows = await harness.query(sql`select key from rate_limit_counters`);
      expect(rows).toHaveLength(1);
      expect(String(rows[0].key)).not.toContain("ada");
      expect(String(rows[0].key)).not.toContain("203.0.113.21");
    });

    it("releases a subject and purges expired windows", async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) await consumeLimit(rule, "203.0.113.22");
      await releaseLimit(rule, "203.0.113.22");
      expect(await rowFor("203.0.113.22")).toBeUndefined();
      await consumeLimit(rule, "203.0.113.23");
      await consumeLimit(rule, "203.0.113.24");
      await db.update(schema.rateLimitCounters).set({ windowEndsAt: new Date(Date.now() - 1000) }).where(eq(schema.rateLimitCounters.key, limitKey(rule, "203.0.113.23")));
      expect(await purgeExpiredLimits()).toBe(1);
      expect(await rowFor("203.0.113.23")).toBeUndefined();
      expect(await rowFor("203.0.113.24")).toBeDefined();
    });

    it("stands in with this instance's memory while the table is missing (before migration 0010), and says so once", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      await db.execute(sql.raw(`alter table rate_limit_counters rename to rate_limit_counters_hidden`));
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) expect(await consumeLimit(rule, "203.0.113.25")).toBe(true);
        expect(await consumeLimit(rule, "203.0.113.25")).toBe(false);
        expect(errors.mock.calls.filter(call => String(call[0]).includes("migration 0010"))).toHaveLength(1);
      } finally {
        await db.execute(sql.raw(`alter table rate_limit_counters_hidden rename to rate_limit_counters`));
        errors.mockRestore();
      }
    });
  });
}
