/**
 * The IPF Business Support funnel as the admin console sees it: Free Business Check -> discovery call -> onboarding.
 * Real application code and the real request context on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via
 * `pnpm test:db`). Email and the language model are stubbed.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";
import { businessCheckProfiles, profileContact } from "../fixtures/businessCheckProfiles";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
const mocked = vi.hoisted(() => ({ deliverEmail: vi.fn(), calendlyOn: false, findBookedCall: vi.fn() }));

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
vi.mock("@server/email", async importOriginal => ({ ...(await importOriginal<typeof import("@server/email")>()), deliverEmail: mocked.deliverEmail }));
vi.mock("@server/_core/llm", () => ({ invokeLLM: () => Promise.reject(new Error("offline")) }));
// Calendly is a third-party API: the lookup is stubbed here; its own rules are tested in test/server/calendly.test.ts.
vi.mock("@server/calendly", async importOriginal => ({
  ...(await importOriginal<typeof import("@server/calendly")>()),
  isCalendlyConfigured: () => mocked.calendlyOn,
  findBookedCall: mocked.findBookedCall,
}));
vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, forgeApiKey: "test-key" } }));

import { appRouter } from "@server/routers";
import { createContext } from "@server/_core/context";
import { resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import { hashAdminPassword, OWNER_ADMIN_EMAIL } from "@server/adminSecurity";
import { ensureOwnerSuperAdminRole, bootstrapOwnerCredential } from "@server/ownerBootstrap";
import { visibleAdminSections } from "@/lib/adminSections";
import { ACCOUNT_SESSION_COOKIE, ONBOARDING_ERRORS, type PlatformRole } from "@shared/auth";
import { cleanAnswers } from "@shared/businessCheck/engine";
import type { TrpcContext } from "@server/_core/context";

// Every test here runs the whole public flow (start, save, submit, request a call) before it asserts, which is dozens of
// network round trips on a real database, so the ceiling there is generous. Local targets keep the default 5 s.
const REMOTE_TEST_TIMEOUT_MS = 90_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueEmail = (label: string) => `${unique(label)}@example.test`;
const PASSWORD = "correct horse 42";

/** A browser: every call builds the REAL request context from its cookies. */
function browser() {
  const jar = new Map<string, string>();
  const ip = `198.51.100.${(counter += 1) % 250}`;
  const call = async () => {
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    const res = { cookie: (name: string, value: string) => void jar.set(name, value), clearCookie: (name: string) => void jar.delete(name) };
    const context = await createContext({ req: { ip, protocol: "https", headers: cookie ? { cookie } : {} }, res } as never);
    return appRouter.createCaller(context as TrpcContext);
  };
  return { call, jar, token: () => jar.get(ACCOUNT_SESSION_COOKIE) };
}
type Browser = ReturnType<typeof browser>;

const completeAnswers = cleanAnswers(businessCheckProfiles.growingMaker);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Business Support admin funnel on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function person(overrides: Record<string, unknown> = {}, roles: PlatformRole[] = []) {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name: "Test Person", role: "user", status: "active", ...overrides }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return user as { id: number; email: string };
    }
    async function signInStaff(user: { email: string }) {
      const b = browser();
      await (await b.call()).account.signInInternal({ email: user.email, password: PASSWORD });
      return b;
    }
    const total = async (table: Parameters<typeof db.select>[0] extends never ? never : unknown) => Number((await db.select({ n: count() }).from(table))[0].n);
    const rowFor = async (token: string) => (await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.publicToken, token)))[0];

    /** A finished check through the real public flow, as the website does it. */
    async function finishedCheck(label = "prospect") {
      const visitor = browser();
      const email = uniqueEmail(label);
      const contact = profileContact("Prospect");
      const { token } = await (await visitor.call()).businessCheck.start({ fullName: `Ada ${label}`, email, whatsapp: "+2348000000001" });
      await (await visitor.call()).businessCheck.saveProgress({ token, answers: { ...completeAnswers, p_name: `${contact.businessName} ${label}` } });
      const response = await (await visitor.call()).businessCheck.submit({ token, answers: { ...completeAnswers, p_name: `${contact.businessName} ${label}` } });
      return { token, email, response, visitor };
    }
    const requestCall = async (visitor: Browser, token: string) => (await visitor.call()).businessCheck.requestNext({ token, choice: "call" });

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      await db.insert(schema.users).values({ openId: unique("owner"), email: OWNER_ADMIN_EMAIL, role: "admin", name: "Owner" }).onConflictDoNothing();
      const owner = (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
      await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash });
      superAdmin = await signInStaff(owner);
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      resetBusinessCheckRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    describe("the Super Admin sees the onboarding area", () => {
      it("resolves every funnel permission centrally and shows Client Onboarding, opening on Business Checks, not the JUMP desk", async () => {
        const status = await (await superAdmin.call()).adminAccess.status();
        expect(status).toMatchObject({ isSuperAdmin: true, isOwner: true, passwordVerified: true, signedInVia: "account" });
        expect(status.permissions).toContain("manage_client_onboarding");
        expect(status.platformPermissions).toEqual(expect.arrayContaining(["manage_client_onboarding", "view_all_businesses", "manage_roles"]));
        // The real server answer is what the page uses to choose its sections.
        const sections = visibleAdminSections(status).map(section => section.id);
        expect(sections).toEqual(["checks", "calls", "onboarding", "engagements", "clients", "team", "jump"]);
        expect(sections[0]).toBe("checks");
      });

      it("recognises a stored Super Admin role even when the person's email is not the configured owner email", async () => {
        const other = await person({}, ["super_admin"]);
        expect(other.email).not.toBe(OWNER_ADMIN_EMAIL);
        const session = await signInStaff(other);
        const status = await (await session.call()).adminAccess.status();
        expect(status).toMatchObject({ isSuperAdmin: true, isOwner: true });
        expect(visibleAdminSections(status).map(section => section.id)).toContain("onboarding");
        // Owner-only actions follow the same decision.
        await expect((await session.call()).adminAccess.listTeam()).resolves.toBeDefined();
      });

      it("explains the production failure: an owner whose email does not match and who has no stored role is only an admin", async () => {
        const unmatched = await person({ role: "admin" });
        const status = await (await (await signInStaff(unmatched)).call()).adminAccess.status();
        expect(status).toMatchObject({ isSuperAdmin: false, isOwner: false });
        expect(visibleAdminSections(status).map(section => section.id)).not.toContain("onboarding");
        // ...and storing the role (what `pnpm owner:bootstrap` now does) is the fix, independent of any environment variable.
        await db.insert(schema.userPlatformRoles).values({ userId: unmatched.id, role: "super_admin" });
        const fixed = await (await (await signInStaff(unmatched)).call()).adminAccess.status();
        expect(visibleAdminSections(fixed).map(section => section.id)).toEqual(["checks", "calls", "onboarding", "engagements", "clients", "team", "jump"]);
      });

      it("stores the role for the real owner idempotently, and bootstrap does so too", async () => {
        const owner = (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
        await db.delete(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, owner.id));
        expect(await ensureOwnerSuperAdminRole(db, { email: OWNER_ADMIN_EMAIL })).toEqual({ action: "ensured-role", userId: owner.id });
        await ensureOwnerSuperAdminRole(db, { email: OWNER_ADMIN_EMAIL });
        expect(await db.select().from(schema.userPlatformRoles).where(and(eq(schema.userPlatformRoles.userId, owner.id), eq(schema.userPlatformRoles.role, "super_admin")))).toHaveLength(1);
        await expect(ensureOwnerSuperAdminRole(db, { email: uniqueEmail("not-owner") })).rejects.toThrow(/recognised owner/);

        await db.delete(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, owner.id));
        try {
          await bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: "Owner-Pass-12345!", replaceExisting: true });
          expect((await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, owner.id))).map((row: { role: string }) => row.role)).toEqual(["super_admin"]);
        } finally {
          // A reset signs the owner out everywhere. This session is shared by every test below, so restore it even if the
          // steps above failed or ran out of time; otherwise one slow call would fail all of its neighbours.
          for (const password of ["Owner-Pass-12345!", PASSWORD]) {
            const restored = browser();
            const ok = await (await restored.call()).account.signInInternal({ email: OWNER_ADMIN_EMAIL, password }).then(() => true, () => false);
            if (ok) {
              superAdmin = restored;
              break;
            }
          }
        }
      });
    });

    describe("a finished Business Check reaches the admin view", () => {
      it("appears in Business Checks with everything the team needs, and creates no user and no business", async () => {
        const usersBefore = await total(schema.users);
        const businessesBefore = await total(schema.businesses);
        const membershipsBefore = await total(schema.businessMemberships);
        const { token, email, response } = await finishedCheck("listed");
        expect(response.emailStatus).toBe("Simulated");

        const rows = await (await superAdmin.call()).businessSupport.checks();
        const row = rows.find((item: { email: string }) => item.email === email)!;
        expect(row).toMatchObject({ fullName: "Ada listed", whatsapp: "+2348000000001", pipelineStage: "qualified_lead", callRequestedAt: null, readiness: expect.any(String), route: expect.any(String), primaryArea: expect.any(Number) });
        expect(row.businessName).toContain("listed");
        expect(row.completedAt).toBeInstanceOf(Date);
        // The long answer and result text never leave in a list.
        expect(JSON.stringify(row)).not.toMatch(/answersJson|resultJson|summaryJson|publicToken/);
        expect(row).not.toHaveProperty("publicToken");
        expect((await rowFor(token)).pipelineStage).toBe("qualified_lead");

        expect(await total(schema.users)).toBe(usersBefore);
        expect(await total(schema.businesses)).toBe(businessesBefore);
        expect(await total(schema.businessMemberships)).toBe(membershipsBefore);
      });

      it("lists people who only left their details too, marked as not finished", async () => {
        const visitor = browser();
        const email = uniqueEmail("partial");
        await (await visitor.call()).businessCheck.start({ fullName: "Partial Person", email });
        const row = (await (await superAdmin.call()).businessSupport.checks()).find((item: { email: string }) => item.email === email)!;
        expect(row).toMatchObject({ pipelineStage: "lead", completedAt: null, readiness: null, route: null, primaryArea: null });
      });
    });

    describe("requesting the discovery call", () => {
      it("sets callRequestedAt, advances the stage, notifies the team, and appears in Discovery Calls, still creating no account", async () => {
        const { token, email, visitor } = await finishedCheck("calls");
        expect(await (await superAdmin.call()).businessSupport.discoveryCalls().then((rows: { email: string }[]) => rows.some(row => row.email === email))).toBe(false);
        const usersBefore = await total(schema.users);
        const businessesBefore = await total(schema.businesses);
        mocked.deliverEmail.mockClear();

        expect(await requestCall(visitor, token)).toEqual({ success: true, choice: "call" });
        const stored = await rowFor(token);
        expect(stored.callRequestedAt).toBeInstanceOf(Date);
        expect(stored.pipelineStage).toBe("call_booked");
        expect(stored.callScheduledFor).toBeNull();
        expect(mocked.deliverEmail).toHaveBeenCalledTimes(1);
        expect(mocked.deliverEmail.mock.calls[0][0].subject).toMatch(/asked for a free discovery call/);

        const call = (await (await superAdmin.call()).businessSupport.discoveryCalls()).find((item: { email: string }) => item.email === email)!;
        expect(call).toMatchObject({ pipelineStage: "call_booked", callScheduledFor: null, whatsapp: "+2348000000001" });
        expect(call.callRequestedAt).toBeInstanceOf(Date);
        expect(await total(schema.users)).toBe(usersBefore);
        expect(await total(schema.businesses)).toBe(businessesBefore);
        // Asking again changes nothing and does not notify twice.
        mocked.deliverEmail.mockClear();
        await requestCall(visitor, token);
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
      });

      it("keeps the filter honest: Business Checks lists everyone, Discovery Calls only those who asked", async () => {
        const asked = await finishedCheck("asked");
        const silent = await finishedCheck("silent");
        await requestCall(asked.visitor, asked.token);
        const checks = (await (await superAdmin.call()).businessSupport.checks()).map((row: { email: string }) => row.email);
        const calls = (await (await superAdmin.call()).businessSupport.discoveryCalls()).map((row: { email: string }) => row.email);
        expect(checks).toEqual(expect.arrayContaining([asked.email, silent.email]));
        expect(calls).toContain(asked.email);
        expect(calls).not.toContain(silent.email);
      });
    });

    describe("recording the discovery call", () => {
      async function requested(label: string) {
        const check = await finishedCheck(label);
        await requestCall(check.visitor, check.token);
        return { ...check, id: (await rowFor(check.token)).id as number };
      }

      it("records the agreed time without changing the owner's request, and audits it", async () => {
        const { id, token } = await requested("schedule");
        const before = await rowFor(token);
        const when = new Date(Date.now() + 3 * 86_400_000);
        await (await superAdmin.call()).businessSupport.scheduleCall({ businessCheckId: id, scheduledFor: when });
        const after = await rowFor(token);
        expect(after.callScheduledFor.getTime()).toBe(when.getTime());
        expect(after.callRequestedAt.getTime()).toBe(before.callRequestedAt.getTime());
        expect(after.pipelineStage).toBe("call_booked");
        const events = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "business_check_call_scheduled"));
        expect(events.some((event: { details: string }) => event.details.includes(`"businessCheckId":${id}`))).toBe(true);
      });

      it.each([
        ["fit", "opportunity"],
        ["refer", "referred"],
        ["decline", "lost"],
      ] as const)("records %s as the existing %s stage and creates no account", async (outcome, stage) => {
        const { id, token } = await requested(`outcome-${outcome}`);
        const usersBefore = await total(schema.users);
        const businessesBefore = await total(schema.businesses);
        expect(await (await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: id, outcome })).toEqual({ success: true, pipelineStage: stage });
        expect((await rowFor(token)).pipelineStage).toBe(stage);
        expect(await total(schema.users)).toBe(usersBefore);
        expect(await total(schema.businesses)).toBe(businessesBefore);
        const events = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "business_check_call_outcome"));
        expect(events.some((event: { details: string }) => event.details.includes(`"to":"${stage}"`) && event.details.includes(`"businessCheckId":${id}`))).toBe(true);
      });

      it("will not record anything for a check that never asked for a call, an unknown check, or a business already won", async () => {
        const silent = await finishedCheck("never-asked");
        const silentId = (await rowFor(silent.token)).id;
        await expect((await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: silentId, outcome: "fit" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await superAdmin.call()).businessSupport.scheduleCall({ businessCheckId: silentId, scheduledFor: new Date(Date.now() + 86_400_000) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: 2_000_000_000, outcome: "fit" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const won = await requested("won");
        await db.update(schema.businessChecks).set({ pipelineStage: "won" }).where(eq(schema.businessChecks.id, won.id));
        await expect((await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: won.id, outcome: "decline" })).rejects.toMatchObject({ code: "CONFLICT" });
        expect((await rowFor(won.token)).pipelineStage).toBe("won");
      });

      it("rejects an invalid outcome or a bad time", async () => {
        const { id } = await requested("invalid");
        await expect((await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: id, outcome: "won" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await superAdmin.call()).businessSupport.scheduleCall({ businessCheckId: id, scheduledFor: "not a date" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });
    });

    describe("moving a check through the pipeline", () => {
      it("moves a check to any later stage, including Won and Nurture, and shows each move with who, from, to and the note", async () => {
        const check = await finishedCheck("pipeline");
        const id = (await rowFor(check.token)).id as number;
        await requestCall(check.visitor, check.token);
        await (await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: id, outcome: "fit" });
        expect(await (await superAdmin.call()).businessSupport.setStage({ businessCheckId: id, stage: "nurture", note: " Not ready to pay until January " })).toEqual({ success: true, pipelineStage: "nurture", changed: true });
        expect(await (await superAdmin.call()).businessSupport.setStage({ businessCheckId: id, stage: "won" })).toMatchObject({ pipelineStage: "won", changed: true });
        expect((await rowFor(check.token)).pipelineStage).toBe("won");

        const detail = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id });
        expect(detail.stageHistory.map(event => [event.action, event.from, event.to])).toEqual([
          ["business_check_stage_changed", "nurture", "won"],
          ["business_check_stage_changed", "opportunity", "nurture"],
          ["business_check_call_outcome", "call_booked", "opportunity"],
        ]);
        expect(detail.stageHistory[1]).toMatchObject({ note: "Not ready to pay until January", by: "Owner" });
        expect(detail.stageHistory[0].note).toBeNull();
      });

      it("does nothing when the stage is unchanged, never reopens a won business, and never moves a check back to Lead", async () => {
        const check = await finishedCheck("pipeline-rules");
        const id = (await rowFor(check.token)).id as number;
        expect(await (await superAdmin.call()).businessSupport.setStage({ businessCheckId: id, stage: "qualified_lead" })).toMatchObject({ changed: false });
        await expect((await superAdmin.call()).businessSupport.setStage({ businessCheckId: id, stage: "lead" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await (await superAdmin.call()).businessSupport.setStage({ businessCheckId: id, stage: "won" });
        await expect((await superAdmin.call()).businessSupport.setStage({ businessCheckId: id, stage: "lost" })).rejects.toMatchObject({ code: "CONFLICT" });
        expect((await rowFor(check.token)).pipelineStage).toBe("won");
        await expect((await superAdmin.call()).businessSupport.setStage({ businessCheckId: 2_000_000_000, stage: "won" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const events = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "business_check_stage_changed"));
        expect(events.filter((event: { details: string }) => event.details.includes(`"businessCheckId":${id}`))).toHaveLength(1);
      });

      it("refuses everyone without the funnel permission", async () => {
        const check = await finishedCheck("pipeline-refused");
        const id = (await rowFor(check.token)).id as number;
        const bareAdmin = await signInStaff(await person({ role: "admin" }));
        const deskLead = await signInStaff(await person({}, ["desk_lead"]));
        for (const b of [browser(), bareAdmin, deskLead]) {
          await expect((await b.call()).businessSupport.setStage({ businessCheckId: id, stage: "won" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
        expect((await rowFor(check.token)).pipelineStage).toBe("qualified_lead");
      });
    });

    describe("filling in times from Calendly", () => {
      async function waitingCall(label: string) {
        const check = await finishedCheck(label);
        await requestCall(check.visitor, check.token);
        return { ...check, id: (await rowFor(check.token)).id as number };
      }
      beforeEach(() => {
        mocked.calendlyOn = true;
        mocked.findBookedCall.mockReset();
        mocked.findBookedCall.mockResolvedValue(null);
      });
      afterEach(() => {
        mocked.calendlyOn = false;
      });

      it("finds the booking for a call that has no time yet when admin opens, saves it once, and shows it as booked", async () => {
        const call = await waitingCall("calendly-sync");
        const when = new Date("2026-10-14T09:00:00Z");
        mocked.findBookedCall.mockImplementation(async (email: string) => (email === call.email ? when : null));
        const listed = (await (await superAdmin.call()).businessSupport.checks()).find(row => row.id === call.id)!;
        expect(listed.callScheduledFor).toEqual(when);
        expect((await rowFor(call.token)).callScheduledFor.getTime()).toBe(when.getTime());
        const events = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "business_check_call_booked"));
        expect(events.some((event: { details: string }) => event.details.includes(`"businessCheckId":${call.id}`) && event.details.includes("calendly_lookup"))).toBe(true);

        // Once saved, it is not looked up again.
        mocked.findBookedCall.mockClear();
        await (await superAdmin.call()).businessSupport.discoveryCalls();
        expect(mocked.findBookedCall).not.toHaveBeenCalledWith(call.email);
      });

      it("leaves calls alone that already have a time, have moved past the call stage, or have no booking", async () => {
        const moved = await waitingCall("calendly-moved");
        await (await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: moved.id, outcome: "fit" });
        const unbooked = await waitingCall("calendly-none");
        await (await superAdmin.call()).businessSupport.checks();
        expect(mocked.findBookedCall).not.toHaveBeenCalledWith(moved.email);
        expect(mocked.findBookedCall).toHaveBeenCalledWith(unbooked.email);
        expect((await rowFor(unbooked.token)).callScheduledFor).toBeNull();
      });

      it("does nothing without the Calendly token", async () => {
        mocked.calendlyOn = false;
        const call = await waitingCall("calendly-off");
        await (await superAdmin.call()).businessSupport.checks();
        expect(mocked.findBookedCall).not.toHaveBeenCalled();
        expect((await rowFor(call.token)).callScheduledFor).toBeNull();
      });
    });

    describe("the record drawer's data (read-only)", () => {
      it("returns the saved result for one check exactly as stored, without the answers or the public token", async () => {
        const { token, email } = await finishedCheck("detail");
        const id = (await rowFor(token)).id;
        const detail = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id });
        expect(detail).toMatchObject({ id, email, pipelineStage: "qualified_lead", invitationStatus: null, whatsapp: "+2348000000001" });
        expect(detail.summary).toMatchObject({ found: expect.any(String), think: expect.any(String), offerings: expect.any(Array) });
        expect(detail.outline!.length).toBeGreaterThan(0);
        expect(detail.outline![0]).toMatchObject({ area: expect.any(Number), name: expect.any(String), health: expect.stringMatching(/clear|watch|stuck/) });
        expect(detail.primaryAreaNumber).toEqual(expect.any(Number));
        expect(JSON.stringify(detail)).not.toMatch(/answersJson|publicToken|resultJson|summaryJson/);
        expect(detail).not.toHaveProperty("publicToken");
      });

      it("returns the stored summary, not a fresh calculation", async () => {
        const { token } = await finishedCheck("stored");
        const row = await rowFor(token);
        const edited = { ...JSON.parse(row.summaryJson), found: "A sentence the rules would never write.", offerings: [{ id: "x", name: "Stored Offering", why: "Stored reason." }] };
        await db.update(schema.businessChecks).set({ summaryJson: JSON.stringify(edited) }).where(eq(schema.businessChecks.id, row.id));
        const detail = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: row.id });
        expect(detail.summary!.found).toBe("A sentence the rules would never write.");
        expect(detail.summary!.offerings).toEqual([{ id: "x", name: "Stored Offering", why: "Stored reason." }]);
      });

      it("copes with a check that was never finished, and with damaged stored JSON", async () => {
        const visitor = browser();
        const email = uniqueEmail("unfinished-detail");
        const { token } = await (await visitor.call()).businessCheck.start({ fullName: "Not Done", email });
        const row = await rowFor(token);
        const unfinished = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: row.id });
        expect(unfinished).toMatchObject({ completedAt: null, summary: null, outline: null, primaryAreaNumber: null, pipelineStage: "lead" });
        await db.update(schema.businessChecks).set({ resultJson: "{not json", summaryJson: "also not json" }).where(eq(schema.businessChecks.id, row.id));
        const damaged = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: row.id });
        expect(damaged).toMatchObject({ summary: null, outline: null });
      });

      it("rejects an unknown check and refuses everyone without the funnel permission", async () => {
        await expect((await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: 2_000_000_000 })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const client = await person();
        const business = (await db.insert(schema.businesses).values({ name: "Client Co", slug: unique("slug"), createdByUserId: client.id }).returning())[0];
        await db.insert(schema.businessMemberships).values({ businessId: business.id, userId: client.id, role: "owner" });
        const clientSession = browser();
        await (await clientSession.call()).account.signIn({ email: client.email, password: PASSWORD });
        const bareAdmin = await signInStaff(await person({ role: "admin" }));
        const deskLead = await signInStaff(await person({}, ["desk_lead"]));
        for (const b of [clientSession, browser(), bareAdmin, deskLead]) {
          await expect((await b.call()).businessSupport.checkDetail({ businessCheckId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      });

      it("tells both lists where each prospect's onboarding link stands", async () => {
        const { token, email, visitor } = await finishedCheck("link-state");
        await requestCall(visitor, token);
        const id = (await rowFor(token)).id;
        await (await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: id, outcome: "fit" });
        const stateIn = async () => ({
          checks: (await (await superAdmin.call()).businessSupport.checks()).find((row: { email: string }) => row.email === email)!.invitationStatus,
          calls: (await (await superAdmin.call()).businessSupport.discoveryCalls()).find((row: { email: string }) => row.email === email)!.invitationStatus,
        });
        expect(await stateIn()).toEqual({ checks: null, calls: null });
        await (await superAdmin.call()).onboarding.invite({ businessCheckId: id });
        expect(await stateIn()).toEqual({ checks: "pending", calls: "pending" });
      });

      it("tells the admin header who is signed in, by name", async () => {
        const status = await (await superAdmin.call()).adminAccess.status();
        expect(status.name).toEqual(expect.any(String));
        expect(status.email).toBe(OWNER_ADMIN_EMAIL);
      });
    });

    describe("onboarding from the funnel", () => {
      it("shows the call, the stage and the link state beside each business check, and a link can be generated and stays email-bound", async () => {
        const { token, email, visitor } = await finishedCheck("onboard");
        await requestCall(visitor, token);
        const id = (await rowFor(token)).id;
        await (await superAdmin.call()).businessSupport.recordOutcome({ businessCheckId: id, outcome: "fit" });

        const before = (await (await superAdmin.call()).onboarding.candidates()).find((item: { id: number }) => item.id === id)!;
        expect(before).toMatchObject({ email, pipelineStage: "opportunity", invitationStatus: null });
        expect(before.callRequestedAt).toBeInstanceOf(Date);

        const issued = await (await superAdmin.call()).onboarding.invite({ businessCheckId: id });
        expect(issued.invitationUrl).toMatch(/\/onboarding\/[A-Za-z0-9_-]{43}$/);
        expect(issued.deliveryStatus).toBe("Simulated");
        const after = (await (await superAdmin.call()).onboarding.candidates()).find((item: { id: number }) => item.id === id)!;
        expect(after.invitationStatus).toBe("pending");

        const inviteToken = decodeURIComponent(issued.invitationUrl.split("/onboarding/")[1]);
        const intruder = browser();
        await expect((await intruder.call()).onboarding.accept({ token: inviteToken, email: uniqueEmail("someone-else"), fullName: "Someone Else", password: PASSWORD, confirmPassword: PASSWORD, businessName: "Not Theirs" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: ONBOARDING_ERRORS.emailMismatch });
        // Only the invited address creates the account, and only then does a business exist.
        const clientBrowser = browser();
        await (await clientBrowser.call()).onboarding.accept({ token: inviteToken, email: email.toUpperCase(), fullName: "Ada Onboard", password: PASSWORD, confirmPassword: PASSWORD, businessName: "Ada Onboard Ltd" });
        const accepted = (await (await superAdmin.call()).onboarding.candidates()).find((item: { id: number }) => item.id === id)!;
        expect(accepted.invitationStatus).toBe("accepted");
      });

      it("lists onboarded clients, and never a business check, in Clients", async () => {
        const { token, email, visitor } = await finishedCheck("clients");
        const unonboarded = await finishedCheck("not-a-client");
        await requestCall(visitor, token);
        const id = (await rowFor(token)).id;
        const issued = await (await superAdmin.call()).onboarding.invite({ businessCheckId: id });
        const clientBrowser = browser();
        await (await clientBrowser.call()).onboarding.accept({ token: decodeURIComponent(issued.invitationUrl.split("/onboarding/")[1]), email, fullName: "Client Person", password: PASSWORD, confirmPassword: PASSWORD, businessName: "Listed Client Co" });

        const clients = await (await superAdmin.call()).businessSupport.clients();
        const mine = clients.filter(row => row.email === email);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ businessName: "Listed Client Co", userName: "Client Person", role: "owner", membershipStatus: "active" });
        expect(clients.map(row => row.email)).not.toContain(unonboarded.email);
        const metrics = await (await superAdmin.call()).onboarding.metrics();
        expect(metrics.businessChecks).toBeGreaterThan(metrics.businesses);
      });
    });

    describe("who may use these admin procedures", () => {
      const everyAdminProcedure = async (b: Browser) => {
        const caller = await b.call();
        return [
          () => caller.businessSupport.checks(),
          () => caller.businessSupport.discoveryCalls(),
          () => caller.businessSupport.clients(),
          () => caller.businessSupport.scheduleCall({ businessCheckId: 1, scheduledFor: new Date() }),
          () => caller.businessSupport.recordOutcome({ businessCheckId: 1, outcome: "fit" }),
          () => caller.onboarding.candidates(),
          () => caller.onboarding.invite({ businessCheckId: 1 }),
        ];
      };

      it("refuses an ordinary client, a visitor, and an administrator with no responsibilities", async () => {
        const client = await person();
        const business = (await db.insert(schema.businesses).values({ name: "Client Co", slug: unique("slug"), createdByUserId: client.id }).returning())[0];
        await db.insert(schema.businessMemberships).values({ businessId: business.id, userId: client.id, role: "owner" });
        const clientSession = browser();
        await (await clientSession.call()).account.signIn({ email: client.email, password: PASSWORD });
        const bareAdmin = await signInStaff(await person({ role: "admin" }));
        for (const b of [clientSession, browser(), bareAdmin]) {
          for (const attempt of await everyAdminProcedure(b)) await expect(attempt()).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      });

      it("grants funnel and client views separately: onboarding permission is not client-list permission, and the reverse", async () => {
        const onboardingOnly = await person({ role: "admin" });
        await db.insert(schema.adminPermissionProfiles).values({ userId: onboardingOnly.id, permissionsJson: JSON.stringify(["manage_client_onboarding"]) });
        const a = await (await signInStaff(onboardingOnly)).call();
        await expect(a.businessSupport.checks()).resolves.toBeDefined();
        await expect(a.businessSupport.discoveryCalls()).resolves.toBeDefined();
        await expect(a.businessSupport.clients()).rejects.toMatchObject({ code: "FORBIDDEN" });

        const deskLead = await signInStaff(await person({}, ["desk_lead"]));
        const d = await deskLead.call();
        await expect(d.businessSupport.clients()).resolves.toBeDefined();
        await expect(d.businessSupport.checks()).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(visibleAdminSections(await d.adminAccess.status()).map(section => section.id)).toEqual(["engagements", "clients"]);
        expect(visibleAdminSections(await a.adminAccess.status()).map(section => section.id)).toEqual(["checks", "calls", "onboarding"]);
      });

      it("keeps the legacy JUMP desk working for the Super Admin", async () => {
        const caller = await superAdmin.call();
        await expect(caller.registration.list({})).resolves.toBeDefined();
        await expect(caller.informationSession.attendance()).resolves.toBeDefined();
        await expect(caller.paymentInstructions.templateLibrary()).resolves.toBeDefined();
      });
    });

    describe("an email problem never blocks the Business Check", () => {
      const submitWith = async (label: string, deliver: () => Promise<unknown>) => {
        mocked.deliverEmail.mockReset();
        mocked.deliverEmail.mockImplementation(deliver);
        return finishedCheck(label);
      };

      it("tells the page the truth about delivery: Sent only when it was sent", async () => {
        const sent = await submitWith("email-sent", async () => ({ status: "Sent", providerMessageId: "id-1" }));
        expect(sent.response.emailStatus).toBe("Sent");
        const simulated = await submitWith("email-simulated", async () => ({ status: "Simulated", reason: "not_configured" }));
        expect(simulated.response.emailStatus).toBe("Simulated");
        const failed = await submitWith("email-failed", async () => ({ status: "Failed", reason: "refused" }));
        expect(failed.response.emailStatus).toBe("Failed");
        for (const check of [sent, simulated, failed]) expect((await rowFor(check.token)).completedAt).toBeInstanceOf(Date);
      });

      it("completes and saves the result even when the email layer throws", async () => {
        const broken = await submitWith("email-throws", async () => { throw new Error("provider down"); });
        expect(broken.response.emailStatus).toBe("Failed");
        const row = await rowFor(broken.token);
        expect(row.completedAt).toBeInstanceOf(Date);
        expect(row).toMatchObject({ pipelineStage: "qualified_lead", notificationStatus: "Failed" });
        expect(row.resultJson).toBeTruthy();
      });

      it("returns the stored delivery status when a finished check is submitted again, without emailing again", async () => {
        const sent = await submitWith("email-resubmit", async () => ({ status: "Sent", providerMessageId: "id-2" }));
        mocked.deliverEmail.mockClear();
        const again = await (await sent.visitor.call()).businessCheck.submit({ token: sent.token, answers: completeAnswers });
        expect(again.emailStatus).toBe("Sent");
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
      });
    });
  });
}
