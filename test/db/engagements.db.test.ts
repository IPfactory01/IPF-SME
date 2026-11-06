/**
 * The engagement room on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`): the engagement
 * starts when the Business Review is paid, joins the owner's business when they create their account, and
 * every read and change is checked on the server: the team by permission and assignment, the client by membership
 * and by what was shared with them. Email and the language model are stubbed.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";
import { businessCheckProfiles } from "../fixtures/businessCheckProfiles";
import { sampleIntake } from "../fixtures/reportIntake";

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
import { ENV } from "@server/_core/env";
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
      it("starts one engagement when the Business Review is paid, with the data requests and both calls from the template", async () => {
        const { id } = await finishedCheck("start");
        const confirmed = await payAssessment(id);
        expect(confirmed).toMatchObject({ engagement: "started", invitation: "sent" });

        const engagement = await engagementOf(id);
        expect(engagement).toMatchObject({ stage: "setting_up", businessId: null });
        const tasks = await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, engagement.id));
        expect(tasks.map((task: { title: string }) => task.title)).toEqual([...ASSESSMENT_TEMPLATE.dataRequests, ...ASSESSMENT_TEMPLATE.teamActions].map(item => item.title));
        // The Work Plan: week 1 due in three working days, week 2 in eight; the team's actions sit beside the client's requests.
        expect(new Set(tasks.map((task: { kind: string; side: string; status: string; dueOn: string }) => `${task.kind}/${task.side}/${task.status}/${task.dueOn}`))).toEqual(new Set([`data_request/client/open/${addWorkingDays(new Date(), 3)}`, `data_request/client/open/${addWorkingDays(new Date(), 8)}`, `action/ipf/open/${addWorkingDays(new Date(), 3)}`, `action/ipf/open/${addWorkingDays(new Date(), 8)}`]));
        const sessions = await db.select().from(schema.engagementSessions).where(eq(schema.engagementSessions.engagementId, engagement.id));
        expect(sessions.map((item: { title: string; scheduledFor: Date | null }) => [item.title, item.scheduledFor])).toEqual([["Business Review Session 1", null], ["Business Review Session 2", null]]);
        // Each call carries its agenda from the template, so the client sees what the call is for before it is booked.
        expect(sessions.map((item: { agenda: string | null }) => item.agenda)).toEqual(ASSESSMENT_TEMPLATE.sessions.map(item => item.agenda));
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
        await (await superAdmin.call()).onboarding.invite({ businessCheckId: id, overrideReason: "Invited early by agreement" });
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

      it("lists a paid assessment that has no engagement (paid before migration 0008), and lets the desk lead start it", async () => {
        const { email, id } = await finishedCheck("catch-up");
        await payAssessment(id);
        await acceptInvitation(email, "Catch Up Ltd");
        // As if the payment had been confirmed while the engagement tables were missing.
        await db.delete(schema.engagements).where(eq(schema.engagements.businessCheckId, id));
        const deskLead = await signIn(await person(["desk_lead"]), true);
        const analyst = await signIn(await person(["analyst"]), true);

        expect((await (await deskLead.call()).engagement.staff.awaitingStart()).map(item => item.businessCheckId)).toContain(id);
        expect(await (await analyst.call()).engagement.staff.awaitingStart()).toEqual([]);
        await expect((await analyst.call()).engagement.staff.start({ businessCheckId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const started = await (await deskLead.call()).engagement.staff.start({ businessCheckId: id });
        expect(started.created).toBe(true);
        const engagement = await engagementOf(id);
        expect(engagement.businessId).not.toBeNull();
        expect(await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, engagement.id))).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length + ASSESSMENT_TEMPLATE.teamActions.length);
        expect((await (await deskLead.call()).engagement.staff.awaitingStart()).map(item => item.businessCheckId)).not.toContain(id);
        expect(await (await deskLead.call()).engagement.staff.start({ businessCheckId: id })).toMatchObject({ engagementId: engagement.id, created: false });
      });

      it("refuses to start an engagement for an assessment that is not paid", async () => {
        const { id } = await finishedCheck("unpaid");
        await expect((await superAdmin.call()).engagement.staff.start({ businessCheckId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("works out three working days in Lagos, skipping the weekend", () => {
        expect(addWorkingDays(new Date("2026-10-09T10:00:00Z"), 3)).toBe("2026-10-14"); // Friday to Wednesday
        expect(addWorkingDays(new Date("2026-10-12T23:30:00Z"), 3)).toBe("2026-10-16"); // already Tuesday in Lagos
      });
    });

    describe("one client, many projects, and the next problem", () => {
      it("adds a Pitch Deck for an existing client: no new invitation, its Data Request from the service, both projects in the room", async () => {
        const { owner, engagementId: review, businessId } = await client("two-projects");
        mocked.deliverEmail.mockClear();
        // A service type needs its service; the Business Review's own type does not take one.
        await expect((await superAdmin.call()).engagement.staff.createDirect({ type: "done_for_you", startedOn: "2026-11-09", businessId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await superAdmin.call()).engagement.staff.createDirect({ type: "done_for_you", service: "six_week_fix", startedOn: "2026-11-09", businessId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const deck = await (await superAdmin.call()).engagement.staff.createDirect({ type: "done_for_you", service: "pitch_deck", startedOn: "2026-11-09", businessId });
        expect(deck).toMatchObject({ hasAccount: true, invitationUrl: null });
        expect(emails()).toEqual([]);
        expect((await (await superAdmin.call()).engagement.staff.clientBusinesses()).map(item => item.id)).toContain(businessId);

        // The room opens on the newest open project, lists both, and opens either by id.
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room).toMatchObject({ engagementId: deck.engagementId, type: "done_for_you", service: "pitch_deck", title: "Pitch Deck", serviceStep: 1 });
        expect(room.projects.map(item => [item.title, item.current])).toEqual([["Pitch Deck", true], ["Business Review", false]]);
        expect(room.tasks.filter(task => task.kind === "data_request").map(task => task.title)).toEqual(["Sales records", "Your main costs", "Any plan, deck or notes", "What do you want this work to help you decide or do?", "Who will you present to, and what do you want them to do?", "What are you asking for, and what will you do with it?"]);
        expect(room.sessions.map(item => item.title)).toEqual(["Kick-off", "Handover"]);
        // A later project still shows what the Business Health Check found.
        expect(room.check).not.toBeNull();
        const back = (await (await owner.call()).engagement.client.room({ engagementId: review }))!;
        expect(back).toMatchObject({ engagementId: review, type: "business_review", serviceStep: null });

        // The desk's list names the service; the stage is open or closed.
        const listed = (await (await superAdmin.call()).engagement.staff.list()).items.find(item => item.id === deck.engagementId)!;
        expect(listed).toMatchObject({ typeLabel: "Pitch Deck", stageLabel: "Open" });

        // Another business's project is never reachable by changing the id, for the room or the drop box.
        const other = await client("two-projects-other");
        await expect((await other.owner.call()).engagement.client.room({ engagementId: deck.engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("takes a client's request for another service to the desk, who open it from the request; others cannot see or handle it", async () => {
        const { owner, engagementId, businessId } = await client("next-problem");
        mocked.deliverEmail.mockClear();
        const asked = await (await owner.call()).engagement.client.requestService({ service: "pitch_deck", note: "Meeting an investor in December.", engagementId });
        expect(asked).toMatchObject({ success: true, already: false });
        expect(emails()).toEqual([expect.objectContaining({ to: "info@ipfactory.co", subject: expect.stringContaining("asked for the Pitch Deck") })]);
        // Asking twice keeps one request.
        expect(await (await owner.call()).engagement.client.requestService({ service: "pitch_deck", note: null })).toMatchObject({ already: true });
        await expect((await owner.call()).engagement.client.requestService({ service: "not_a_service", note: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect((await (await owner.call()).engagement.client.room())!.requests.map(item => item.serviceName)).toEqual(["Pitch Deck"]);

        const requests = await (await superAdmin.call()).engagement.staff.serviceRequests();
        const request = requests.find(item => item.businessId === businessId)!;
        expect(request).toMatchObject({ service: "pitch_deck", serviceName: "Pitch Deck", type: "done_for_you", note: "Meeting an investor in December." });

        // An analyst sees no requests and cannot handle one.
        const analyst = await signIn(await person(["analyst"]), true);
        expect(await (await analyst.call()).engagement.staff.serviceRequests()).toEqual([]);
        await expect((await analyst.call()).engagement.staff.handleRequest({ requestId: request.id, status: "done" })).rejects.toMatchObject({ code: "FORBIDDEN" });

        await (await superAdmin.call()).engagement.staff.createDirect({ type: request.type, service: request.service, startedOn: "2026-11-09", businessId });
        expect(await (await superAdmin.call()).engagement.staff.handleRequest({ requestId: request.id, status: "done" })).toEqual({ success: true });
        expect((await (await superAdmin.call()).engagement.staff.serviceRequests()).some(item => item.id === request.id)).toBe(false);
        expect((await (await owner.call()).engagement.client.room())!.requests).toEqual([]);
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "service_requested"));
        expect(audits.length).toBeGreaterThan(0);
      });
    });

    describe("engagements opened directly, by type", () => {
      it("opens a Digital marketing engagement: the business, the type's starting content, and the owner's invitation", async () => {
        const email = uniqueEmail("crown");
        const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Crown Studio", contactName: "Marie Tiogo", contactEmail: email, startedOn: "2026-11-02" });
        expect(opened).toMatchObject({ hasAccount: false, invitationUrl: expect.stringContaining("/join/") });
        expect(emails().find(sent => sent.to === email)!.subject).toBe("Your The Shift room for Crown Studio");

        const listed = (await (await superAdmin.call()).engagement.staff.list()).items.find(item => item.id === opened.engagementId)!;
        expect(listed).toMatchObject({ businessName: "Crown Studio", ownerName: "Marie Tiogo", ownerEmail: email, type: "digital_marketing", typeLabel: "Digital marketing", hasAccount: true });

        // The client accepts and lands in the room as its owner, with the type's starting content.
        const token = decodeURIComponent(emails().filter(sent => sent.to === email).at(-1)!.body.match(/Create your account: (\S+)/)![1].split("/join/")[1]);
        const owner = browser();
        await (await owner.call()).invitations.accept({ token, email, fullName: "Marie Tiogo", password: PASSWORD, confirmPassword: PASSWORD });
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room).toMatchObject({ type: "digital_marketing", typeLabel: "Digital marketing", startedOn: "2026-11-02", businessName: "Crown Studio", viewer: { kind: "owner" }, check: null, insight: null });
        expect(room.tasks.filter(task => task.kind === "data_request").map(task => task.ref)).toEqual(["A1", "A2", "B1", "C1", "C2"]);
        expect(room.tasks.find(task => task.ref === "B1")).toMatchObject({ section: "B Accounts", priority: "high", dueOn: "2026-11-05" });
        expect(room.sessions.map(item => item.title)).toEqual(["Kick-off", "Weekly check-in", "Month 1 review"]);
        expect(room.people).toEqual([expect.objectContaining({ name: "Marie Tiogo", label: "Owner", you: true })]);

        // The team's record has no Business Health Check behind it, and names the contact.
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId: opened.engagementId });
        expect(detail.engagement).toMatchObject({ businessCheckId: null, typeLabel: "Digital marketing" });
        expect(detail.owner).toMatchObject({ name: "Marie Tiogo", email });
      });

      it("runs the content board: the team plans and sends for approval, the owner approves or asks for changes, others cannot", async () => {
        const email = uniqueEmail("board");
        const { engagementId, invitationUrl } = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Board Studio", contactName: "Bola Board", contactEmail: email, startedOn: "2026-11-02" });
        const owner = browser();
        await (await owner.call()).invitations.accept({ token: decodeURIComponent(invitationUrl!.split("/join/")[1]), email, fullName: "Bola Board", password: PASSWORD, confirmPassword: PASSWORD });
        const admin = await superAdmin.call();
        const { itemId: reel } = await admin.engagement.staff.saveContent({ engagementId, kind: "reel", title: "Knotless braids, before and after", month: 1, status: "planned", dueOn: "2026-11-12", link: null });
        await admin.engagement.staff.saveContent({ engagementId, kind: "post", title: "December offer", month: 1, status: "planned", dueOn: null, link: null });
        // Not waiting for approval yet: the owner cannot approve it.
        await expect((await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: true, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
        await admin.engagement.staff.saveContent({ engagementId, itemId: reel, kind: "reel", title: "Knotless braids, before and after", month: 1, status: "for_approval", dueOn: "2026-11-12", link: "https://example.com/draft/reel" });

        let room = (await (await owner.call()).engagement.client.room())!;
        expect(room.contentTargets).toEqual([{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }]);
        expect(room.content.map(item => [item.title, item.statusLabel])).toEqual([["Knotless braids, before and after", "For your approval"], ["December offer", "Planned"]]);

        // Changes need a note; then the team sends it again and the owner approves.
        await expect((await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: false, note: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await (await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: false, note: "Shorter intro, please" });
        expect((await admin.engagement.staff.detail({ engagementId })).content.find(item => item.id === reel)).toMatchObject({ status: "changes_requested", clientNote: "Shorter intro, please" });
        await admin.engagement.staff.saveContent({ engagementId, itemId: reel, kind: "reel", title: "Knotless braids, before and after", month: 1, status: "for_approval", dueOn: "2026-11-12", link: "https://example.com/draft/reel-2" });
        expect(await (await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: true, note: null })).toMatchObject({ status: "approved" });
        room = (await (await owner.call()).engagement.client.room())!;
        expect(room.content.find(item => item.id === reel)).toMatchObject({ status: "approved", clientNote: null, approvedAt: expect.any(Date) });

        // Another business never reaches it; a Business Review room has no board.
        const other = await client("board-other");
        await expect((await other.owner.call()).engagement.client.respondToContent({ itemId: reel, approve: true, note: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const otherRoom = (await (await other.owner.call()).engagement.client.room())!;
        expect(otherRoom).toMatchObject({ content: [], contentTargets: [] });
        // An analyst not on the engagement cannot touch it.
        const analyst = await signIn(await person(["analyst"]), true);
        await expect((await analyst.call()).engagement.staff.saveContent({ engagementId, kind: "story", title: "Nope", month: 1, status: "planned", dueOn: null, link: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("puts an existing client account straight in as owner, refuses a staff email, and is the desk's call only", async () => {
        const { email } = await client("direct-existing");
        const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: "business_review", businessName: "Second Venture", contactName: "Existing Owner", contactEmail: email, startedOn: "2026-11-09" });
        expect(opened).toMatchObject({ hasAccount: true, invitationUrl: null });
        const staffUser = await person(["analyst"]);
        await expect((await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Nope", contactName: "Staff", contactEmail: staffUser.email, startedOn: "2026-11-09" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const analyst = await signIn(staffUser, true);
        await expect((await analyst.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Nope", contactName: "Someone", contactEmail: uniqueEmail("nope"), startedOn: "2026-11-09" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        // A direct Business Review starts with the standard Work Plan.
        const tasks = await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, opened.engagementId));
        expect(tasks.filter((task: { kind: string }) => task.kind === "data_request").length).toBeGreaterThan(5);
      });
    });

    describe("the team's side: permission and assignment", () => {
      it("shows the desk lead every engagement, an analyst only the ones they are on, and finance none", async () => {
        const { engagementId } = await client("scope");
        const deskLead = await signIn(await person(["desk_lead"]), true);
        const analystUser = await person(["analyst"], "Ola Analyst");
        const analyst = await signIn(analystUser, true);
        const finance = await signIn(await person(["finance"]), true);
        const partner = await signIn(await person(["partner"]), true);
        const expert = await signIn(await person(["subject_matter_expert"]), true);

        expect((await (await deskLead.call()).engagement.staff.list()).items.map(item => item.id)).toContain(engagementId);
        expect((await (await analyst.call()).engagement.staff.list())).toMatchObject({ items: [], canStart: false, seesAll: false });
        expect((await (await deskLead.call()).engagement.staff.list())).toMatchObject({ seesAll: true });
        await expect((await analyst.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await partner.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await expert.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await finance.call()).engagement.staff.list()).rejects.toMatchObject({ code: "FORBIDDEN" });

        await (await deskLead.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        expect((await (await analyst.call()).engagement.staff.list()).items.map(item => item.id)).toEqual([engagementId]);
        const detail = await (await analyst.call()).engagement.staff.detail({ engagementId });
        expect(detail.team).toEqual([expect.objectContaining({ name: "Ola Analyst", role: "analyst", roleLabel: "Analyst" })]);
        expect(detail.can).toEqual({ manage: true, assign: false, review: false, sendSignIn: false });
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

      it("keeps several people on one engagement, changes a role without replacing anyone, and emails each person", async () => {
        const { engagementId, owner } = await client("team-of-three");
        const lead = await person(["analyst"], "Lena Lead");
        const analyst = await person(["analyst"], "Ade Analyst");
        const specialist = await person(["subject_matter_expert"], "Sola Specialist");
        mocked.deliverEmail.mockClear();
        expect(await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: lead.id, role: "lead" })).toEqual({ success: true, added: true, notified: true });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analyst.id, role: "analyst" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: specialist.id, role: "expert" });
        // Changing a role keeps everyone else, and tells the person.
        expect(await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analyst.id, role: "manager" })).toEqual({ success: true, added: false, notified: true });
        const team = (await (await superAdmin.call()).engagement.staff.detail({ engagementId })).team;
        expect(team.map(member => [member.name, member.role])).toEqual([["Lena Lead", "lead"], ["Ade Analyst", "manager"], ["Sola Specialist", "expert"]]);
        const sent = emails();
        expect(sent.map(email => email.to)).toEqual([lead.email, analyst.email, specialist.email, analyst.email]);
        expect(sent[0]).toMatchObject({ subject: expect.stringContaining("as Lead Consultant"), body: expect.stringContaining("/admin") });
        expect(sent[3].subject).toContain("Engagement Manager");
        // The same role again changes nothing and sends nothing.
        expect(await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analyst.id, role: "manager" })).toMatchObject({ added: false, notified: false });
        expect(emails()).toHaveLength(4);
        // Each person sees the engagement under My projects with their own role; the desk's view shows no role for others.
        const leadList = await (await signIn(lead, true)).call().then(api => api.engagement.staff.list());
        expect(leadList.items.find(item => item.id === engagementId)).toMatchObject({ myRole: "Lead Consultant", unsortedFiles: 0 });
        expect((await (await superAdmin.call()).engagement.staff.list()).items.find(item => item.id === engagementId)!.myRole).toBeNull();
        // The client sees the three, in role order, and their own people with what each can see.
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.team.map(member => member.roleLabel)).toEqual(["Engagement Manager", "Lead Consultant", "Specialist"]);
        expect(room.people).toEqual([expect.objectContaining({ label: "Owner", you: true })]);
      });

      it("previews the client's room exactly as the owner sees it, for staff in scope only, and logs each preview", async () => {
        const { owner, engagementId } = await client("preview");
        const ownerRoom = await (await owner.call()).engagement.client.room();
        const preview = await (await superAdmin.call()).engagement.staff.previewRoom({ engagementId });
        expect(preview).toEqual(ownerRoom);
        expect(preview.viewer.kind).toBe("owner");
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_room_previewed"));
        expect(audits.map((row: { details: string | null }) => JSON.parse(row.details ?? "{}").engagementId)).toContain(engagementId);
        // An analyst not on the engagement cannot open it, and a client cannot use the team's side.
        const analyst = await signIn(await person(["analyst"]), true);
        await expect((await analyst.call()).engagement.staff.previewRoom({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await owner.call()).engagement.staff.previewRoom({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("keeps clients out of the team's side", async () => {
        const { owner, engagementId } = await client("no-staff");
        await expect((await owner.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });
    });

    describe("the client's side: membership and what was shared", () => {
      it("opens the room warm: the check's main finding and readiness, the Work Plan by week, and the Discovery Call once the team shares it", async () => {
        const { owner, businessCheckId, businessId } = await client("warm");
        const admin = await superAdmin.call();
        const before = (await (await owner.call()).engagement.client.room())!;
        expect(before.check).toMatchObject({ readiness: expect.any(String) });
        expect(before.check!.primaryArea).not.toBeNull();
        expect(before.debrief).toBeNull();
        // The template placed every item in a week, in order, tagged internal or external; the team's two actions sit beside the client's requests.
        expect(before.tasks.filter(task => task.weekNumber === 1).map(task => task.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(before.tasks.filter(task => task.weekNumber === 2)).toHaveLength(5);
        expect(before.tasks.filter(task => task.factor === "external").map(task => task.side).sort()).toEqual(["client", "ipf"]);
        expect(before.sessions.map(session => session.weekNumber)).toEqual([1, 2]);

        expect((await admin.businessSupport.debrief({ businessCheckId })).debrief).toBeNull();
        await expect(admin.businessSupport.shareDebrief({ businessCheckId, shared: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const saved = await admin.businessSupport.saveDebrief({ businessCheckId, heldAt: new Date("2026-10-13T13:00:00Z"), heard: "Two outlets and a van.", problemInOwnerWords: "Cash runs out in week three.", successLooksLike: "Pay salaries on the 25th.", tried: "A bookkeeper, for three months.", nextSteps: "The report, then the assessment." });
        expect(saved).toMatchObject({ shared: false });
        expect((await admin.businessSupport.debrief({ businessCheckId })).debrief).toMatchObject({ heard: "Two outlets and a van.", sharedAt: null });
        expect((await (await owner.call()).engagement.client.room())!.debrief).toBeNull();

        await admin.businessSupport.shareDebrief({ businessCheckId, shared: true });
        const shared = (await (await owner.call()).engagement.client.room())!;
        expect(shared.debrief).toMatchObject({ problemInOwnerWords: "Cash runs out in week three.", successLooksLike: "Pay salaries on the 25th.", sharedAt: expect.any(Date) });
        expect(shared.debrief).not.toHaveProperty("capturedByUserId");
        // Rewriting keeps it shared; a contributor never sees it; taking it back hides it again.
        await admin.businessSupport.saveDebrief({ businessCheckId, heldAt: null, heard: "Two outlets, a kitchen and a van.", problemInOwnerWords: null, successLooksLike: null, tried: null, nextSteps: null });
        expect((await (await owner.call()).engagement.client.room())!.debrief).toMatchObject({ heard: "Two outlets, a kitchen and a van.", problemInOwnerWords: null });
        const contributor = await member(businessId, "contributor");
        expect((await (await contributor.browser.call()).engagement.client.room())!.debrief).toBeNull();
        await admin.businessSupport.shareDebrief({ businessCheckId, shared: false });
        expect((await (await owner.call()).engagement.client.room())!.debrief).toBeNull();
      });

      it("shows the owner their journey, what we need from them and their team, and lets them say they sent something", async () => {
        const { owner, engagementId } = await client("room");
        const lead = await person(["desk_lead"], "Lewis Lead");
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: lead.id, role: "lead" });

        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room).toMatchObject({ engagementId, stage: "setting_up", stageLabel: "Getting set up", viewer: { kind: "owner" }, team: [{ name: "Lewis Lead", roleLabel: "Lead Consultant" }] });
        expect(room.journey.map(step => [step.label, step.state])).toEqual([["Getting set up", "current"], ["Business Review", "next"], ["Six-Week Fix", "next"], ["Your Plan", "next"]]);
        expect(room.tasks).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length + ASSESSMENT_TEMPLATE.teamActions.length);

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
        const notice = emails().find(sent => sent.subject === "Engagement update: Business Review Session 1")!;
        expect(notice.body).toContain("/dashboard");
        expect(notice.body).not.toContain("pricing");
        expect(JSON.stringify(room)).not.toContain("under-reporting");
      });

      it("gives the owner and full-access staff the Founder and Business tabs, from the Business Health Check and then the Full Report; contributors get neither", async () => {
        const { owner, businessCheckId, businessId } = await client("insight");
        const full = await member(businessId, null);
        const contributor = await member(businessId, "contributor");

        const fromCheck = (await (await owner.call()).engagement.client.room())!.insight!;
        expect(fromCheck.source).toBe("Business Health Check");
        expect(fromCheck.founder.sections).toEqual([]);
        expect(fromCheck.areas.length).toBeGreaterThan(0);
        expect(fromCheck.areas.map(area => area.area)).not.toContain("Founder readiness");
        expect((await (await full.browser.call()).engagement.client.room())!.insight).toEqual(fromCheck);
        expect((await (await contributor.browser.call()).engagement.client.room())!.insight).toBeNull();

        // A delivered Full Report replaces the check: the same report the owner was emailed, rebuilt from the stored intake.
        const payment = (await db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.businessCheckId, businessCheckId)))[0];
        await db.insert(schema.fullReports).values({ businessCheckId, paymentRequestId: payment.id, tokenHash: unique("hash").padEnd(64, "0").slice(0, 64), status: "delivered", intakeJson: JSON.stringify({ ...sampleIntake, revenueTarget: 4_000_000 }), intakeSubmittedAt: new Date("2026-10-14T09:00:00Z"), reportVersion: 4, deliveredAt: new Date("2026-10-14T09:00:00Z") });
        const fromReport = (await (await owner.call()).engagement.client.room())!.insight!;
        expect(fromReport.source).toBe("Full Report");
        expect(fromReport.founder.sections.map(section => section.title)).toEqual(["Founder readiness", "Strategic intent"]);
        expect(fromReport.founder.question?.bridge?.steps.at(-1)).toMatchObject({ label: "Target", total: true });
        expect(fromReport.areas.some(area => area.reading?.code)).toBe(true);
        expect((await (await contributor.browser.call()).engagement.client.room())!.insight).toBeNull();

        // A stored intake that no longer reads falls back to the check rather than closing the room.
        await db.update(schema.fullReports).set({ intakeJson: "{not json" }).where(eq(schema.fullReports.businessCheckId, businessCheckId));
        expect((await (await owner.call()).engagement.client.room())!.insight!.source).toBe("Business Health Check");
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
        expect(fullRoom.tasks).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length + ASSESSMENT_TEMPLATE.teamActions.length);
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

    describe("files (a private bucket, reached only through the server)", () => {
      const saved = { url: ENV.supabaseUrl, key: ENV.supabaseServiceRoleKey, bucket: ENV.supabaseStorageBucket };
      /** Stands in for Supabase Storage: a signed upload "arrives" the object, info and sign answer for what arrived. */
      const storage = () => {
        const objects = new Set<string>();
        const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
          const path = new URL(url).pathname;
          const key = decodeURIComponent(path.split("/engagement-files/")[1] ?? "");
          const has = objects.has(key);
          if (path.includes("/object/upload/sign/")) { objects.add(key); return { ok: true, status: 200, json: async () => ({ url: `/object/upload/sign/engagement-files/${key}?token=up` }) }; }
          if (path.includes("/object/info/") || path.includes("/object/authenticated/")) return { ok: has, status: has ? 200 : 404, json: async () => ({}) };
          if (path.includes("/object/sign/") && (init?.method ?? "GET") === "POST") return { ok: true, status: 200, json: async () => ({ signedURL: `/object/sign/engagement-files/${key}?token=down` }) };
          return { ok: false, status: 404, json: async () => ({}) };
        });
        vi.stubGlobal("fetch", fetchMock);
        return { fetchMock, objects };
      };
      const configure = () => { ENV.supabaseUrl = "https://example-project.supabase.co"; ENV.supabaseServiceRoleKey = "service-key-for-tests"; ENV.supabaseStorageBucket = "engagement-files"; };
      afterEach(() => { ENV.supabaseUrl = saved.url; ENV.supabaseServiceRoleKey = saved.key; ENV.supabaseStorageBucket = saved.bucket; vi.unstubAllGlobals(); });
      const pdf = (fileName: string) => ({ fileName, contentType: "application/pdf", sizeBytes: 120_000 });

      it("says uploads are off, and what to do instead, until the bucket is set up", async () => {
        const { owner } = await client("no-storage");
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.uploadsEnabled).toBe(false);
        await expect((await owner.call()).engagement.client.requestUpload({ taskId: room.tasks[0].id, ...pdf("sales.pdf") })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("WhatsApp") });
      });

      it("lets the owner upload against a request: the file is recorded, the request is received, and only they and the team can open it", async () => {
        configure();
        storage();
        const a = await client("files-a");
        const b = await client("files-b");
        const room = (await (await a.owner.call()).engagement.client.room())!;
        expect(room.uploadsEnabled).toBe(true);
        const task = room.tasks[1];
        const ticket = await (await a.owner.call()).engagement.client.requestUpload({ taskId: task.id, ...pdf("sales.pdf") });
        expect(ticket.storageKey).toMatch(new RegExp(`^engagements/${a.engagementId}/tasks/${task.id}/[0-9a-f-]+-sales\\.pdf$`));
        expect(ticket.uploadUrl).toContain("https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/");
        expect(ticket.headers).toEqual({ "content-type": "application/pdf", "x-upsert": "false" });

        // A key that belongs to another engagement or task is refused, however it was obtained.
        await expect((await a.owner.call()).engagement.client.confirmUpload({ taskId: task.id, storageKey: `engagements/${b.engagementId}/tasks/1/x-sales.pdf`, note: null, ...pdf("sales.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await a.owner.call()).engagement.client.confirmUpload({ taskId: task.id, storageKey: `engagements/${a.engagementId}/tasks/${task.id}/../../engagements/${b.engagementId}/tasks/1/x-sales.pdf`, note: null, ...pdf("sales.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const confirmed = await (await a.owner.call()).engagement.client.confirmUpload({ taskId: task.id, storageKey: ticket.storageKey, note: null, ...pdf("sales.pdf") });
        expect(confirmed).toMatchObject({ status: "received" });

        const after = (await (await a.owner.call()).engagement.client.room())!;
        const updated = after.tasks.find(item => item.id === task.id)!;
        expect(updated).toMatchObject({ status: "received", statusNote: "Uploaded to the room" });
        expect(updated.files).toEqual([expect.objectContaining({ fileName: "sales.pdf", sizeBytes: 120_000, mine: true, fromTeam: false })]);
        const link = await (await a.owner.call()).engagement.client.fileLink({ fileId: updated.files[0].id });
        expect(link.url).toBe(`https://example-project.supabase.co/storage/v1/object/sign/engagement-files/${ticket.storageKey}?token=down&download=sales.pdf`);

        await expect((await b.owner.call()).engagement.client.fileLink({ fileId: updated.files[0].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const analystUser = await person(["analyst"]);
        const analyst = await signIn(analystUser, true);
        await expect((await analyst.call()).engagement.staff.fileLink({ fileId: updated.files[0].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId: a.engagementId, userId: analystUser.id, role: "analyst" });
        expect((await (await analyst.call()).engagement.staff.fileLink({ fileId: updated.files[0].id })).url).toContain("download=sales.pdf");
        const detail = await (await analyst.call()).engagement.staff.detail({ engagementId: a.engagementId });
        expect(detail.uploadsEnabled).toBe(true);
        expect(detail.tasks.find(item => item.id === task.id)!.files[0]).toMatchObject({ fileName: "sales.pdf", audience: "owner" });
      });

      it("refuses the wrong kind of file, a file that is too big, and an upload that never arrived", async () => {
        configure();
        const { objects } = storage();
        const { owner } = await client("files-rules");
        const taskId = (await (await owner.call()).engagement.client.room())!.tasks[2].id;
        await expect((await owner.call()).engagement.client.requestUpload({ taskId, fileName: "virus.exe", contentType: "application/octet-stream", sizeBytes: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await owner.call()).engagement.client.requestUpload({ taskId, fileName: "big.pdf", contentType: "application/pdf", sizeBytes: 26 * 1024 * 1024 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const ticket = await (await owner.call()).engagement.client.requestUpload({ taskId, ...pdf("costs.pdf") });
        objects.delete(ticket.storageKey);
        await expect((await owner.call()).engagement.client.confirmUpload({ taskId, storageKey: ticket.storageKey, note: null, ...pdf("costs.pdf") })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "The upload did not finish. Try again." });
        expect((await (await owner.call()).engagement.client.room())!.tasks.find(item => item.id === taskId)!.status).toBe("open");
      });

      it("takes files into the drop box unsorted; the team matches each to Data Requests; only this client and the team see them", async () => {
        configure();
        storage();
        const a = await client("drop-a");
        const b = await client("drop-b");
        const room = (await (await a.owner.call()).engagement.client.room())!;
        const [first, second] = room.tasks.filter(task => task.kind === "data_request");
        const ticket = await (await a.owner.call()).engagement.client.requestDrop(pdf("everything.pdf"));
        expect(ticket.storageKey).toMatch(new RegExp(`^engagements/${a.engagementId}/inbox/[0-9a-f-]+-everything\\.pdf$`));
        // A key outside this engagement's drop box is refused, however it was obtained.
        await expect((await a.owner.call()).engagement.client.confirmDrop({ storageKey: `engagements/${b.engagementId}/inbox/x-everything.pdf`, note: null, ...pdf("everything.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await a.owner.call()).engagement.client.confirmDrop({ storageKey: `engagements/${a.engagementId}/tasks/${first.id}/x-everything.pdf`, note: null, ...pdf("everything.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const { fileId } = await (await a.owner.call()).engagement.client.confirmDrop({ storageKey: ticket.storageKey, note: "From our accountant", ...pdf("everything.pdf") });

        let after = (await (await a.owner.call()).engagement.client.room())!;
        expect(after.sentFiles).toEqual([expect.objectContaining({ id: fileId, fileName: "everything.pdf", mine: true, note: "From our accountant", matchedTo: [] })]);
        expect(after.tasks.find(task => task.id === first.id)!.status).toBe("open");
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId: a.engagementId });
        expect(detail.inbox).toEqual([expect.objectContaining({ id: fileId, fileName: "everything.pdf", note: "From our accountant", taskIds: [] })]);

        // Another engagement's request cannot be matched; this one's can, and a waiting request moves to "we are checking".
        const otherTask = (await (await b.owner.call()).engagement.client.room())!.tasks[0];
        await expect((await superAdmin.call()).engagement.staff.matchFile({ fileId, taskIds: [otherTask.id] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(await (await superAdmin.call()).engagement.staff.matchFile({ fileId, taskIds: [first.id, second.id] })).toMatchObject({ moved: 2 });
        after = (await (await a.owner.call()).engagement.client.room())!;
        expect(after.tasks.find(task => task.id === first.id)).toMatchObject({ status: "received", statusNote: "From the files you sent", files: [expect.objectContaining({ id: fileId })] });
        expect(after.sentFiles[0].matchedTo.map(match => match.taskId).sort()).toEqual([first.id, second.id].sort());
        expect((await (await superAdmin.call()).engagement.staff.detail({ engagementId: a.engagementId })).inbox[0].taskIds.sort()).toEqual([first.id, second.id].sort());

        expect((await (await a.owner.call()).engagement.client.fileLink({ fileId })).url).toContain("download=everything.pdf");
        await expect((await b.owner.call()).engagement.client.fileLink({ fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect((await (await b.owner.call()).engagement.client.room())!.sentFiles).toEqual([]);

        // Clearing the match keeps the file and takes it off the requests.
        await (await superAdmin.call()).engagement.staff.matchFile({ fileId, taskIds: [] });
        after = (await (await a.owner.call()).engagement.client.room())!;
        expect(after.sentFiles[0].matchedTo).toEqual([]);
        expect(after.tasks.find(task => task.id === first.id)!.files).toEqual([]);
      });

      it("lets the client mark a Data Request not available, and undo it, but not once the team has it", async () => {
        const { owner } = await client("not-available");
        const request = (await (await owner.call()).engagement.client.room())!.tasks.find(task => task.kind === "data_request")!;
        expect(await (await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: true, note: "We kept no records before March" })).toMatchObject({ status: "not_available" });
        let task = (await (await owner.call()).engagement.client.room())!.tasks.find(item => item.id === request.id)!;
        expect(task).toMatchObject({ status: "not_available", statusLabel: "Not available", statusNote: "We kept no records before March" });
        await expect((await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: true, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
        await (await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: false, note: null });
        task = (await (await owner.call()).engagement.client.room())!.tasks.find(item => item.id === request.id)!;
        expect(task).toMatchObject({ status: "open", statusNote: null });
        await (await owner.call()).engagement.client.respondToTask({ taskId: request.id, note: "On WhatsApp" });
        await expect((await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: true, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("shows the team's file on a deliverable only once the deliverable is shared, and to the audience chosen", async () => {
        configure();
        storage();
        const { owner, engagementId, businessId } = await client("files-deliverable");
        const full = await member(businessId, "full");
        const contributor = await member(businessId, "contributor");
        const { deliverableId } = await (await superAdmin.call()).engagement.staff.saveDeliverable({ engagementId, kind: "tools", title: "Cash template", summary: "Fill it in every evening." });
        const target = { kind: "deliverable" as const, id: deliverableId };
        const ticket = await (await superAdmin.call()).engagement.staff.requestUpload({ engagementId, target, fileName: "cash-template.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 9_000 });
        const { fileId } = await (await superAdmin.call()).engagement.staff.confirmUpload({ engagementId, target, storageKey: ticket.storageKey, audience: "business", fileName: "cash-template.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 9_000 });

        await expect((await owner.call()).engagement.client.fileLink({ fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await (await superAdmin.call()).engagement.staff.shareDeliverable({ deliverableId, audience: "business" });
        expect((await (await owner.call()).engagement.client.room())!.deliverables[0].files).toEqual([expect.objectContaining({ fileName: "cash-template.xlsx", fromTeam: true, mine: false })]);
        expect((await (await full.browser.call()).engagement.client.fileLink({ fileId })).url).toContain("download=cash-template.xlsx");
        await expect((await contributor.browser.call()).engagement.client.fileLink({ fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });

    describe("the fix: the one number and the weekly check-in", () => {
      it("lets the team set the number and record the weeks in order; the client sees the reading and the next step, never the hours", async () => {
        const { owner, engagementId, businessId } = await client("fix");
        const contributor = await member(businessId, "contributor");
        const analystUser = await person(["analyst"]);
        const analyst = await signIn(analystUser, true);
        const outsider = await signIn(await person(["analyst"]), true);
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });

        const measure = { engagementId, name: "Cash in the bank on Friday", definition: "The business account balance after the week's payments.", unit: "₦", baselineValue: 150000, targetValue: 400000 };
        await expect((await outsider.call()).engagement.staff.saveMeasure(measure)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await (await analyst.call()).engagement.staff.saveMeasure(measure);
        await (await analyst.call()).engagement.staff.saveMeasure({ ...measure, targetValue: 450000 });
        expect(await db.select().from(schema.engagementMeasures).where(eq(schema.engagementMeasures.engagementId, engagementId))).toHaveLength(1);

        const week = (weekNumber: number, reading: number) => ({ engagementId, weekNumber, heldOn: `2026-11-${String(6 + 7 * weekNumber).padStart(2, "0")}`, progress: "Moved.", blockers: "Power cuts.", nextStep: `Step for week ${weekNumber + 1}.`, measureReading: reading, questionsAsked: "How do I price delivery?", hoursLead: 0.5, hoursAnalyst: 2.5, hoursPartner: null, aiUsed: true });
        await expect((await analyst.call()).engagement.staff.saveCheckin(week(2, 200000))).rejects.toMatchObject({ code: "CONFLICT", message: "Record week 1 first: a Weekly Check-in cannot start without last week's record." });
        await (await analyst.call()).engagement.staff.saveCheckin(week(1, 160000));
        await (await analyst.call()).engagement.staff.saveCheckin(week(2, 200000));
        await (await analyst.call()).engagement.staff.saveCheckin({ ...week(2, 210000) });

        const detail = await (await analyst.call()).engagement.staff.detail({ engagementId });
        expect(detail.measure).toMatchObject({ name: "Cash in the bank on Friday", baselineValue: 150000, targetValue: 450000 });
        expect(detail.checkins.map(row => [row.weekNumber, row.measureReading, row.hoursAnalyst])).toEqual([[1, 160000, 2.5], [2, 210000, 2.5]]);

        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.measure).toMatchObject({ name: "Cash in the bank on Friday", unit: "₦", baselineValue: 150000, targetValue: 450000, latest: { weekNumber: 2, reading: 210000 } });
        expect(room.measure!.readings.map(row => [row.weekNumber, row.reading, row.nextStep])).toEqual([[1, 160000, "Step for week 2."], [2, 210000, "Step for week 3."]]);
        const text = JSON.stringify(room);
        for (const hidden of ["hoursAnalyst", "hoursLead", "questionsAsked", "Power cuts", "aiUsed"]) expect(text).not.toContain(hidden);
        expect((await (await contributor.browser.call()).engagement.client.room())!.measure).toBeNull();
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

      it("lets the engagement's own Engagement Manager or Lead Consultant approve, on that engagement only, but not its analyst", async () => {
        const one = await client("lead-approves");
        const other = await client("lead-elsewhere");
        const managerUser = await person(["analyst"]);
        const analystUser = await person(["analyst"]);
        for (const engagementId of [one.engagementId, other.engagementId]) await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: managerUser.id, role: engagementId === one.engagementId ? "manager" : "analyst" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId: one.engagementId, userId: analystUser.id, role: "analyst" });
        const manager = await signIn(managerUser, true);
        const analyst = await signIn(analystUser, true);
        expect((await (await manager.call()).engagement.staff.detail({ engagementId: one.engagementId })).can.review).toBe(true);
        expect((await (await manager.call()).engagement.staff.detail({ engagementId: other.engagementId })).can.review).toBe(false);
        expect((await (await analyst.call()).engagement.staff.detail({ engagementId: one.engagementId })).can.review).toBe(false);

        const { deliverableId } = await (await analyst.call()).engagement.staff.saveDeliverable({ engagementId: one.engagementId, kind: "prescription", title: "Daily cash count", summary: "Count every evening." });
        await expect((await analyst.call()).engagement.staff.approveDeliverable({ deliverableId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await manager.call()).engagement.staff.approveDeliverable({ deliverableId });
        const { deliverableId: elsewhere } = await (await manager.call()).engagement.staff.saveDeliverable({ engagementId: other.engagementId, kind: "plan", title: "Your Plan", summary: null });
        await expect((await manager.call()).engagement.staff.approveDeliverable({ deliverableId: elsewhere })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("lets the owner comment and sign off, and their staff only comment", async () => {
        const { owner, engagementId, businessId } = await client("signoff");
        const full = await member(businessId, "full");
        const { deliverableId } = await (await superAdmin.call()).engagement.staff.saveDeliverable({ engagementId, kind: "problem_statement", title: "The one problem", summary: "Prices do not cover costs." });
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.shareDeliverable({ deliverableId, audience: "business" });
        expect(emails().filter(sent => sent.subject === "Engagement update: The one problem").map(sent => sent.to)).toContain(full.user.email);

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
