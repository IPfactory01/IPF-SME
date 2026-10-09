/**
 * The engagement room on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`): the engagement
 * starts when the Current State Assessment is paid, joins the owner's business when they create their account, and
 * every read and change is checked on the server: the team by permission and assignment, the client by membership
 * and by what was shared with them. Email and the language model are stubbed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";
import { businessCheckProfiles } from "../fixtures/businessCheckProfiles";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
const mocked = vi.hoisted(() => ({ deliverEmail: vi.fn() }));

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
vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, forgeApiKey: "test-key", calendlyApiToken: "" } }));

import { appRouter } from "@server/routers";
import { createContext } from "@server/_core/context";
import { resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import { hashAdminPassword, OWNER_ADMIN_EMAIL } from "@server/adminSecurity";
import { addWorkingDays } from "@server/engagements";
import { ACCOUNT_SESSION_COOKIE, type PlatformRole } from "@shared/auth";
import { cleanAnswers } from "@shared/businessCheck/engine";
import { ASSESSMENT_TEMPLATE } from "@shared/engagement";
import type { TrpcContext } from "@server/_core/context";

const REMOTE_TEST_TIMEOUT_MS = 90_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueEmail = (label: string) => `${unique(label)}@example.test`;
const PASSWORD = "correct horse 42";

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
type EmailCall = { to: string; subject: string; body: string };

const completeAnswers = cleanAnswers(businessCheckProfiles.growingMaker);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`The engagement room on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function person(roles: PlatformRole[] = [], name = "Test Person") {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name, role: "user", status: "active" }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return user as { id: number; email: string };
    }
    async function signIn(user: { email: string }, internal = false) {
      const b = browser();
      const caller = await b.call();
      if (internal) await caller.account.signInInternal({ email: user.email, password: PASSWORD });
      else await caller.account.signIn({ email: user.email, password: PASSWORD });
      return b;
    }
    const emails = (): EmailCall[] => mocked.deliverEmail.mock.calls.map(call => call[0] as EmailCall);
    const engagementOf = async (businessCheckId: number) => (await db.select().from(schema.engagements).where(eq(schema.engagements.businessCheckId, businessCheckId)))[0];

    async function finishedCheck(label: string) {
      const visitor = browser();
      const email = uniqueEmail(label);
      const { token } = await (await visitor.call()).businessCheck.start({ fullName: `Ada ${label}`, email, whatsapp: "+2348000000001" });
      await (await visitor.call()).businessCheck.submit({ token, answers: { ...completeAnswers, p_name: `Shop ${label}` } });
      const id = (await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.publicToken, token)))[0].id as number;
      return { token, email, id };
    }
    async function payAssessment(businessCheckId: number) {
      const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId, item: "current_state" });
      return (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId });
    }
    async function acceptInvitation(email: string, businessName: string) {
      const invitation = emails().filter(sent => sent.to === email && sent.subject === "Set up your client account on The Shift").at(-1)!;
      const inviteToken = decodeURIComponent(invitation.body.match(/Create your account: (\S+)/)![1].split("/onboarding/")[1]);
      const owner = browser();
      await (await owner.call()).onboarding.accept({ token: inviteToken, email, fullName: `Owner of ${businessName}`, password: PASSWORD, confirmPassword: PASSWORD, businessName });
      return owner;
    }
    /** A paying client with an account: the check, the payment, the invitation accepted. */
    async function client(label: string) {
      const { email, id } = await finishedCheck(label);
      await payAssessment(id);
      const owner = await acceptInvitation(email, `Business ${label}`);
      const engagement = await engagementOf(id);
      return { owner, email, businessCheckId: id, engagementId: engagement.id as number, businessId: engagement.businessId as number };
    }
    /** One of the owner's staff, added directly (the seat invitation is a later step). */
    async function member(businessId: number, access: "full" | "contributor" | null) {
      const user = await person([], "Staff Member");
      const [membership] = await db.insert(schema.businessMemberships).values({ businessId, userId: user.id, role: "member", status: "active" }).returning();
      if (access) await db.insert(schema.businessMemberAccess).values({ membershipId: membership.id, access });
      return { user, browser: await signIn(user) };
    }

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      await db.insert(schema.users).values({ openId: unique("owner"), email: OWNER_ADMIN_EMAIL, role: "admin", name: "Owner" }).onConflictDoNothing();
      const owner = (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
      await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash }).onConflictDoNothing();
      superAdmin = await signIn(owner, true);
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      resetBusinessCheckRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    describe("starting an engagement", () => {
      it("starts one engagement when the Current State Assessment is paid, with the data requests and both calls from the template", async () => {
        const { id } = await finishedCheck("start");
        const confirmed = await payAssessment(id);
        expect(confirmed).toMatchObject({ engagement: "started", invitation: "sent" });

        const engagement = await engagementOf(id);
        expect(engagement).toMatchObject({ stage: "setting_up", businessId: null });
        const tasks = await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, engagement.id));
        expect(tasks.map((task: { title: string }) => task.title)).toEqual(ASSESSMENT_TEMPLATE.dataRequests.map(item => item.title));
        expect(new Set(tasks.map((task: { kind: string; side: string; status: string; dueOn: string }) => `${task.kind}/${task.side}/${task.status}/${task.dueOn}`))).toEqual(new Set([`data_request/client/open/${addWorkingDays(new Date(), 3)}`]));
        const sessions = await db.select().from(schema.engagementSessions).where(eq(schema.engagementSessions.engagementId, engagement.id));
        expect(sessions.map((item: { title: string; scheduledFor: Date | null }) => [item.title, item.scheduledFor])).toEqual([["Current State Assessment call 1", null], ["Current State Assessment call 2", null]]);
      });

      it("joins the owner's business when they create their account", async () => {
        const { email, id } = await finishedCheck("link");
        await payAssessment(id);
        await acceptInvitation(email, "Linked Foods");
        const engagement = await engagementOf(id);
        const business = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, engagement.businessId)))[0];
        expect(business.name).toBe("Linked Foods");
      });

      it("links at once when the owner was invited by hand and has an account before paying", async () => {
        const { email, id } = await finishedCheck("early");
        await (await superAdmin.call()).onboarding.invite({ businessCheckId: id });
        await acceptInvitation(email, "Early Bird Ltd");
        await payAssessment(id);
        const engagement = await engagementOf(id);
        expect(engagement.businessId).not.toBeNull();
      });

      it("starts nothing for the full report, and never a second engagement", async () => {
        const { id } = await finishedCheck("once");
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "full_report" });
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId });
        expect(await engagementOf(id)).toBeUndefined();
        const { paymentRequestId: assessment } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: assessment });
        expect(await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: assessment })).toMatchObject({ changed: false });
        expect(await db.select().from(schema.engagements).where(eq(schema.engagements.businessCheckId, id))).toHaveLength(1);
      });

      it("works out three working days in Lagos, skipping the weekend", () => {
        expect(addWorkingDays(new Date("2026-10-09T10:00:00Z"), 3)).toBe("2026-10-14"); // Friday to Wednesday
        expect(addWorkingDays(new Date("2026-10-12T23:30:00Z"), 3)).toBe("2026-10-16"); // already Tuesday in Lagos
      });
    });

    describe("the team's side: permission and assignment", () => {
      it("shows the desk lead every engagement, an analyst only the ones they are on, and finance none", async () => {
        const { engagementId } = await client("scope");
        const deskLead = await signIn(await person(["desk_lead"]), true);
        const analystUser = await person(["analyst"], "Ola Analyst");
        const analyst = await signIn(analystUser, true);
        const finance = await signIn(await person(["finance"]), true);

        expect((await (await deskLead.call()).engagement.staff.list()).items.map(item => item.id)).toContain(engagementId);
        expect((await (await analyst.call()).engagement.staff.list()).items).toEqual([]);
        await expect((await analyst.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await finance.call()).engagement.staff.list()).rejects.toMatchObject({ code: "FORBIDDEN" });

        await (await deskLead.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        expect((await (await analyst.call()).engagement.staff.list()).items.map(item => item.id)).toEqual([engagementId]);
        const detail = await (await analyst.call()).engagement.staff.detail({ engagementId });
        expect(detail.team).toEqual([expect.objectContaining({ name: "Ola Analyst", role: "analyst", roleLabel: "Analyst" })]);
        expect(detail.can).toEqual({ manage: true, assign: false, review: false });
      });

      it("lets only people with assign_engagements change the team, and only to IP Factory staff", async () => {
        const { engagementId, owner } = await client("assign");
        const analystUser = await person(["analyst"]);
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        const analyst = await signIn(analystUser, true);
        await expect((await analyst.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "lead" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const ownerId = (await (await owner.call()).account.me())!.user.id;
        await expect((await superAdmin.call()).engagement.staff.assign({ engagementId, userId: ownerId, role: "expert" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });

      it("keeps clients out of the team's side", async () => {
        const { owner, engagementId } = await client("no-staff");
        await expect((await owner.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });
    });

    describe("the client's side: membership and what was shared", () => {
      it("shows the owner their journey, what we need from them and their team, and lets them say they sent something", async () => {
        const { owner, engagementId } = await client("room");
        const lead = await person(["desk_lead"], "Lewis Lead");
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: lead.id, role: "lead" });

        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room).toMatchObject({ engagementId, stage: "setting_up", stageLabel: "Getting set up", viewer: { kind: "owner" }, team: [{ name: "Lewis Lead", roleLabel: "Engagement lead" }] });
        expect(room.journey.map(step => [step.label, step.state])).toEqual([["Getting set up", "current"], ["Current State Assessment", "next"], ["The fix", "next"], ["Your plan", "next"]]);
        expect(room.tasks).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length);

        const first = room.tasks[0];
        expect(await (await owner.call()).engagement.client.respondToTask({ taskId: first.id, note: "Sent on WhatsApp" })).toMatchObject({ status: "received" });
        await expect((await owner.call()).engagement.client.respondToTask({ taskId: first.id, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
        const after = (await (await owner.call()).engagement.client.room())!;
        expect(after.tasks.find(task => task.id === first.id)).toMatchObject({ status: "received", statusLabel: "Sent, we are checking", statusNote: "Sent on WhatsApp" });
      });

      it("never shows one client another client's engagement, whatever id they send", async () => {
        const a = await client("iso-a");
        const b = await client("iso-b");
        const roomB = (await (await b.owner.call()).engagement.client.room())!;
        expect(roomB.engagementId).toBe(b.engagementId);
        const bTask = roomB.tasks[0].id;
        await expect((await a.owner.call()).engagement.client.respondToTask({ taskId: bTask, note: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(JSON.stringify(await (await a.owner.call()).engagement.client.room())).not.toContain(`Business iso-b`);
      });

      it("keeps notes from the client until shared, and internal notes always", async () => {
        const { owner, engagementId } = await client("notes");
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId });
        const sessionId = detail.sessions[0].id;
        await (await superAdmin.call()).engagement.staff.saveNotes({ sessionId, clientNotes: "We agreed to look at pricing first.", internalNotes: "Owner may be under-reporting cash sales." });
        const before = (await (await owner.call()).engagement.client.room())!;
        expect(before.sessions[0].notes).toBeNull();

        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.shareNotes({ sessionId, audience: "owner" });
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.sessions[0]).toMatchObject({ notes: "We agreed to look at pricing first.", notesAudience: "owner" });
        // The owner is told by email: the title and a link, never the notes themselves.
        const notice = emails().find(sent => sent.subject === "New in your room: Current State Assessment call 1")!;
        expect(notice.body).toContain("/dashboard");
        expect(notice.body).not.toContain("pricing");
        expect(JSON.stringify(room)).not.toContain("under-reporting");
      });

      it("shows the owner's staff only what the owner shares with them, and contributors only their own requests", async () => {
        const { owner, engagementId, businessId } = await client("staff");
        const full = await member(businessId, null);
        const contributor = await member(businessId, "contributor");
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId });
        const sessionId = detail.sessions[0].id;
        await (await superAdmin.call()).engagement.staff.saveNotes({ sessionId, clientNotes: "Frank notes for the owner.", internalNotes: null });
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.shareNotes({ sessionId, audience: "owner" });
        // Owner-only: the owner's staff are not emailed about something they cannot see.
        expect(emails().map(sent => sent.to)).not.toContain(full.user.email);
        expect(emails().map(sent => sent.to)).not.toContain(contributor.user.email);
        const task = detail.tasks[1];
        await (await superAdmin.call()).engagement.staff.saveTask({ ...task, engagementId, taskId: task.id, assigneeUserId: contributor.user.id, sessionId: null });

        const fullRoom = (await (await full.browser.call()).engagement.client.room())!;
        expect(fullRoom.viewer).toEqual({ kind: "member", access: "full" });
        expect(fullRoom.sessions[0].notes).toBeNull();
        expect(fullRoom.tasks).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length);
        const contributorRoom = (await (await contributor.browser.call()).engagement.client.room())!;
        expect(contributorRoom.tasks.map(item => item.id)).toEqual([task.id]);
        expect(contributorRoom.tasks[0].mine).toBe(true);
        await expect((await contributor.browser.call()).engagement.client.respondToTask({ taskId: detail.tasks[0].id, note: null })).rejects.toMatchObject({ code: "NOT_FOUND" });

        // Only the owner decides: a full member cannot widen it, the owner can.
        await expect((await full.browser.call()).engagement.client.setAudience({ item: "notes", id: sessionId, audience: "business" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await owner.call()).engagement.client.setAudience({ item: "notes", id: sessionId, audience: "business" });
        expect((await (await full.browser.call()).engagement.client.room())!.sessions[0].notes).toBe("Frank notes for the owner.");
        expect((await (await contributor.browser.call()).engagement.client.room())!.sessions[0].notes).toBeNull();
      });
    });

    describe("deliverables", () => {
      it("needs the desk lead's approval before a prescription reaches the client; findings can be shared at once", async () => {
        const { owner, engagementId } = await client("deliverables");
        const analystUser = await person(["analyst"]);
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        const analyst = await signIn(analystUser, true);

        const { deliverableId: findings } = await (await analyst.call()).engagement.staff.saveDeliverable({ engagementId, kind: "findings", title: "What we found", summary: "Cash leaks at the till." });
        await (await analyst.call()).engagement.staff.shareDeliverable({ deliverableId: findings, audience: "owner" });

        const { deliverableId: prescription } = await (await analyst.call()).engagement.staff.saveDeliverable({ engagementId, kind: "prescription", title: "Daily cash count", summary: "Count and record cash every evening." });
        await expect((await analyst.call()).engagement.staff.shareDeliverable({ deliverableId: prescription, audience: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await analyst.call()).engagement.staff.approveDeliverable({ deliverableId: prescription })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await superAdmin.call()).engagement.staff.approveDeliverable({ deliverableId: prescription });
        await (await analyst.call()).engagement.staff.shareDeliverable({ deliverableId: prescription, audience: "owner" });

        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.deliverables.map(item => [item.kindLabel, item.title])).toEqual([["Findings", "What we found"], ["Prescription", "Daily cash count"]]);
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(and(eq(schema.adminAccessAuditEvents.action, "engagement_deliverable_approved"), sql`${schema.adminAccessAuditEvents.details}::jsonb ->> 'deliverableId' = ${String(prescription)}`));
        expect(audits).toHaveLength(1);
      });

      it("lets the owner comment and sign off, and their staff only comment", async () => {
        const { owner, engagementId, businessId } = await client("signoff");
        const full = await member(businessId, "full");
        const { deliverableId } = await (await superAdmin.call()).engagement.staff.saveDeliverable({ engagementId, kind: "problem_statement", title: "The one problem", summary: "Prices do not cover costs." });
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.shareDeliverable({ deliverableId, audience: "business" });
        expect(emails().filter(sent => sent.subject === "New in your room: The one problem").map(sent => sent.to)).toContain(full.user.email);

        await (await full.browser.call()).engagement.client.comment({ deliverableId, body: "Transport is missing from costs." });
        await expect((await full.browser.call()).engagement.client.accept({ deliverableId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await owner.call()).engagement.client.accept({ deliverableId });
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.deliverables[0]).toMatchObject({ accepted: true, comments: [expect.objectContaining({ body: "Transport is missing from costs.", authorName: "Staff Member" })] });

        // Editing a shared deliverable takes it back to draft, out of the client's view, until it is shared again.
        await (await superAdmin.call()).engagement.staff.saveDeliverable({ engagementId, deliverableId, kind: "problem_statement", title: "The one problem", summary: "Prices do not cover transport." });
        expect((await (await owner.call()).engagement.client.room())!.deliverables).toEqual([]);
      });
    });
  });
}
