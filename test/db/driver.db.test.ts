/**
 * The production database driver path: node-postgres Pool + drizzle-orm/node-postgres (as on Vercel), connected
 * over a loopback socket to an in-process PostgreSQL (PGlite). Nothing here is mocked in the driver stack.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createDriverHarness, fixtureRow, pgErrorCode, recoverDriverConnection, type DbHarness } from "./harness";
import { getDb, upsertUser } from "@server/db";

describe("production node-postgres driver (single-connection pool)", () => {
  let harness: DbHarness;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeAll(async () => {
    harness = await createDriverHarness();
    db = harness.db;
  }, 60_000);
  afterAll(async () => {
    await harness?.close();
  });

  it("returns the cached Drizzle instance from getDb()", async () => {
    expect(await getDb()).toBe(db);
  });

  it("answers concurrent queries on the one connection without mixing up results", async () => {
    const echoed = await Promise.all(Array.from({ length: 40 }, (_, index) =>
      harness.query(sql`select ${index}::int as n, pg_sleep(0) is not null as ok`).then(rows => rows[0].n)));
    expect(echoed).toEqual(Array.from({ length: 40 }, (_, index) => index));
  });

  it("commits and rolls back real transactions", async () => {
    await db.transaction(async (tx: typeof db) => {
      await tx.insert(schema.users).values({ openId: "driver-commit" });
    });
    expect(await db.select().from(schema.users).where(eq(schema.users.openId, "driver-commit"))).toHaveLength(1);

    await expect(db.transaction(async (tx: typeof db) => {
      await tx.insert(schema.users).values({ openId: "driver-rollback" });
      throw new Error("abort");
    })).rejects.toThrow("abort");
    expect(await db.select().from(schema.users).where(eq(schema.users.openId, "driver-rollback"))).toHaveLength(0);
  });

  it("queues a query issued during a transaction instead of deadlocking or interleaving", async () => {
    let outside: Promise<unknown[]> | undefined;
    await db.transaction(async (tx: typeof db) => {
      await tx.insert(schema.users).values({ openId: "driver-queue" });
      outside = db.select().from(schema.users).where(eq(schema.users.openId, "driver-queue"));
      // Inside the transaction the row is visible; the outside query is still waiting for the connection.
      expect(await tx.select().from(schema.users).where(eq(schema.users.openId, "driver-queue"))).toHaveLength(1);
    });
    expect(await outside).toHaveLength(1);
  });

  it("surfaces unique violations with SQLSTATE 23505", async () => {
    const values = fixtureRow(schema.scheduledReminderDeliveries, { deliveryKey: "driver:1:24h" });
    await db.insert(schema.scheduledReminderDeliveries).values(values);
    const failure = await db.insert(schema.scheduledReminderDeliveries).values({ ...values }).then(() => null, (error: unknown) => error);
    expect(pgErrorCode(failure)).toBe("23505");
    await recoverDriverConnection(db);
  });

  it("upsertUser works through the production driver", async () => {
    await upsertUser({ openId: "driver-upsert", name: "One" });
    await upsertUser({ openId: "driver-upsert", name: "Two" });
    const rows = await db.select().from(schema.users).where(eq(schema.users.openId, "driver-upsert"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Two");
  });
});
