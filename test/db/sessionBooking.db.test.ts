/**
 * Current State Assessment Sessions booked on Calendly appear on the engagement by themselves, on PostgreSQL (PGlite on
 * every run, plus TEST_DATABASE_URL via `pnpm test:db`). Calendly itself is stubbed; test/server/calendly.test.ts
 * covers how its answers are read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";

const calendly = vi.hoisted(() => ({ configured: true, bookings: [] as { start: Date; end: Date | null; joinUrl: string | null }[], asked: [] as { email: string; since: Date }[] }));
vi.mock("@server/calendly", async importOriginal => ({
  ...(await importOriginal<typeof import("@server/calendly")>()),
  isSessionBookingConfigured: () => calendly.configured,
  findSessionBookings: async (email: string, since: Date) => {
    calendly.asked.push({ email, since });
    return calendly.bookings;
  },
}));

import { resetSessionSyncForTests, syncSessionBookings } from "@server/engagements";

const targets = [
  { name: "PGlite", enabled: true, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];
let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const at = (iso: string) => new Date(iso);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Session bookings from Calendly on ${target.name}`, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    async function engagement() {
      const [check] = await db.insert(schema.businessChecks).values({ publicToken: unique("check"), fullName: "Ada Example", email: `${unique("ada")}@example.test`, businessName: "Ada Foods", stage: "operating", answersJson: "{}" }).returning();
      const [row] = await db.insert(schema.engagements).values({ businessCheckId: check.id, createdAt: at("2026-10-16T08:00:00Z") }).returning();
      for (const [order, title] of [[7, "Current State Assessment Session 1"], [6, "Current State Assessment Session 2"]] as const) {
        await db.insert(schema.engagementSessions).values({ engagementId: row.id, kind: "assessment_call", title, durationMinutes: 90, weekNumber: title.endsWith("1") ? 1 : 2, sortOrder: order });
      }
      return { engagement: row as { id: number; createdAt: Date }, email: check.email as string };
    }
    const sessionsOf = async (engagementId: number) => db.select().from(schema.engagementSessions).where(eq(schema.engagementSessions.engagementId, engagementId)).orderBy(asc(schema.engagementSessions.weekNumber));

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      resetSessionSyncForTests();
      calendly.configured = true;
      calendly.bookings = [];
      calendly.asked = [];
    });

    it("fills Session 1 then Session 2 from the owner's bookings, in order, with the length and the meeting link", async () => {
      const { engagement: row, email } = await engagement();
      calendly.bookings = [
        { start: at("2026-10-23T09:00:00Z"), end: at("2026-10-23T10:30:00Z"), joinUrl: "https://zoom.example.test/j/1" },
        { start: at("2026-10-30T09:00:00Z"), end: at("2026-10-30T10:00:00Z"), joinUrl: null },
      ];
      expect(await syncSessionBookings(db, row, email)).toBe(2);
      const [one, two] = await sessionsOf(row.id);
      expect(one).toMatchObject({ title: "Current State Assessment Session 1", scheduledFor: at("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1" });
      expect(two).toMatchObject({ title: "Current State Assessment Session 2", scheduledFor: at("2026-10-30T09:00:00Z"), durationMinutes: 60, meetingLink: null });
      // Asked for the owner's bookings from a day before the engagement began.
      expect(calendly.asked[0]).toEqual({ email, since: at("2026-10-15T08:00:00Z") });
      const audit = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_session_booked"));
      expect(audit.filter((event: { actorUserId: number | null }) => event.actorUserId === null).length).toBeGreaterThanOrEqual(2);
    });

    it("leaves a Session the team has already timed alone, and does not use the same booking twice", async () => {
      const { engagement: row, email } = await engagement();
      const [first] = await sessionsOf(row.id);
      await db.update(schema.engagementSessions).set({ scheduledFor: at("2026-10-23T09:00:00Z"), meetingLink: "https://meet.example.test/team" }).where(eq(schema.engagementSessions.id, first.id));
      calendly.bookings = [
        { start: at("2026-10-23T09:00:00Z"), end: at("2026-10-23T10:30:00Z"), joinUrl: "https://zoom.example.test/j/1" },
        { start: at("2026-10-30T09:00:00Z"), end: at("2026-10-30T10:30:00Z"), joinUrl: "https://zoom.example.test/j/2" },
      ];
      expect(await syncSessionBookings(db, row, email)).toBe(1);
      const [one, two] = await sessionsOf(row.id);
      expect(one.meetingLink).toBe("https://meet.example.test/team");
      expect(two).toMatchObject({ scheduledFor: at("2026-10-30T09:00:00Z"), meetingLink: "https://zoom.example.test/j/2" });
    });

    it("fills only what was booked, asks Calendly at most every 15 seconds, and does nothing when booking is not set up", async () => {
      const { engagement: row, email } = await engagement();
      calendly.bookings = [{ start: at("2026-10-23T09:00:00Z"), end: null, joinUrl: null }];
      const now = Date.now();
      expect(await syncSessionBookings(db, row, email, now)).toBe(1);
      const [, two] = await sessionsOf(row.id);
      expect(two.scheduledFor).toBeNull();

      calendly.bookings = [{ start: at("2026-10-23T09:00:00Z"), end: null, joinUrl: null }, { start: at("2026-10-30T09:00:00Z"), end: null, joinUrl: null }];
      expect(await syncSessionBookings(db, row, email, now + 5_000)).toBe(0);
      expect(await syncSessionBookings(db, row, email, now + 16_000)).toBe(1);

      const other = await engagement();
      calendly.configured = false;
      expect(await syncSessionBookings(db, other.engagement, other.email)).toBe(0);
      expect(calendly.asked.some(item => item.email === other.email)).toBe(false);
    });
  });
}
