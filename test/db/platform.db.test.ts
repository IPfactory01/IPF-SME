/**
 * Phase 2: workspaces, business roles, platform roles, permissions, settings. Real application code on PostgreSQL
 * (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { initTRPC } from "@trpc/server";
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
import { accountProcedure, platformPermissionProcedure, router as trpcRouter } from "@server/_core/trpc";
import { ADMIN_ACCESS_COOKIE, hashAdminPassword, OWNER_ADMIN_EMAIL, sha256 } from "@server/adminSecurity";
import { grantPlatformRole, loadAuthority, revokePlatformRole } from "@server/platformAccess";
import { ACCOUNT_AUTH_ERRORS, ACCOUNT_SESSION_COOKIE, ACCOUNT_MAX_FAILED_ATTEMPTS } from "@shared/auth";
import type { Authority } from "@shared/platformPermissions";
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
const NEW_PASSWORD = "brand new pass 7";

type Cookie = { value: string };
function browser(options: { cookies?: Record<string, string>; user?: unknown } = {}) {
  const jar = new Map<string, Cookie>(Object.entries(options.cookies ?? {}).map(([name, value]) => [name, { value }]));
  const ip = `198.51.100.${(counter += 1) % 250}`;
  const call = () => {
    const headers: Record<string, string> = {};
    const cookie = [...jar.entries()].map(([name, entry]) => `${name}=${encodeURIComponent(entry.value)}`).join("; ");
    if (cookie) headers.cookie = cookie;
    return appRouter.createCaller({
      req: { ip, protocol: "https", headers },
      res: { cookie: (name: string, value: string) => void jar.set(name, { value }), clearCookie: (name: string) => void jar.delete(name) },
      user: options.user ?? null,
    } as unknown as TrpcContext);
  };
  return { call, jar, token: () => jar.get(ACCOUNT_SESSION_COOKIE)?.value };
}
type Browser = ReturnType<typeof browser>;

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Workspaces, roles and settings on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    let plainAdmin: Browser;
    let superAdminUser: { id: number; email: string };

    const passwordHash = hashAdminPassword(PASSWORD);

    async function makeUser(overrides: Record<string, unknown> = {}) {
      const email = (overrides.email as string | undefined) ?? uniqueEmail("person");
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email, name: "Test Person", role: "user", status: "active", ...overrides }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      return user as { id: number; email: string; name: string; role: string };
    }
    async function makeBusiness(name: string, createdBy: number, overrides: Record<string, unknown> = {}) {
      const [business] = await db.insert(schema.businesses).values({ name, slug: unique("slug"), createdByUserId: createdBy, ...overrides }).returning();
      return business as { id: number; name: string };
    }
    async function join(userId: number, businessId: number, role: "owner" | "business_admin" | "member" = "owner", status = "active") {
      const [row] = await db.insert(schema.businessMemberships).values({ userId, businessId, role, status }).returning();
      return row as { id: number };
    }
    async function signIn(user: { email: string }): Promise<Browser> {
      const b = browser();
      await b.call().account.signIn({ email: user.email, password: PASSWORD });
      return b;
    }
    /** A client signed in to a business they own. */
    async function client(role: "owner" | "business_admin" | "member" = "owner", name = "Client Co") {
      const user = await makeUser();
      const business = await makeBusiness(name, user.id);
      await join(user.id, business.id, role);
      return { user, business, session: await signIn(user) };
    }
    async function adminChannel(email: string, permissions: string[] | null, roles: string[] = []) {
      const [user] = await db.insert(schema.users).values({ openId: unique("admin"), email, role: "admin", name: "Admin" }).returning();
      const raw = unique("admin-session");
      await db.insert(schema.adminAccessSessions).values({ userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3_600_000) });
      if (permissions) await db.insert(schema.adminPermissionProfiles).values({ userId: user.id, permissionsJson: JSON.stringify(permissions) });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return { user, client: browser({ user, cookies: { [ADMIN_ACCESS_COOKIE]: raw } }) };
    }
    const audit = async (action: string, actorUserId: number) => db.select().from(schema.adminAccessAuditEvents).where(and(eq(schema.adminAccessAuditEvents.action, action), eq(schema.adminAccessAuditEvents.actorUserId, actorUserId)));
    const sessionsOf = async (userId: number) => db.select().from(schema.userSessions).where(eq(schema.userSessions.userId, userId));

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      const owner = await adminChannel(OWNER_ADMIN_EMAIL, null);
      superAdmin = owner.client;
      superAdminUser = owner.user;
      plainAdmin = (await adminChannel(uniqueEmail("plain-admin"), ["view_participants"])).client;
    }, 60_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => resetBusinessCheckRateLimitsForTests());

    describe("active workspace", () => {
      it("selects the only business automatically", async () => {
        const { business, session } = await client();
        const view = await session.call().account.me();
        expect(view!.memberships).toHaveLength(1);
        expect(view!.activeBusiness).toMatchObject({ businessId: business.id, role: "owner" });
        expect(view!.landingPath).toBe("/dashboard");
      });

      it("lets a person with several businesses switch to one they belong to, on the same session", async () => {
        const user = await makeUser();
        const first = await makeBusiness("First Co", user.id);
        const second = await makeBusiness("Second Co", user.id);
        await join(user.id, first.id, "owner");
        await join(user.id, second.id, "member");
        const session = await signIn(user);

        const before = await session.call().account.me();
        expect(before!.memberships.map(item => item.businessName)).toEqual(["First Co", "Second Co"]);
        expect(before!.activeBusiness?.businessId).toBe(first.id);
        const sessionCount = (await sessionsOf(user.id)).length;
        const tokenBefore = session.token();

        const switched = await session.call().account.switchWorkspace({ businessId: second.id });
        expect(switched.activeBusiness).toMatchObject({ businessId: second.id, businessName: "Second Co", role: "member" });
        expect((await session.call().account.me())!.activeBusiness?.businessId).toBe(second.id);
        // The same session is reused: no new session, no new cookie.
        expect((await sessionsOf(user.id)).length).toBe(sessionCount);
        expect(session.token()).toBe(tokenBefore);
        expect((await sessionsOf(user.id)).find((row: { activeBusinessId: number | null }) => row.activeBusinessId === second.id)).toBeDefined();
        expect((await audit("workspace_switched", user.id))).toHaveLength(1);
      });

      it("refuses a business the person does not belong to, whether it exists or not, and keeps the current one", async () => {
        const { business, session } = await client();
        const other = await client("owner", "Other Co");
        await expect(session.call().account.switchWorkspace({ businessId: other.business.id })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
        await expect(session.call().account.switchWorkspace({ businessId: 2_000_000_000 })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
        expect((await session.call().account.me())!.activeBusiness?.businessId).toBe(business.id);
      });

      it("refuses a business where the membership is suspended, removed or merely invited, or the business is suspended", async () => {
        const user = await makeUser();
        const own = await makeBusiness("Own Co", user.id);
        await join(user.id, own.id, "owner");
        const session = await signIn(user);
        for (const status of ["suspended", "removed", "invited"]) {
          const other = await makeBusiness(`Inactive ${status}`, user.id);
          await join(user.id, other.id, "member", status);
          await expect(session.call().account.switchWorkspace({ businessId: other.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
        const closed = await makeBusiness("Closed Co", user.id, { status: "suspended" });
        await join(user.id, closed.id, "member");
        await expect(session.call().account.switchWorkspace({ businessId: closed.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await session.call().account.me())!.memberships.map(item => item.businessName)).toEqual(["Own Co"]);
      });

      it("keeps the chosen workspace across requests and restores it at the next sign-in", async () => {
        const user = await makeUser();
        const first = await makeBusiness("First Co", user.id);
        const second = await makeBusiness("Second Co", user.id);
        await join(user.id, first.id, "owner");
        await join(user.id, second.id, "owner");
        const session = await signIn(user);
        await session.call().account.switchWorkspace({ businessId: second.id });
        expect((await session.call().account.me())!.activeBusiness?.businessId).toBe(second.id);
        expect((await session.call().account.workspace()).activeBusiness?.businessId).toBe(second.id);

        const later = await signIn(user);
        expect((await later.call().account.me())!.activeBusiness?.businessId).toBe(second.id);
      });

      it("invalidates the active workspace the moment its membership ends", async () => {
        const user = await makeUser();
        const first = await makeBusiness("First Co", user.id);
        const second = await makeBusiness("Second Co", user.id);
        const firstMembership = await join(user.id, first.id, "owner");
        const secondMembership = await join(user.id, second.id, "owner");
        const session = await signIn(user);
        await session.call().account.switchWorkspace({ businessId: second.id });
        await db.update(schema.businessMemberships).set({ status: "removed" }).where(eq(schema.businessMemberships.id, secondMembership.id));
        const view = (await session.call().account.me())!;
        expect(view.activeBusiness?.businessId).toBe(first.id);
        expect(view.memberships.map(item => item.businessId)).toEqual([first.id]);
        await expect(session.call().account.business({ businessId: second.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

        await db.update(schema.businessMemberships).set({ status: "removed" }).where(eq(schema.businessMemberships.id, firstMembership.id));
        const none = (await session.call().account.me())!;
        expect(none.activeBusiness).toBeNull();
        expect(none.memberships).toEqual([]);
      });

      it("clears the stored choice when its business is deleted", async () => {
        const user = await makeUser();
        const keep = await makeBusiness("Keep Co", user.id);
        const doomed = await makeBusiness("Doomed Co", user.id);
        await join(user.id, keep.id, "owner");
        await join(user.id, doomed.id, "owner");
        const session = await signIn(user);
        await session.call().account.switchWorkspace({ businessId: doomed.id });
        await db.delete(schema.businessMemberships).where(eq(schema.businessMemberships.businessId, doomed.id));
        await db.delete(schema.businesses).where(eq(schema.businesses.id, doomed.id));
        expect((await sessionsOf(user.id))[0].activeBusinessId).toBeNull();
        expect((await session.call().account.me())!.activeBusiness?.businessId).toBe(keep.id);
      });

      it("is valid for an internal person with no business: no fake workspace, internal landing", async () => {
        const user = await makeUser();
        await db.insert(schema.userPlatformRoles).values([{ userId: user.id, role: "desk_lead" }, { userId: user.id, role: "finance" }]);
        const session = await signIn(user);
        const view = (await session.call().account.me())!;
        expect(view.memberships).toEqual([]);
        expect(view.activeBusiness).toBeNull();
        expect(view.platformRoles).toEqual(["desk_lead", "finance"]);
        expect(view.permissions).toEqual(expect.arrayContaining(["view_all_businesses", "manage_payments", "view_financials"]));
        expect(view.landingPath).toBe("/admin");
        expect((await session.call().account.workspace()).user.id).toBe(user.id);
        await expect(session.call().account.switchWorkspace({ businessId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(session.call().account.business({ businessId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await db.select().from(schema.businessMemberships).where(eq(schema.businessMemberships.userId, user.id))).toHaveLength(0);
      });

      it("sends a person with no business and no internal role to the client dashboard, which explains it", async () => {
        const session = await signIn(await makeUser());
        const view = (await session.call().account.me())!;
        expect(view.landingPath).toBe("/dashboard");
        expect(view.platformRoles).toEqual([]);
      });
    });

    describe("business roles", () => {
      it("lets every member view their business, with what their role may do, and no outsider", async () => {
        const owner = await client("owner", "Roles Co");
        const admin = await makeUser();
        const member = await makeUser();
        await join(admin.id, owner.business.id, "business_admin");
        await join(member.id, owner.business.id, "member");
        const outsider = await client("owner", "Outsider Co");
        for (const [session, role, canEdit] of [[owner.session, "owner", true], [await signIn(admin), "business_admin", true], [await signIn(member), "member", false]] as const) {
          const profile = await session.call().account.business({ businessId: owner.business.id });
          expect(profile).toMatchObject({ businessId: owner.business.id, name: "Roles Co", role, canEdit });
        }
        await expect(outsider.session.call().account.business({ businessId: owner.business.id })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
        await expect((await signIn(member)).call().invitations.seats.invite({ email: uniqueEmail("promote"), fullName: "Self Promotion", access: "full", role: "owner" } as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await db.select().from(schema.businessMemberships).where(eq(schema.businessMemberships.userId, member.id)))[0].role).toBe("member");
      });

      it("never turns a business role into platform authority, or platform authority into a business membership", async () => {
        const owner = await client("owner", "Power Co");
        const view = (await owner.session.call().account.me())!;
        expect(view.platformRoles).toEqual([]);
        expect(view.permissions).toEqual([]);
        await expect(owner.session.call().scheduling.adminList({})).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(owner.session.call().platformRoles.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(owner.session.call().onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await loadAuthority(db, { ...owner.user, status: "active", role: "user" } as never)).roles).toEqual([]);

        // The reverse: an administrator and a desk lead hold no client membership and cannot read a client's business.
        const staff = await makeUser({ role: "admin" });
        await db.insert(schema.userPlatformRoles).values({ userId: staff.id, role: "desk_lead" });
        const staffSession = await signIn(staff);
        expect((await staffSession.call().account.me())!.memberships).toEqual([]);
        await expect(staffSession.call().account.business({ businessId: owner.business.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(staffSession.call().account.updateBusiness({ businessId: owner.business.id, name: "Hijacked Co" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await db.select().from(schema.businesses).where(eq(schema.businesses.id, owner.business.id)))[0].name).toBe("Power Co");
      });
    });

    describe("platform roles and permissions", () => {
      it("keeps the Super Admin's authority and gives an ordinary administrator none by default", async () => {
        const superAuthority = await loadAuthority(db, { ...superAdminUser, role: "admin", status: "active" });
        expect(superAuthority.isSuperAdmin).toBe(true);
        expect(superAuthority.roles).toEqual(["super_admin", "admin"]);
        const ordinary = await adminChannel(uniqueEmail("ordinary"), []);
        const authority = await loadAuthority(db, { ...ordinary.user, status: "active" });
        expect(authority).toMatchObject({ roles: ["admin"], permissions: [], isSuperAdmin: false });
      });

      it("rejects a permission-protected procedure for a missing permission and allows it with the permission", async () => {
        await expect(plainAdmin.call().platformRoles.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(browser().call().platformRoles.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(superAdmin.call().platformRoles.list()).resolves.toBeDefined();
        // Legacy profile and platform role answer the same: onboarding is a legacy capability with a platform equivalent.
        const viaProfile = await adminChannel(uniqueEmail("via-profile"), ["manage_client_onboarding"]);
        const viaRole = await adminChannel(uniqueEmail("via-role"), [], ["desk_lead"]);
        await expect(viaProfile.client.call().onboarding.candidates()).resolves.toBeDefined();
        await expect(viaRole.client.call().onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
        const finance = await adminChannel(uniqueEmail("finance"), [], ["finance"]);
        await expect(finance.client.call().onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await loadAuthority(db, { ...finance.user, status: "active" })).legacyCapabilities).toContain("manage_payments");
        expect((await loadAuthority(db, { ...viaProfile.user, status: "active" })).permissions).toContain("manage_client_onboarding");
      });

      it("guards account-session procedures with platform permissions", async () => {
        const t = initTRPC.context<TrpcContext>().create();
        void t;
        const probe = trpcRouter({
          payments: platformPermissionProcedure("manage_payments").query(() => "payments"),
          roles: platformPermissionProcedure("manage_roles").query(() => "roles"),
          anyone: accountProcedure.query(({ ctx }) => ctx.account.user.id),
        });
        const callerFor = (b: Browser) => {
          const headers: Record<string, string> = {};
          const token = b.token();
          if (token) headers.cookie = `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(token)}`;
          return probe.createCaller({ req: { ip: "203.0.113.5", protocol: "https", headers }, res: {}, user: null } as unknown as TrpcContext);
        };
        const staff = await makeUser();
        await db.insert(schema.userPlatformRoles).values({ userId: staff.id, role: "finance" });
        const staffSession = await signIn(staff);
        expect(await callerFor(staffSession).payments()).toBe("payments");
        await expect(callerFor(staffSession).roles()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(callerFor(browser()).payments()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.signInRequired });
        const clientSession = (await client()).session;
        await expect(callerFor(clientSession).payments()).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await callerFor(clientSession).anyone()).toBeGreaterThan(0);
      });

      it("grants and revokes roles through the Super Admin, with audit, and rejects duplicates", async () => {
        const person = await makeUser();
        await superAdmin.call().platformRoles.grant({ userId: person.id, role: "analyst" });
        await superAdmin.call().platformRoles.grant({ userId: person.id, role: "partner" });
        await expect(superAdmin.call().platformRoles.grant({ userId: person.id, role: "analyst" })).rejects.toMatchObject({ code: "CONFLICT" });
        expect((await superAdmin.call().platformRoles.list()).filter(row => row.userId === person.id).map(row => row.role)).toEqual(["analyst", "partner"]);
        expect((await (await signIn(person)).call().account.me())!.platformRoles).toEqual(["analyst", "partner"]);
        await superAdmin.call().platformRoles.revoke({ userId: person.id, role: "analyst" });
        await expect(superAdmin.call().platformRoles.revoke({ userId: person.id, role: "analyst" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect((await audit("platform_role_granted", superAdminUser.id)).filter((event: { details: string }) => event.details.includes(`"targetUserId":${person.id}`))).toHaveLength(2);
        expect((await audit("platform_role_revoked", superAdminUser.id)).filter((event: { details: string }) => event.details.includes(`"targetUserId":${person.id}`))).toHaveLength(1);
        await expect(superAdmin.call().platformRoles.grant({ userId: 2_000_000_000, role: "analyst" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const suspended = await makeUser({ status: "suspended" });
        await expect(superAdmin.call().platformRoles.grant({ userId: suspended.id, role: "analyst" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      const synthetic = (id: number, extra: Partial<Authority> = {}) => ({
        id, role: "admin" as const, email: `actor-${id}@example.test`, status: "active" as const,
        authority: { roles: ["admin"], permissions: ["manage_roles"], legacyCapabilities: [], isSuperAdmin: false, ...extra } as Authority,
      });

      it("stops an ordinary administrator granting Super Admin or changing their own roles", async () => {
        const actor = await makeUser({ role: "admin" });
        const target = await makeUser();
        await expect(grantPlatformRole(db, { actor: synthetic(actor.id), targetUserId: target.id, role: "super_admin" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only a Super Admin can grant Super Admin." });
        await expect(grantPlatformRole(db, { actor: synthetic(actor.id), targetUserId: actor.id, role: "analyst" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "You cannot change your own roles." });
        await expect(grantPlatformRole(db, { actor: synthetic(actor.id), targetUserId: actor.id, role: "super_admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(revokePlatformRole(db, { actor: synthetic(actor.id), targetUserId: target.id, role: "super_admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, actor.id))).toHaveLength(0);
        // The same ordinary administrator may grant a non-Super role to someone else.
        await grantPlatformRole(db, { actor: synthetic(actor.id), targetUserId: target.id, role: "analyst" });
        expect((await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, target.id)))[0].role).toBe("analyst");
      });

      it("never removes the last Super Admin, and never the permanent one", async () => {
        const second = await makeUser();
        await superAdmin.call().platformRoles.grant({ userId: second.id, role: "super_admin" });
        // The owner bridge counts as a Super Admin, so removing the second one is allowed...
        await superAdmin.call().platformRoles.revoke({ userId: second.id, role: "super_admin" });

        // ...but with no owner bridge present, the last stored Super Admin is protected.
        await db.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, superAdminUser.id));
        try {
          const last = await makeUser();
          await db.insert(schema.userPlatformRoles).values({ userId: last.id, role: "super_admin" });
          await expect(revokePlatformRole(db, { actor: synthetic(last.id, { isSuperAdmin: true }), targetUserId: last.id, role: "super_admin" })).rejects.toMatchObject({ code: "CONFLICT", message: "This is the last Super Admin and cannot be removed." });
          expect(await db.select().from(schema.userPlatformRoles).where(and(eq(schema.userPlatformRoles.userId, last.id), eq(schema.userPlatformRoles.role, "super_admin")))).toHaveLength(1);
          // A second stored Super Admin makes the removal safe.
          const another = await makeUser();
          await db.insert(schema.userPlatformRoles).values({ userId: another.id, role: "super_admin" });
          await revokePlatformRole(db, { actor: synthetic(another.id, { isSuperAdmin: true }), targetUserId: last.id, role: "super_admin" });
        } finally {
          await db.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, superAdminUser.id));
        }

        // The permanent (owner-email) Super Admin can never be removed through roles.
        await db.insert(schema.userPlatformRoles).values({ userId: superAdminUser.id, role: "super_admin" });
        await expect(superAdmin.call().platformRoles.revoke({ userId: superAdminUser.id, role: "super_admin" })).rejects.toMatchObject({ code: "CONFLICT", message: "The permanent Super Admin cannot be removed." });
      });

      it("will not demote the permanent Super Admin through the legacy role switch", async () => {
        await expect(superAdmin.call().registration.setUserRole({ userId: String(superAdminUser.id), role: "user" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await db.select().from(schema.users).where(eq(schema.users.id, superAdminUser.id)))[0].role).toBe("admin");
        const other = await makeUser();
        await superAdmin.call().registration.setUserRole({ userId: String(other.id), role: "admin" });
        await superAdmin.call().registration.setUserRole({ userId: String(other.id), role: "user" });
      });

      it("rejects duplicate and unknown platform role assignments in the database", async () => {
        const person = await makeUser();
        await db.insert(schema.userPlatformRoles).values({ userId: person.id, role: "analyst" });
        const duplicate = await db.insert(schema.userPlatformRoles).values({ userId: person.id, role: "analyst" }).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(duplicate)).toBe("23505");
        const unknown = await db.insert(schema.userPlatformRoles).values({ userId: person.id, role: "founder" as never }).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(unknown)).toBe("22P02");
        const orphan = await db.insert(schema.userPlatformRoles).values({ userId: 2_000_000_000, role: "analyst" }).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(orphan)).toBe("23503");
        // Several different roles per person are structurally fine; deleting the person removes them.
        await db.insert(schema.userPlatformRoles).values([{ userId: person.id, role: "partner" }, { userId: person.id, role: "finance" }]);
        expect(await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, person.id))).toHaveLength(3);
        await db.delete(schema.users).where(eq(schema.users.id, person.id));
        expect(await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, person.id))).toHaveLength(0);
      });

      it("takes no authority from a disabled person", async () => {
        const person = await makeUser({ status: "disabled" });
        await db.insert(schema.userPlatformRoles).values({ userId: person.id, role: "super_admin" });
        expect(await loadAuthority(db, { ...person, status: "disabled", role: "admin" } as never)).toMatchObject({ roles: [], permissions: [], isSuperAdmin: false });
        await expect(browser().call().account.signIn({ email: person.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });
    });

    describe("the canonical account context", () => {
      it("returns exactly the safe fields: identity, roles, permissions, memberships, active business", async () => {
        const user = await makeUser({ name: "Context Person" });
        const business = await makeBusiness("Context Co", user.id, { description: "d", sector: "Retail", yearFounded: 2020, website: "https://example.com" });
        await join(user.id, business.id, "owner");
        await db.insert(schema.userPlatformRoles).values({ userId: user.id, role: "partner" });
        const session = await signIn(user);
        const view = (await session.call().account.me())!;
        expect(view).toEqual({
          user: { id: user.id, fullName: "Context Person", email: user.email, status: "active" },
          platformRoles: ["partner"],
          permissions: ["view_assigned_businesses", "review_engagements"],
          memberships: [{ businessId: business.id, businessName: "Context Co", role: "owner", status: "active", profileComplete: true, profilePercent: 100 }],
          activeBusiness: { businessId: business.id, businessName: "Context Co", role: "owner", status: "active", profileComplete: true, profilePercent: 100 },
          landingPath: "/dashboard",
        });
        const text = JSON.stringify(view);
        for (const secret of ["passwordHash", "scrypt", "tokenHash", "sessionId", "openId", "lockedUntil", "failedAttempts", "authority", session.token()!]) expect(text).not.toContain(secret);
      });

      it("returns the same canonical context from sign-in, me and workspace", async () => {
        const user = await makeUser();
        const business = await makeBusiness("Same Co", user.id);
        await join(user.id, business.id, "business_admin");
        const b = browser();
        const fromSignIn = await b.call().account.signIn({ email: user.email, password: PASSWORD });
        expect(await b.call().account.me()).toEqual(fromSignIn);
        expect(await b.call().account.workspace()).toEqual(fromSignIn);
      });
    });

    describe("business settings", () => {
      it("lets an owner update name, description, year, sector and website, and returns the new completion", async () => {
        const { business, session, user } = await client("owner", "Settings Co");
        const profile = await session.call().account.updateBusiness({ businessId: business.id, name: "Settings Co Ltd", description: "We make fabric.", yearFounded: 2019, sector: "Textiles", website: "settings.example.com" });
        expect(profile).toMatchObject({ name: "Settings Co Ltd", description: "We make fabric.", yearFounded: 2019, sector: "Textiles", website: "https://settings.example.com", canEdit: true });
        expect(profile.completion).toEqual({ percent: 100, missing: [], complete: true });
        const row = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, business.id)))[0];
        expect(row).toMatchObject({ name: "Settings Co Ltd", yearFounded: 2019, website: "https://settings.example.com", slug: expect.any(String) });
        const view = (await session.call().account.me())!;
        expect(view.activeBusiness).toMatchObject({ businessName: "Settings Co Ltd", profileComplete: true, profilePercent: 100 });
        const events = await audit("business_profile_updated", user.id);
        expect(events).toHaveLength(1);
        expect(JSON.parse(events[0].details)).toEqual({ businessId: business.id, fields: ["name", "description", "yearFounded", "sector", "website"] });
        expect(events[0].details).not.toContain("We make fabric");
      });

      it("lets a business admin update, but not a member or an outsider", async () => {
        const owner = await client("owner", "Edit Co");
        const admin = await makeUser();
        const member = await makeUser();
        await join(admin.id, owner.business.id, "business_admin");
        await join(member.id, owner.business.id, "member");
        const outsider = await client("owner", "Out Co");
        await (await signIn(admin)).call().account.updateBusiness({ businessId: owner.business.id, sector: "Retail" });
        expect((await db.select().from(schema.businesses).where(eq(schema.businesses.id, owner.business.id)))[0].sector).toBe("Retail");
        await expect((await signIn(member)).call().account.updateBusiness({ businessId: owner.business.id, sector: "Hacked" })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.cannotEditBusiness });
        await expect(outsider.session.call().account.updateBusiness({ businessId: owner.business.id, sector: "Hacked" })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
        await expect(browser().call().account.updateBusiness({ businessId: owner.business.id, sector: "Hacked" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        expect((await db.select().from(schema.businesses).where(eq(schema.businesses.id, owner.business.id)))[0].sector).toBe("Retail");
      });

      it("changes only the fields sent, clears a blank optional field, and ignores fields it does not own", async () => {
        const { business, session } = await client("owner", "Partial Co");
        await session.call().account.updateBusiness({ businessId: business.id, description: "Keep me", sector: "Retail", website: "https://keep.example.com" });
        await session.call().account.updateBusiness({ businessId: business.id, sector: "  " });
        const afterBlank = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, business.id)))[0];
        expect(afterBlank).toMatchObject({ description: "Keep me", sector: null, website: "https://keep.example.com", name: "Partial Co" });
        // Fields that are not part of the profile are dropped, never written.
        await session.call().account.updateBusiness({ businessId: business.id, description: "Still here", status: "archived", slug: "taken", createdByUserId: 1, logoUrl: "https://evil.example/x.png" } as never);
        const afterExtra = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, business.id)))[0];
        expect(afterExtra).toMatchObject({ status: "active", slug: afterBlank.slug, createdByUserId: afterBlank.createdByUserId, logoUrl: null, description: "Still here" });
      });

      it.each([
        ["a one-letter name", { name: "A" }, /business name/i],
        ["a javascript: website", { website: "javascript:alert(1)" }, /valid website/i],
        ["a data: website", { website: "data:text/html,x" }, /valid website/i],
        ["a future year", { yearFounded: new Date().getFullYear() + 1 }, /valid year/i],
        ["a year before 1900", { yearFounded: 1800 }, /valid year/i],
        ["a fractional year", { yearFounded: 2019.5 }, undefined],
      ])("rejects %s and changes nothing", async (_label, patch, message) => {
        const { business, session } = await client("owner", "Invalid Co");
        const error = await session.call().account.updateBusiness({ businessId: business.id, ...patch }).catch((e: unknown) => e) as { code: string; message: string };
        expect(error.code).toBe("BAD_REQUEST");
        if (message) expect(error.message).toMatch(message);
        expect((await db.select().from(schema.businesses).where(eq(schema.businesses.id, business.id)))[0]).toMatchObject({ name: "Invalid Co", website: null, yearFounded: null });
      });

      it("calculates completion from what is filled in, never from a stored number", async () => {
        const { business, session } = await client("owner", "Percent Co");
        const percent = async () => (await session.call().account.business({ businessId: business.id })).completion.percent;
        expect(await percent()).toBe(20);
        await session.call().account.updateBusiness({ businessId: business.id, description: "d" });
        expect(await percent()).toBe(40);
        await session.call().account.updateBusiness({ businessId: business.id, yearFounded: 2020, sector: "s" });
        expect(await percent()).toBe(80);
        await session.call().account.updateBusiness({ businessId: business.id, website: "example.com" });
        expect(await percent()).toBe(100);
        await session.call().account.updateBusiness({ businessId: business.id, description: "" });
        expect(await percent()).toBe(80);
      });

      it("shows each workspace its own profile after switching", async () => {
        const user = await makeUser();
        const a = await makeBusiness("Alpha", user.id, { description: "alpha" });
        const b = await makeBusiness("Beta", user.id);
        await join(user.id, a.id, "owner");
        await join(user.id, b.id, "business_admin");
        const session = await signIn(user);
        expect((await session.call().account.business({ businessId: (await session.call().account.me())!.activeBusiness!.businessId })).name).toBe("Alpha");
        const switched = await session.call().account.switchWorkspace({ businessId: b.id });
        expect((await session.call().account.business({ businessId: switched.activeBusiness!.businessId })).name).toBe("Beta");
        await expect(session.call().account.updateBusiness({ businessId: a.id, name: "Alpha 2" })).resolves.toBeDefined();
      });
    });

    describe("account settings", () => {
      it("lets a person change their own name only, never anyone else's and never the email", async () => {
        const { user, session } = await client();
        const victim = await makeUser({ name: "Victim Name" });
        const view = await session.call().account.updateProfile({ fullName: "  New Name  ", userId: victim.id, email: "taken-over@example.test", role: "admin", status: "disabled" } as never);
        expect(view.user).toMatchObject({ id: user.id, fullName: "New Name", email: user.email });
        const rows = await db.select().from(schema.users).where(sql`${schema.users.id} in (${user.id}, ${victim.id})`);
        const mine = rows.find((row: { id: number }) => row.id === user.id);
        expect(mine).toMatchObject({ name: "New Name", email: user.email, role: "user", status: "active" });
        expect(rows.find((row: { id: number }) => row.id === victim.id).name).toBe("Victim Name");
        expect((await session.call().account.me())!.user.fullName).toBe("New Name");
        expect((await audit("account_profile_updated", user.id))).toHaveLength(1);
        await expect(session.call().account.updateProfile({ fullName: "A" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(browser().call().account.updateProfile({ fullName: "Nobody" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });

      it("changes the password after verifying the current one, rehashes it and signs out other devices only", async () => {
        const user = await makeUser();
        const business = await makeBusiness("Pwd Co", user.id);
        await join(user.id, business.id, "owner");
        const here = await signIn(user);
        const elsewhere = await signIn(user);
        const before = (await db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, user.id)))[0];

        await expect(here.call().account.changePassword({ currentPassword: "wrong password 1", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toMatchObject({ message: ACCOUNT_AUTH_ERRORS.wrongCurrentPassword });
        expect((await db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, user.id)))[0].passwordHash).toBe(before.passwordHash);

        await expect(here.call().account.changePassword({ currentPassword: PASSWORD, newPassword: "short1", confirmPassword: "short1" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/at least 10/) });
        await expect(here.call().account.changePassword({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: "different 123456" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/does not match/) });
        await expect(here.call().account.changePassword({ currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD })).rejects.toMatchObject({ code: "BAD_REQUEST" });

        await here.call().account.changePassword({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
        const after = (await db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, user.id)))[0];
        expect(after.passwordHash).not.toBe(before.passwordHash);
        expect(after.passwordHash).toMatch(/^scrypt\$/);
        expect(after.passwordHash).not.toContain(NEW_PASSWORD);
        expect(after).toMatchObject({ failedAttempts: 0, lockedUntil: null });
        // This device stays signed in; the other one is signed out.
        expect(await here.call().account.me()).not.toBeNull();
        expect(await elsewhere.call().account.me()).toBeNull();
        // The old password no longer works; the new one does.
        await expect(browser().call().account.signIn({ email: user.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await browser().call().account.signIn({ email: user.email, password: NEW_PASSWORD });
        const events = await audit("account_password_changed", user.id);
        expect(events).toHaveLength(1);
        expect(events[0].details).toBeNull();
        await expect(browser().call().account.changePassword({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });

      it("locks the credential when the current password is guessed wrong repeatedly", async () => {
        const user = await makeUser();
        const session = await signIn(user);
        for (let attempt = 0; attempt < ACCOUNT_MAX_FAILED_ATTEMPTS; attempt += 1) {
          await expect(session.call().account.changePassword({ currentPassword: `wrong password ${attempt}`, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toMatchObject({ message: ACCOUNT_AUTH_ERRORS.wrongCurrentPassword });
        }
        await expect(session.call().account.changePassword({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      });
    });

    describe("audit of sign-in events", () => {
      it("records sign-in, failed sign-in, lockout and sign-out without any secret", async () => {
        const user = await makeUser();
        await expect(browser().call().account.signIn({ email: user.email, password: "wrong password 1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        const b = browser();
        await b.call().account.signIn({ email: user.email, password: PASSWORD });
        const sessionToken = b.token()!;
        await b.call().account.signOut();
        expect(await audit("account_sign_in_failed", user.id)).toHaveLength(1);
        expect(await audit("account_signed_in", user.id)).toHaveLength(1);
        expect(await audit("account_signed_out", user.id)).toHaveLength(1);
        const all = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.actorUserId, user.id));
        for (const event of all) for (const secret of [PASSWORD, "wrong password", "scrypt", sessionToken, sha256(sessionToken)]) expect(`${event.details ?? ""}${event.targetEmail ?? ""}`).not.toContain(secret);
        // An unknown address writes nothing, so the log cannot be flooded.
        const before = (await db.select().from(schema.adminAccessAuditEvents)).length;
        await expect(browser().call().account.signIn({ email: uniqueEmail("ghost"), password: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        expect((await db.select().from(schema.adminAccessAuditEvents)).length).toBe(before);
      });
    });

    describe("admin counts", () => {
      it("reports business checks, users, businesses and memberships as separate numbers", async () => {
        const read = async () => superAdmin.call().onboarding.metrics();
        const start = await read();
        await db.insert(schema.businessChecks).values({ publicToken: unique("c"), fullName: "Lead", email: uniqueEmail("lead"), stage: "operating", answersJson: "{}" });
        const afterLead = await read();
        expect(afterLead.businessChecks).toBe(start.businessChecks + 1);
        expect([afterLead.users, afterLead.businesses, afterLead.memberships]).toEqual([start.users, start.businesses, start.memberships]);

        await client("owner", "Counted Co");
        const afterClient = await read();
        expect(afterClient.users).toBe(start.users + 1);
        expect(afterClient.portalUsers).toBe(start.portalUsers + 1);
        expect(afterClient.businesses).toBe(start.businesses + 1);
        expect(afterClient.memberships).toBe(start.memberships + 1);
        expect(afterClient.businessChecks).toBe(afterLead.businessChecks);

        const staff = await makeUser();
        await db.insert(schema.userPlatformRoles).values({ userId: staff.id, role: "analyst" });
        const afterStaff = await read();
        expect(afterStaff.users).toBe(afterClient.users + 1);
        expect(afterStaff.businesses).toBe(afterClient.businesses);
        expect(afterStaff.memberships).toBe(afterClient.memberships);
        expect(afterStaff.platformRoleAssignments).toBe(afterClient.platformRoleAssignments + 1);
      });
    });
  });
}
