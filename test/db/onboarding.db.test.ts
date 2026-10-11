/**
 * Client onboarding: the only way a client account exists. Real application code on PostgreSQL (PGlite on every run,
 * plus TEST_DATABASE_URL via `pnpm test:db`). Email delivery is simulated by the email layer under Vitest.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { count, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, pgErrorCode, type DbHarness } from "./harness";

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

import { appRouter } from "@server/routers";
import { resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import { ADMIN_ACCESS_COOKIE, OWNER_ADMIN_EMAIL, sha256 } from "@server/adminSecurity";
import { createOnboardingInvitation, effectiveInvitationStatus } from "@server/clientOnboarding";
import { ACCOUNT_AUTH_ERRORS, ACCOUNT_SESSION_COOKIE, ONBOARDING_ERRORS, ONBOARDING_INVITATION_TTL_MS } from "@shared/auth";
import type { TrpcContext } from "@server/_core/context";

const REMOTE_TEST_TIMEOUT_MS = 30_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueEmail = (label: string) => `${unique(label)}@example.test`;
const PASSWORD = "correct horse 42";

type Cookie = { value: string };
function browser(options: { cookies?: Record<string, string>; user?: unknown; origin?: string; host?: string } = {}) {
  const jar = new Map<string, Cookie>(Object.entries(options.cookies ?? {}).map(([name, value]) => [name, { value }]));
  const ip = `198.51.100.${(counter += 1) % 250}`;
  const call = () => {
    const headers: Record<string, string> = {};
    const cookie = [...jar.entries()].map(([name, entry]) => `${name}=${encodeURIComponent(entry.value)}`).join("; ");
    if (cookie) headers.cookie = cookie;
    if (options.origin) headers.origin = options.origin;
    if (options.host) headers.host = options.host;
    return appRouter.createCaller({
      req: { ip, protocol: "https", headers },
      res: { cookie: (name: string, value: string) => void jar.set(name, { value }), clearCookie: (name: string) => void jar.delete(name) },
      user: options.user ?? null,
    } as unknown as TrpcContext);
  };
  return { call, jar, token: () => jar.get(ACCOUNT_SESSION_COOKIE)?.value };
}

const tokenOf = (invitationUrl: string) => decodeURIComponent(invitationUrl.split("/onboarding/")[1]);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Client onboarding on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: browser;
    let delegatedAdmin: browser;
    let plainAdmin: browser;
    let superAdminId = 0;
    type browser = ReturnType<typeof browser>;

    async function adminBrowser(email: string, permissions: string[] | null) {
      const [user] = await db.insert(schema.users).values({ openId: unique("admin"), email, role: "admin", name: "Admin" }).returning();
      const raw = unique("admin-session");
      await db.insert(schema.adminAccessSessions).values({ userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3_600_000) });
      if (permissions) await db.insert(schema.adminPermissionProfiles).values({ userId: user.id, permissionsJson: JSON.stringify(permissions) });
      return { user, client: browser({ user, cookies: { [ADMIN_ACCESS_COOKIE]: raw } }) };
    }

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      const owner = await adminBrowser(OWNER_ADMIN_EMAIL, null);
      superAdmin = owner.client;
      superAdminId = owner.user.id;
      delegatedAdmin = (await adminBrowser(uniqueEmail("delegated"), ["manage_client_onboarding"])).client;
      plainAdmin = (await adminBrowser(uniqueEmail("plain-admin"), ["view_participants", "manage_payments"])).client;
    }, 60_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => resetBusinessCheckRateLimitsForTests());

    async function businessCheck(overrides: Record<string, unknown> = {}) {
      const [row] = await db.insert(schema.businessChecks).values({
        publicToken: unique("check"),
        fullName: "Ada Example",
        email: uniqueEmail("prospect"),
        businessName: "Example Traders",
        stage: "operating",
        answersJson: "{}",
        ...overrides,
      }).returning();
      return row;
    }
    // Most of these checks have not paid, so the hand invitation carries the recorded reason the server requires.
    const invite = async (checkId: number, admin: browser = superAdmin) => admin.call().onboarding.invite({ businessCheckId: checkId, overrideReason: "Agreed exception for the test" });
    const markPaid = (checkId: number) => db.insert(schema.paymentRequests).values({ businessCheckId: checkId, item: "current_state", amountNaira: 500_000, reference: `TS-CS-${String(checkId).padStart(6, "0")}`, status: "confirmed", confirmedAt: new Date() });
    const accept = (token: string, email: string, extra: Record<string, string> = {}, client: browser = browser()) =>
      client.call().onboarding.accept({ token, email, fullName: "Ada Example", password: PASSWORD, confirmPassword: PASSWORD, businessName: "Example Traders", ...extra });
    const total = async (table: Parameters<typeof db.select>[0] extends never ? never : unknown) => Number((await db.select({ n: count() }).from(table))[0].n);
    const invitationRow = async (id: number) => (await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.id, id)))[0];
    const accountRows = async (email: string) => {
      const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`);
      if (!user) return { user: undefined, credentials: [], memberships: [], sessions: [], businesses: [] };
      return {
        user,
        credentials: await db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, user.id)),
        memberships: await db.select().from(schema.businessMemberships).where(eq(schema.businessMemberships.userId, user.id)),
        sessions: await db.select().from(schema.userSessions).where(eq(schema.userSessions.userId, user.id)),
        businesses: await db.select().from(schema.businesses).where(eq(schema.businesses.createdByUserId, user.id)),
      };
    };

    describe("public entry creates no account", () => {
      it("has no public sign-up procedure at all", async () => {
        const procedures = Object.keys((appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures);
        expect(procedures.filter(name => name.startsWith("account.")).sort()).toEqual(["account.business", "account.changePassword", "account.me", "account.signIn", "account.signInInternal", "account.signOut", "account.switchWorkspace", "account.updateBusiness", "account.updateProfile", "account.workspace"]);
        expect(procedures.filter(name => /sign-?up|register/i.test(name))).toEqual([]);
        // Calling the old procedure by name does not create anything: there is nothing to call.
        const before = await total(schema.users);
        const signUp = (browser().call().account as unknown as Record<string, (input: unknown) => Promise<unknown>>).signUp;
        await expect(signUp({ fullName: "Walk In", email: uniqueEmail("walkin"), password: PASSWORD, confirmPassword: PASSWORD, businessName: "Walk In Ltd" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(await total(schema.users)).toBe(before);
      });

      it("rejects account creation without an invitation, with a made-up one, or with another token's address", async () => {
        const before = [await total(schema.users), await total(schema.businesses), await total(schema.businessMemberships)];
        const email = uniqueEmail("nobody");
        await expect(browser().call().onboarding.accept({ email, fullName: "No One", password: PASSWORD, confirmPassword: PASSWORD, businessName: "Nothing Ltd" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(accept("x".repeat(43), email)).rejects.toMatchObject({ code: "NOT_FOUND", message: ONBOARDING_ERRORS.unavailable });
        const check = await businessCheck();
        const { invitationUrl } = await invite(check.id);
        await expect(accept(tokenOf(invitationUrl), email)).rejects.toMatchObject({ code: "BAD_REQUEST", message: ONBOARDING_ERRORS.emailMismatch });
        expect([await total(schema.users), await total(schema.businesses), await total(schema.businessMemberships)]).toEqual(before);
      });

      it("completing a business check creates no user and no business", async () => {
        const before = [await total(schema.users), await total(schema.businesses)];
        const lead = await browser().call().businessCheck.start({ fullName: "Public Visitor", email: uniqueEmail("visitor") });
        expect(lead.token).toBeTruthy();
        expect([await total(schema.users), await total(schema.businesses)]).toEqual(before);
      });

      it("keeps the Free Business Check public", async () => {
        const error = await browser().call().businessCheck.requestNext({ token: "x".repeat(24), choice: "call" }).catch((e: unknown) => e) as { code: string };
        expect(error.code).toBe("NOT_FOUND");
      });
    });

    describe("creating invitations", () => {
      it("lets the Super Admin and an administrator granted the capability invite a business check", async () => {
        for (const admin of [superAdmin, delegatedAdmin]) {
          const check = await businessCheck();
          const result = await invite(check.id, admin);
          expect(result.invitationUrl).toMatch(/\/onboarding\/[A-Za-z0-9_-]{43}$/);
          expect(result.deliveryStatus).toBe("Simulated");
          expect(result.expiresAt.getTime() - Date.now()).toBeGreaterThan(ONBOARDING_INVITATION_TTL_MS - 60_000);
          expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(ONBOARDING_INVITATION_TTL_MS + 1000);
        }
      });

      it("refuses an administrator without the capability, anonymous visitors and client accounts", async () => {
        const check = await businessCheck();
        await expect(invite(check.id, plainAdmin)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(invite(check.id, browser())).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(browser().call().onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(browser().call().onboarding.metrics()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(plainAdmin.call().onboarding.revoke({ invitationId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const client = browser();
        const { invitationUrl } = await invite((await businessCheck({ email: uniqueEmail("client") })).id);
        await accept(tokenOf(invitationUrl), (await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.tokenHash, sha256(tokenOf(invitationUrl)))))[0].email, {}, client);
        expect(client.token()).toBeTruthy();
        await expect(client.call().onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(invite(check.id, client)).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("stores only a hash of the token, bound to the business check's email, and audits who issued it", async () => {
        const check = await businessCheck({ email: `Prospect.Case-${counter}@Example.test`, businessName: "Hash Co" });
        const result = await invite(check.id, delegatedAdmin);
        const token = tokenOf(result.invitationUrl);
        const row = await invitationRow(result.invitationId);
        expect(row).toMatchObject({ businessCheckId: check.id, email: check.email.toLowerCase(), businessNameSnapshot: "Hash Co", fullNameSnapshot: "Ada Example", status: "pending", acceptedAt: null, revokedAt: null });
        expect(row.tokenHash).toBe(sha256(token));
        expect(JSON.stringify(row)).not.toContain(token);
        const audit = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "client_onboarding_invitation_created"));
        const mine = audit.filter((event: { details: string }) => event.details.includes(`"invitationId":${result.invitationId}`));
        expect(mine).toHaveLength(1);
        expect(mine[0].details).not.toContain(token);
        expect(mine[0].actorUserId).toBe(row.createdByUserId);
      });

      it("revokes the previous link when a new one is issued, and the database allows one pending link per business check", async () => {
        const check = await businessCheck();
        const first = await invite(check.id);
        const second = await invite(check.id);
        expect((await invitationRow(first.invitationId)).status).toBe("revoked");
        expect((await invitationRow(second.invitationId)).status).toBe("pending");
        await expect(accept(tokenOf(first.invitationUrl), check.email)).rejects.toMatchObject({ code: "NOT_FOUND" });
        const failure = await db.insert(schema.clientOnboardingInvitations).values({
          businessCheckId: check.id, email: check.email, fullNameSnapshot: "x", businessNameSnapshot: "x", tokenHash: sha256(unique("t")), expiresAt: new Date(Date.now() + 60_000), createdByUserId: superAdminId,
        }).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(failure)).toBe("23505");
      });

      it("refuses an unknown business check", async () => {
        await expect(invite(2_000_000_000)).rejects.toMatchObject({ code: "NOT_FOUND", message: ONBOARDING_ERRORS.noCheck });
      });

      it("refuses to invite before the Current State Assessment is paid unless a reason is given, and records the reason", async () => {
        const check = await businessCheck();
        await expect(superAdmin.call().onboarding.invite({ businessCheckId: check.id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: ONBOARDING_ERRORS.unpaid });
        await expect(superAdmin.call().onboarding.invite({ businessCheckId: check.id, overrideReason: "ok" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.businessCheckId, check.id))).toHaveLength(0);

        const result = await superAdmin.call().onboarding.invite({ businessCheckId: check.id, overrideReason: "  Payment agreed for Friday  " });
        const audit = (await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "client_onboarding_invitation_created")))
          .find((event: { details: string }) => event.details.includes(`"invitationId":${result.invitationId}`))!;
        expect(JSON.parse(audit.details)).toMatchObject({ paid: false, override: "Payment agreed for Friday" });
      });

      it("invites without a reason once the Current State Assessment payment is confirmed", async () => {
        const check = await businessCheck();
        await markPaid(check.id);
        const result = await superAdmin.call().onboarding.invite({ businessCheckId: check.id });
        expect(result.invitationUrl).toMatch(/\/onboarding\/[A-Za-z0-9_-]{43}$/);
        const audit = (await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "client_onboarding_invitation_created")))
          .find((event: { details: string }) => event.details.includes(`"invitationId":${result.invitationId}`))!;
        expect(JSON.parse(audit.details)).toMatchObject({ paid: true });
        expect(JSON.parse(audit.details)).not.toHaveProperty("override");
      });

      it("refuses to invite an address that already has an account, or that is reserved for an administrator", async () => {
        const taken = uniqueEmail("already");
        await db.insert(schema.users).values({ openId: unique("o"), email: taken.replace("already", "ALREADY") });
        await expect(invite((await businessCheck({ email: taken })).id)).rejects.toMatchObject({ code: "CONFLICT", message: ONBOARDING_ERRORS.existingAccountAdmin });
        await expect(invite((await businessCheck({ email: OWNER_ADMIN_EMAIL.toUpperCase() })).id)).rejects.toMatchObject({ code: "CONFLICT" });
        const invitedAdmin = uniqueEmail("admin-invited");
        await db.insert(schema.adminInvitations).values({ email: invitedAdmin, tokenHash: sha256(unique("a")), createdByUserId: superAdminId, expiresAt: new Date(Date.now() + 86_400_000), proposedPermissionsJson: "[]" });
        await expect(invite((await businessCheck({ email: invitedAdmin })).id)).rejects.toMatchObject({ code: "CONFLICT" });
      });
    });

    describe("what the invited client sees", () => {
      it("pre-fills what the business check already knows", async () => {
        const check = await businessCheck({ fullName: "Ngozi Eze", businessName: "Eze Fabrics" });
        const { invitationUrl } = await invite(check.id);
        expect(await browser().call().onboarding.preview({ token: tokenOf(invitationUrl) })).toEqual({ available: true, email: check.email.toLowerCase(), fullName: "Ngozi Eze", businessName: "Eze Fabrics" });
      });

      it("shows every unusable link the same way: unknown, expired, revoked and accepted", async () => {
        const unavailable = { available: false };
        expect(await browser().call().onboarding.preview({ token: "nope" })).toEqual(unavailable);

        const expired = await invite((await businessCheck()).id);
        await db.update(schema.clientOnboardingInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.clientOnboardingInvitations.id, expired.invitationId));
        expect(await browser().call().onboarding.preview({ token: tokenOf(expired.invitationUrl) })).toEqual(unavailable);

        const revoked = await invite((await businessCheck()).id);
        await superAdmin.call().onboarding.revoke({ invitationId: revoked.invitationId });
        expect(await browser().call().onboarding.preview({ token: tokenOf(revoked.invitationUrl) })).toEqual(unavailable);

        const check = await businessCheck();
        const used = await invite(check.id);
        await accept(tokenOf(used.invitationUrl), check.email);
        expect(await browser().call().onboarding.preview({ token: tokenOf(used.invitationUrl) })).toEqual(unavailable);
      });

      it("reports an unused link as expired once its time has passed", async () => {
        const result = await invite((await businessCheck()).id);
        await db.update(schema.clientOnboardingInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.clientOnboardingInvitations.id, result.invitationId));
        const listed = (await superAdmin.call().onboarding.invitations()).find((item: { id: number }) => item.id === result.invitationId);
        expect(listed!.status).toBe("expired");
        expect(JSON.stringify(listed)).not.toMatch(/tokenHash/);
        expect(effectiveInvitationStatus({ status: "pending", expiresAt: new Date(Date.now() - 1) })).toBe("expired");
        expect(effectiveInvitationStatus({ status: "accepted", expiresAt: new Date(Date.now() - 1) })).toBe("accepted");
      });
    });

    describe("accepting an invitation", () => {
      it("creates exactly one user, credential, business, owner membership, session and marks the invitation accepted", async () => {
        const check = await businessCheck({ fullName: "Ada Example", businessName: "Example Traders" });
        const result = await invite(check.id);
        const client = browser();
        const view = await accept(tokenOf(result.invitationUrl), check.email.toUpperCase(), { fullName: "Ada O. Example", businessName: "Example Traders Ltd" }, client);

        const rows = await accountRows(check.email);
        expect(rows.user).toMatchObject({ email: check.email.toLowerCase(), name: "Ada O. Example", role: "user", status: "active", loginMethod: "password" });
        expect(rows.credentials).toHaveLength(1);
        expect(rows.credentials[0].passwordHash).toMatch(/^scrypt\$/);
        expect(rows.businesses).toHaveLength(1);
        expect(rows.businesses[0]).toMatchObject({ name: "Example Traders Ltd", status: "active" });
        expect(rows.memberships).toHaveLength(1);
        expect(rows.memberships[0]).toMatchObject({ role: "owner", status: "active", businessId: rows.businesses[0].id });
        expect(rows.sessions).toHaveLength(1);
        expect(client.token()).toBeTruthy();
        expect(view.activeBusiness).toMatchObject({ businessName: "Example Traders Ltd", role: "owner", profileComplete: false });
        expect(JSON.stringify(view)).not.toMatch(/passwordHash|scrypt|tokenHash/);

        const row = await invitationRow(result.invitationId);
        expect(row).toMatchObject({ status: "accepted", acceptedByUserId: rows.user.id, businessId: rows.businesses[0].id });
        expect(row.acceptedAt).toBeInstanceOf(Date);
      });

      it("cannot be used twice, or after it expires or is revoked", async () => {
        const check = await businessCheck();
        const result = await invite(check.id);
        await accept(tokenOf(result.invitationUrl), check.email);
        const before = await total(schema.users);
        await expect(accept(tokenOf(result.invitationUrl), check.email)).rejects.toMatchObject({ code: "NOT_FOUND" });

        const expiredCheck = await businessCheck();
        const expired = await invite(expiredCheck.id);
        await db.update(schema.clientOnboardingInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.clientOnboardingInvitations.id, expired.invitationId));
        await expect(accept(tokenOf(expired.invitationUrl), expiredCheck.email)).rejects.toMatchObject({ code: "NOT_FOUND" });

        const revokedCheck = await businessCheck();
        const revoked = await invite(revokedCheck.id);
        await superAdmin.call().onboarding.revoke({ invitationId: revoked.invitationId });
        await expect(accept(tokenOf(revoked.invitationUrl), revokedCheck.email)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(superAdmin.call().onboarding.revoke({ invitationId: revoked.invitationId })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(await total(schema.users)).toBe(before);
      });

      it.each([
        ["user", "users"],
        ["credential", "user_credentials"],
        ["business", "businesses"],
        ["membership", "business_memberships"],
      ] as const)("rolls everything back, leaving the invitation usable, when the %s step fails", async (_step, table) => {
        const check = await businessCheck({ businessName: `Rollback ${table}` });
        const result = await invite(check.id);
        await db.execute(sql.raw(`create or replace function ipf_force_failure() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`));
        await db.execute(sql.raw(`create trigger ipf_force_failure before insert on ${table} for each row execute function ipf_force_failure()`));
        try {
          await expect(accept(tokenOf(result.invitationUrl), check.email, { businessName: `Rollback ${table}` })).rejects.toBeTruthy();
        } finally {
          await db.execute(sql.raw(`drop trigger ipf_force_failure on ${table}`));
        }
        expect((await accountRows(check.email)).user).toBeUndefined();
        expect(await db.select().from(schema.businesses).where(eq(schema.businesses.name, `Rollback ${table}`))).toHaveLength(0);
        expect((await invitationRow(result.invitationId)).status).toBe("pending");
        const orphans = await harness.query(sql`select (select count(*) from user_credentials where "userId" not in (select id from users)) as c, (select count(*) from business_memberships where "userId" not in (select id from users)) as m`);
        expect([Number(orphans[0].c), Number(orphans[0].m)]).toEqual([0, 0]);
        // Nothing was consumed: the same link works once the fault is gone.
        await accept(tokenOf(result.invitationUrl), check.email, { businessName: `Rollback ${table}` });
        expect((await accountRows(check.email)).businesses).toHaveLength(1);
      });

      it("rolls the whole account back when marking the invitation accepted fails", async () => {
        const check = await businessCheck({ businessName: "Rollback invitation" });
        const result = await invite(check.id);
        await db.execute(sql.raw(`create or replace function ipf_force_failure() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`));
        await db.execute(sql.raw(`create trigger ipf_force_failure before update on client_onboarding_invitations for each row execute function ipf_force_failure()`));
        try {
          await expect(accept(tokenOf(result.invitationUrl), check.email, { businessName: "Rollback invitation" })).rejects.toBeTruthy();
        } finally {
          await db.execute(sql.raw(`drop trigger ipf_force_failure on client_onboarding_invitations`));
        }
        const rows = await accountRows(check.email);
        expect(rows.user).toBeUndefined();
        expect(await db.select().from(schema.businesses).where(eq(schema.businesses.name, "Rollback invitation"))).toHaveLength(0);
        expect((await invitationRow(result.invitationId)).status).toBe("pending");
        const sessions = await harness.query(sql`select count(*) as n from user_sessions where "userId" not in (select id from users)`);
        expect(Number(sessions[0].n)).toBe(0);
      });

      it("binds the account to the invited email, case-insensitively", async () => {
        const check = await businessCheck({ email: uniqueEmail("bound") });
        const result = await invite(check.id);
        await expect(accept(tokenOf(result.invitationUrl), uniqueEmail("someone-else"))).rejects.toMatchObject({ code: "BAD_REQUEST", message: ONBOARDING_ERRORS.emailMismatch });
        await expect(accept(tokenOf(result.invitationUrl), `  ${check.email.toUpperCase()}  `)).resolves.toBeTruthy();
      });

      it.each([
        ["a short password", { password: "a1", confirmPassword: "a1" }, /at least 10/],
        ["a mismatched confirmation", { confirmPassword: "different 12345" }, /does not match/],
        ["a missing business name", { businessName: " " }, /business name/i],
      ])("rejects %s and keeps the invitation usable", async (_label, patch, message) => {
        const check = await businessCheck();
        const result = await invite(check.id);
        await expect(accept(tokenOf(result.invitationUrl), check.email, patch)).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(message) });
        expect((await invitationRow(result.invitationId)).status).toBe("pending");
        expect((await accountRows(check.email)).user).toBeUndefined();
      });

      it("refuses a request from another site", async () => {
        const check = await businessCheck();
        const result = await invite(check.id);
        await expect(accept(tokenOf(result.invitationUrl), check.email, {}, browser({ origin: "https://evil.example", host: "app.example.test" }))).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.crossSite });
        expect((await invitationRow(result.invitationId)).status).toBe("pending");
      });
    });

    describe("identity conflicts", () => {
      it("never creates a second identity or touches the existing one when the address already has an account", async () => {
        const check = await businessCheck();
        const result = await invite(check.id);
        // The person got an account some other way after the link was issued.
        const [existing] = await db.insert(schema.users).values({ openId: unique("late"), email: check.email.toUpperCase(), name: "Existing Person" }).returning();
        const before = [await total(schema.users), await total(schema.businesses), await total(schema.userCredentials)];
        await expect(accept(tokenOf(result.invitationUrl), check.email)).rejects.toMatchObject({ code: "CONFLICT", message: ONBOARDING_ERRORS.existingAccount });
        expect([await total(schema.users), await total(schema.businesses), await total(schema.userCredentials)]).toEqual(before);
        expect((await db.select().from(schema.users).where(eq(schema.users.id, existing.id)))[0].name).toBe("Existing Person");
        expect(await db.select().from(schema.businessMemberships).where(eq(schema.businessMemberships.userId, existing.id))).toHaveLength(0);
        expect((await invitationRow(result.invitationId)).status).toBe("pending");
      });

      it("will not onboard the Super Admin's address or an address with a pending administrator invitation", async () => {
        const reserved = [OWNER_ADMIN_EMAIL, uniqueEmail("pending-admin")];
        await db.insert(schema.adminInvitations).values({ email: reserved[1], tokenHash: sha256(unique("p")), createdByUserId: superAdminId, expiresAt: new Date(Date.now() + 86_400_000), proposedPermissionsJson: "[]" });
        for (const email of reserved) {
          // An invitation that slipped in (for example issued before the reservation) still cannot be accepted.
          const check = await businessCheck({ email });
          const token = unique("raw-token").padEnd(43, "x");
          await db.insert(schema.clientOnboardingInvitations).values({ businessCheckId: check.id, email, fullNameSnapshot: "x", businessNameSnapshot: "x", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60_000), createdByUserId: superAdminId });
          const before = await total(schema.users);
          await expect(accept(token, email)).rejects.toMatchObject({ code: "CONFLICT" });
          expect(await total(schema.users)).toBe(before);
        }
      });
    });

    describe("after onboarding", () => {
      it("signs the client in later with email and password, keeps the session across requests and signs out", async () => {
        const check = await businessCheck();
        const result = await invite(check.id);
        await accept(tokenOf(result.invitationUrl), check.email);

        const later = browser();
        await expect(later.call().account.signIn({ email: check.email, password: "wrong password 1" })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.invalidCredentials });
        const view = await later.call().account.signIn({ email: check.email.toUpperCase(), password: PASSWORD });
        expect(view.activeBusiness?.role).toBe("owner");
        expect((await later.call().account.me())?.user.email).toBe(check.email.toLowerCase());
        expect((await later.call().account.workspace()).memberships).toHaveLength(1);

        await later.call().account.signOut();
        expect(await later.call().account.me()).toBeNull();
        await expect(later.call().account.workspace()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.signInRequired });
      });

      it("rejects an expired or revoked session", async () => {
        const check = await businessCheck();
        const client = browser();
        await accept(tokenOf((await invite(check.id)).invitationUrl), check.email, {}, client);
        expect(await client.call().account.me()).not.toBeNull();
        await db.update(schema.userSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(sql`"userId" = (select id from users where lower(email) = ${check.email.toLowerCase()})`);
        expect(await client.call().account.me()).toBeNull();
      });
    });

    describe("prospects, people and workspaces are counted separately", () => {
      it("a business check adds no user or business, and accepting adds one user, one business and one membership but no business check", async () => {
        const read = async () => superAdmin.call().onboarding.metrics();
        const start = await read();

        const check = await businessCheck();
        await browser().call().businessCheck.start({ fullName: "Another Visitor", email: uniqueEmail("visitor") });
        const afterChecks = await read();
        expect(afterChecks.businessChecks).toBe(start.businessChecks + 2);
        expect([afterChecks.portalUsers, afterChecks.businesses, afterChecks.memberships]).toEqual([start.portalUsers, start.businesses, start.memberships]);

        const result = await invite(check.id);
        expect((await read()).pendingInvitations).toBe(start.pendingInvitations + 1);
        await accept(tokenOf(result.invitationUrl), check.email);
        const afterAccept = await read();
        expect(afterAccept.businessChecks).toBe(afterChecks.businessChecks);
        expect(afterAccept.portalUsers).toBe(afterChecks.portalUsers + 1);
        expect(afterAccept.businesses).toBe(afterChecks.businesses + 1);
        expect(afterAccept.memberships).toBe(afterChecks.memberships + 1);
        expect(afterAccept.pendingInvitations).toBe(start.pendingInvitations);
      });

      it("keeps the business distinct from its owner: separate records linked only by the membership", async () => {
        const check = await businessCheck();
        await accept(tokenOf((await invite(check.id)).invitationUrl), check.email, { businessName: "Distinct Co" });
        const rows = await accountRows(check.email);
        expect(rows.businesses[0].name).toBe("Distinct Co");
        expect(rows.user.name).toBe("Ada Example");
        expect(rows.user).not.toHaveProperty("businessId");
        expect(rows.businesses[0]).not.toHaveProperty("email");
        expect(rows.memberships[0]).toMatchObject({ userId: rows.user.id, businessId: rows.businesses[0].id, role: "owner" });
        // A second person can belong to the same business without becoming a second owner of a second business.
        const [teammate] = await db.insert(schema.users).values({ openId: unique("mate"), email: uniqueEmail("mate") }).returning();
        await db.insert(schema.businessMemberships).values({ businessId: rows.businesses[0].id, userId: teammate.id, role: "member" });
        expect(await db.select().from(schema.businessMemberships).where(eq(schema.businessMemberships.businessId, rows.businesses[0].id))).toHaveLength(2);
      });
    });
  });
}
