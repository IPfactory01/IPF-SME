/**
 * Invitations that create an email-and-password account, on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL
 * via `pnpm test:db`): IP Factory staff invited by the Super Admin with a role, and the owner's one included seat.
 * Email is stubbed; the link is read from the stubbed email, as a person would click it.
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
import { cleanAnswers } from "@shared/businessCheck/engine";
import type { PlatformRole } from "@shared/auth";
import type { TrpcContext } from "@server/_core/context";

const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: 90_000, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueEmail = (label: string) => `${unique(label)}@example.test`;
const PASSWORD = "correct horse 42";

function browser() {
  const jar = new Map<string, string>();
  const ip = `203.0.113.${(counter += 1) % 250}`;
  const call = async () => {
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    const res = { cookie: (name: string, value: string) => void jar.set(name, value), clearCookie: (name: string) => void jar.delete(name) };
    const context = await createContext({ req: { ip, protocol: "https", headers: cookie ? { cookie, origin: "https://localhost:3000", host: "localhost:3000" } : { origin: "https://localhost:3000", host: "localhost:3000" } }, res } as never);
    return appRouter.createCaller(context as TrpcContext);
  };
  return { call };
}
type Browser = ReturnType<typeof browser>;
type EmailCall = { to: string; subject: string; body: string };
const completeAnswers = cleanAnswers(businessCheckProfiles.growingMaker);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Account invitations on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    const passwordHash = hashAdminPassword(PASSWORD);

    const emails = (): EmailCall[] => mocked.deliverEmail.mock.calls.map(call => call[0] as EmailCall);
    const tokenFrom = (email: string) => decodeURIComponent(emails().filter(sent => sent.to === email).at(-1)!.body.match(/Create your account: (\S+)/)![1].split("/join/")[1]);
    async function person(roles: PlatformRole[] = []) {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name: "Test Person", role: "user", status: "active" }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return user as { id: number; email: string };
    }
    async function signIn(email: string, internal = false) {
      const b = browser();
      if (internal) await (await b.call()).account.signInInternal({ email, password: PASSWORD });
      else await (await b.call()).account.signIn({ email, password: PASSWORD });
      return b;
    }
    async function accept(email: string, fullName = "New Person") {
      const b = browser();
      const view = await (await b.call()).invitations.accept({ token: tokenFrom(email), email, fullName, password: PASSWORD, confirmPassword: PASSWORD });
      return { browser: b, view };
    }
    /** A paying client with an account and an engagement. */
    async function client(label: string) {
      const visitor = browser();
      const email = uniqueEmail(label);
      const { token } = await (await visitor.call()).businessCheck.start({ fullName: `Ada ${label}`, email, whatsapp: "+2348000000001" });
      await (await visitor.call()).businessCheck.submit({ token, answers: { ...completeAnswers, p_name: `Shop ${label}` } });
      const id = (await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.publicToken, token)))[0].id as number;
      const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
      await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId });
      const invitation = emails().filter(sent => sent.to === email && sent.subject.startsWith("Set up your client account")).at(-1)!;
      const owner = browser();
      await (await owner.call()).onboarding.accept({ token: decodeURIComponent(invitation.body.match(/Create your account: (\S+)/)![1].split("/onboarding/")[1]), email, fullName: `Owner ${label}`, password: PASSWORD, confirmPassword: PASSWORD, businessName: `Business ${label}` });
      return { owner, businessCheckId: id };
    }

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      await db.insert(schema.users).values({ openId: unique("owner"), email: OWNER_ADMIN_EMAIL, role: "admin", name: "Lewis Super" }).onConflictDoNothing();
      const owner = (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
      await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash }).onConflictDoNothing();
      superAdmin = await signIn(owner.email, true);
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      resetBusinessCheckRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    describe("IP Factory staff", () => {
      it("lets the Super Admin invite an analyst who sets a password, signs in to the internal area and appears on the team", async () => {
        const email = uniqueEmail("analyst");
        const issued = await (await superAdmin.call()).invitations.staff.invite({ email, fullName: "Ola Analyst", role: "analyst" });
        expect(issued.invitationUrl).toContain("/join/");
        const sent = emails().find(item => item.to === email)!;
        expect(sent.subject).toBe("Join the IP Factory team on The Shift");
        const stored = (await db.select().from(schema.accountInvitations).where(eq(schema.accountInvitations.id, issued.invitationId)))[0];
        expect(stored.tokenHash).not.toContain(tokenFrom(email));

        const { view } = await accept(email, "Ola Analyst");
        expect(view.platformRoles).toEqual(["analyst"]);
        const signedIn = await signIn(email, true);
        expect((await (await signedIn.call()).engagement.staff.list()).items).toEqual([]);
        const team = await (await superAdmin.call()).invitations.staff.team();
        expect(team.find(member => member.email === email)).toMatchObject({ name: "Ola Analyst", roles: ["analyst"] });
        expect((await (await superAdmin.call()).invitations.staff.list()).find(item => item.email === email)).toMatchObject({ status: "accepted" });
      });

      it("works once, only for the invited email, and never for an address that already has an account", async () => {
        const email = uniqueEmail("once");
        await (await superAdmin.call()).invitations.staff.invite({ email, fullName: "Once Only", role: "finance" });
        const token = tokenFrom(email);
        await expect((await browser().call()).invitations.accept({ token, email: uniqueEmail("other"), fullName: "Someone Else", password: PASSWORD, confirmPassword: PASSWORD })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await accept(email);
        await expect((await browser().call()).invitations.accept({ token, email, fullName: "Again", password: PASSWORD, confirmPassword: PASSWORD })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(await (await browser().call()).invitations.preview({ token })).toEqual({ available: false });
        const existing = await person();
        await expect((await superAdmin.call()).invitations.staff.invite({ email: existing.email, fullName: "Existing", role: "analyst" })).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("never invites a Super Admin, and only people who manage roles can invite", async () => {
        await expect((await superAdmin.call()).invitations.staff.invite({ email: uniqueEmail("super"), fullName: "Would Be", role: "super_admin" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const deskLead = await signIn((await person(["desk_lead"])).email, true);
        await expect((await deskLead.call()).invitations.staff.invite({ email: uniqueEmail("x"), fullName: "Not Allowed", role: "analyst" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("revokes a pending invitation so its link stops working", async () => {
        const email = uniqueEmail("revoked");
        const { invitationId } = await (await superAdmin.call()).invitations.staff.invite({ email, fullName: "Changed Mind", role: "partner" });
        await (await superAdmin.call()).invitations.staff.revoke({ invitationId });
        expect(await (await browser().call()).invitations.preview({ token: tokenFrom(email) })).toEqual({ available: false });
      });
    });

    describe("the owner's one included seat", () => {
      it("lets the owner invite one contributor, who sees only what is given to them", async () => {
        const { owner, businessCheckId } = await client("seat");
        const email = uniqueEmail("coordinator");
        await (await owner.call()).invitations.seats.invite({ email, fullName: "Chidi Coordinator", access: "contributor" });
        expect(emails().find(item => item.to === email)!.subject).toBe("Owner seat invited you to Business seat on The Shift");
        await expect((await owner.call()).invitations.seats.invite({ email: uniqueEmail("second"), fullName: "Second Person", access: "full" })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const preview = await (await browser().call()).invitations.preview({ token: tokenFrom(email) });
        expect(preview).toMatchObject({ available: true, kind: "business_member", businessName: "Business seat", access: "contributor" });
        const { browser: coordinator, view } = await accept(email, "Chidi Coordinator");
        expect(view).toMatchObject({ platformRoles: [], activeBusiness: { businessName: "Business seat", role: "member" }, landingPath: "/dashboard" });

        const engagement = (await db.select().from(schema.engagements).where(eq(schema.engagements.businessCheckId, businessCheckId)))[0];
        const room = (await (await coordinator.call()).engagement.client.room())!;
        expect(room.viewer).toEqual({ kind: "member", access: "contributor" });
        expect(room.tasks).toEqual([]);
        expect(room.engagementId).toBe(engagement.id);
        const seats = await (await owner.call()).invitations.seats.list();
        expect(seats).toMatchObject({ included: 1, used: 1, members: [expect.objectContaining({ name: "Chidi Coordinator", access: "contributor" })], invitations: [] });
      });

      it("lets the owner change the access level and free the seat; the person loses access at once", async () => {
        const { owner } = await client("free");
        const email = uniqueEmail("full");
        await (await owner.call()).invitations.seats.invite({ email, fullName: "Funmi Full", access: "contributor" });
        const { browser: member } = await accept(email);
        const { membershipId } = (await (await owner.call()).invitations.seats.list()).members[0];
        await (await owner.call()).invitations.seats.setAccess({ membershipId, access: "full" });
        expect((await (await member.call()).engagement.client.room())!.viewer).toEqual({ kind: "member", access: "full" });

        await (await owner.call()).invitations.seats.remove({ membershipId });
        expect(await (await member.call()).engagement.client.room()).toBeNull();
        expect((await (await owner.call()).invitations.seats.list()).used).toBe(0);
        await (await owner.call()).invitations.seats.invite({ email: uniqueEmail("next"), fullName: "Next Person", access: "full" });
      });

      it("keeps seats to owners: a member cannot invite, list or free seats", async () => {
        const { owner } = await client("member-cannot");
        const email = uniqueEmail("member");
        await (await owner.call()).invitations.seats.invite({ email, fullName: "Mo Member", access: "full" });
        const { browser: member } = await accept(email);
        await expect((await member.call()).invitations.seats.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await member.call()).invitations.seats.invite({ email: uniqueEmail("y"), fullName: "Not Allowed", access: "full" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("never lets one owner touch another business's seats", async () => {
        const a = await client("seat-a");
        const b = await client("seat-b");
        const email = uniqueEmail("b-member");
        await (await b.owner.call()).invitations.seats.invite({ email, fullName: "B Member", access: "full" });
        await accept(email);
        const { membershipId } = (await (await b.owner.call()).invitations.seats.list()).members[0];
        await expect((await a.owner.call()).invitations.seats.remove({ membershipId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await a.owner.call()).invitations.seats.setAccess({ membershipId, access: "contributor" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const access = await db.select().from(schema.businessMemberAccess).where(and(eq(schema.businessMemberAccess.membershipId, membershipId)));
        expect(access[0].access).toBe("full");
      });
    });
  });
}
