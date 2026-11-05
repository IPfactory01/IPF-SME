/**
 * Staff sign-in through the universal account session (email and password), the internal-role rule, per-action
 * permissions and the owner bootstrap. Real application code, including the real request context, on PostgreSQL
 * (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
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

import { appRouter } from "@server/routers";
import { createContext } from "@server/_core/context";
import { resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import { ADMIN_ACCESS_COOKIE, hashAdminPassword, OWNER_ADMIN_EMAIL, sha256 } from "@server/adminSecurity";
import { bootstrapOwnerCredential } from "@server/ownerBootstrap";
import { ACCOUNT_AUTH_ERRORS, ACCOUNT_SESSION_COOKIE, PLATFORM_ROLES, type PlatformRole, type AccountSessionView } from "@shared/auth";
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
const OWNER_PASSWORD = "Owner-Pass-12345!";

/** A browser. Every call builds the REAL request context from the cookies, exactly as the server does. */
function browser(options: { ip?: string } = {}) {
  const jar = new Map<string, string>();
  const ip = options.ip ?? `198.51.100.${(counter += 1) % 250}`;
  const call = async () => {
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    const res = {
      cookie: (name: string, value: string) => void jar.set(name, value),
      clearCookie: (name: string) => void jar.delete(name),
    };
    const req = { ip, protocol: "https", headers: cookie ? { cookie } : {} };
    const context = await createContext({ req, res } as never);
    return appRouter.createCaller(context as TrpcContext);
  };
  return { call, jar, token: () => jar.get(ACCOUNT_SESSION_COOKIE) };
}
type Browser = ReturnType<typeof browser>;

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Staff sign-in and admin access on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function person(overrides: Record<string, unknown> = {}, roles: PlatformRole[] = []) {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name: "Test Person", role: "user", status: "active", ...overrides }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return user as { id: number; email: string };
    }
    async function staffSession(user: { email: string }) {
      const b = browser();
      await (await b.call()).account.signInInternal({ email: user.email, password: PASSWORD });
      return b;
    }
    const sessionsOf = async (userId: number) => db.select().from(schema.userSessions).where(eq(schema.userSessions.userId, userId));
    const audit = async (action: string, actorUserId: number) => db.select().from(schema.adminAccessAuditEvents).where(and(eq(schema.adminAccessAuditEvents.action, action), eq(schema.adminAccessAuditEvents.actorUserId, actorUserId)));

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
    }, 60_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => resetBusinessCheckRateLimitsForTests());

    describe("signing in", () => {
      it("signs an internal user in with the universal email and password and opens the admin area, with no administrator password", async () => {
        const user = await person({}, ["analyst"]);
        const b = browser();
        const view = (await (await b.call()).account.signInInternal({ email: user.email.toUpperCase(), password: PASSWORD })) as AccountSessionView;
        expect(view.platformRoles).toEqual(["analyst"]);
        expect(b.token()).toBeTruthy();
        const status = await (await b.call()).adminAccess.status();
        expect(status).toMatchObject({ email: user.email, passwordVerified: true, signedInVia: "account", platformRoles: ["analyst"], isAdmin: true, isOwner: false });
        // No administrator-password session was ever involved.
        expect(await db.select().from(schema.adminAccessSessions).where(eq(schema.adminAccessSessions.userId, user.id))).toHaveLength(0);
        expect((await sessionsOf(user.id)).length).toBe(1);
      });

      it("lets the Super Admin (the recognised owner) in and gives them everything", async () => {
        await db.insert(schema.users).values({ openId: unique("owner"), email: OWNER_ADMIN_EMAIL, role: "admin", name: "Owner" }).onConflictDoNothing();
        const owner = (await db.select().from(schema.users).where(eq(schema.users.email, OWNER_ADMIN_EMAIL)))[0];
        await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash });
        const b = await staffSession({ email: OWNER_ADMIN_EMAIL });
        const status = await (await b.call()).adminAccess.status();
        expect(status).toMatchObject({ passwordVerified: true, isOwner: true, signedInVia: "account" });
        expect(status.platformRoles).toEqual(["super_admin", "admin"]);
        expect(status.permissions.length).toBeGreaterThanOrEqual(10);
        await expect((await b.call()).platformRoles.list()).resolves.toBeDefined();
        await expect((await b.call()).onboarding.metrics()).resolves.toBeDefined();
        await expect((await b.call()).inboundReplies.list()).resolves.toBeDefined();
      });

      it("lets an administrator in, with only the responsibilities granted to them", async () => {
        const admin = await person({ role: "admin" });
        await db.insert(schema.adminPermissionProfiles).values({ userId: admin.id, permissionsJson: JSON.stringify(["manage_client_onboarding"]) });
        const b = await staffSession(admin);
        const status = await (await b.call()).adminAccess.status();
        expect(status).toMatchObject({ passwordVerified: true, isAdmin: true, isOwner: false, platformRoles: ["admin"] });
        expect(status.permissions).toEqual(["manage_client_onboarding"]);
        await expect((await b.call()).onboarding.candidates()).resolves.toBeDefined();
        await expect((await b.call()).inboundReplies.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await b.call()).platformRoles.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it.each(PLATFORM_ROLES.filter(role => role !== "super_admin" && role !== "admin"))("lets a %s in, and decides each action by permission, not by being internal", async role => {
        const user = await person({}, [role]);
        const b = await staffSession(user);
        const status = await (await b.call()).adminAccess.status();
        expect(status).toMatchObject({ passwordVerified: true, platformRoles: [role], isOwner: false });
        // Every internal role can enter; none can do everything.
        await expect((await b.call()).platformRoles.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await b.call()).onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
        const canReadCommunications = role === "desk_lead";
        const attempt = (await b.call()).inboundReplies.list();
        if (canReadCommunications) await expect(attempt).resolves.toBeDefined();
        else await expect(attempt).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("treats a platform role and the equivalent legacy profile the same", async () => {
        const viaRole = await staffSession(await person({}, ["desk_lead"]));
        const admin = await person({ role: "admin" });
        await db.insert(schema.adminPermissionProfiles).values({ userId: admin.id, permissionsJson: JSON.stringify(["view_communications"]) });
        const viaProfile = await staffSession(admin);
        await expect((await viaRole.call()).inboundReplies.list()).resolves.toBeDefined();
        await expect((await viaProfile.call()).inboundReplies.list()).resolves.toBeDefined();
      });

      it("keeps a staff session across requests and ends it on sign-out, through the shared sign-out", async () => {
        const user = await person({}, ["partner"]);
        const b = await staffSession(user);
        expect((await (await b.call()).adminAccess.status()).passwordVerified).toBe(true);
        expect((await (await b.call()).adminAccess.status()).passwordVerified).toBe(true);
        await (await b.call()).auth.logout();
        expect(b.token()).toBeUndefined();
        await expect((await b.call()).adminAccess.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        expect((await sessionsOf(user.id))[0].revokedAt).toBeInstanceOf(Date);
      });
    });

    describe("clients and everyone without an internal role", () => {
      it("refuses a client at the staff sign-in, with one generic message, before any session exists", async () => {
        const client = await person();
        const business = (await db.insert(schema.businesses).values({ name: "Client Co", slug: unique("slug"), createdByUserId: client.id }).returning())[0];
        await db.insert(schema.businessMemberships).values({ businessId: business.id, userId: client.id, role: "owner" });
        const b = browser();
        await expect((await b.call()).account.signInInternal({ email: client.email, password: PASSWORD })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.notAuthorisedForAdmin });
        expect(b.token()).toBeUndefined();
        expect(await sessionsOf(client.id)).toHaveLength(0);
        expect(await audit("admin_sign_in_refused", client.id)).toHaveLength(1);
        // A wrong password still looks like any other wrong password, not like "not authorised".
        await expect((await browser().call()).account.signInInternal({ email: client.email, password: "wrong password 1" })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.invalidCredentials });
      });

      it("never lets a client reach the admin area, even signed in through the normal client sign-in", async () => {
        const client = await person();
        const business = (await db.insert(schema.businesses).values({ name: "Owner Co", slug: unique("slug"), createdByUserId: client.id }).returning())[0];
        await db.insert(schema.businessMemberships).values({ businessId: business.id, userId: client.id, role: "owner" });
        const b = browser();
        const view = (await (await b.call()).account.signIn({ email: client.email, password: PASSWORD })) as AccountSessionView;
        expect(view.landingPath).toBe("/dashboard");
        expect(view.activeBusiness?.role).toBe("owner");
        // Signed in as a client, but the staff identity stays empty.
        await expect((await b.call()).adminAccess.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect((await b.call()).onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await b.call()).platformRoles.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await b.call()).inboundReplies.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await b.call()).registration.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await (await b.call()).account.me())!.platformRoles).toEqual([]);
      });

      it("does not turn a business owner into an administrator, whatever their membership role", async () => {
        const owner = await person();
        for (const role of ["owner", "business_admin", "member"] as const) {
          const business = (await db.insert(schema.businesses).values({ name: `Co ${role}`, slug: unique("slug"), createdByUserId: owner.id }).returning())[0];
          await db.insert(schema.businessMemberships).values({ businessId: business.id, userId: owner.id, role });
        }
        await expect((await browser().call()).account.signInInternal({ email: owner.email, password: PASSWORD })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.notAuthorisedForAdmin });
      });

      it("rejects a visitor with no session", async () => {
        const b = browser();
        await expect((await b.call()).adminAccess.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect((await b.call()).onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
      });
    });

    describe("disabled and suspended staff", () => {
      it("cannot sign in, and an existing session stops working at once", async () => {
        const user = await person({}, ["analyst"]);
        const b = await staffSession(user);
        expect((await (await b.call()).adminAccess.status()).passwordVerified).toBe(true);
        await db.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, user.id));
        await expect((await b.call()).adminAccess.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect((await browser().call()).account.signInInternal({ email: user.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.invalidCredentials });
        const suspended = await person({ status: "suspended" }, ["partner"]);
        await expect((await browser().call()).account.signInInternal({ email: suspended.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });

      it("loses admin access when the internal role is taken away", async () => {
        const user = await person({}, ["finance"]);
        const b = await staffSession(user);
        expect((await (await b.call()).adminAccess.status()).passwordVerified).toBe(true);
        await db.delete(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, user.id));
        await expect((await b.call()).adminAccess.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });

      it("locks the credential after repeated wrong passwords at the staff sign-in too", async () => {
        const user = await person({}, ["analyst"]);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await expect((await browser({ ip: `203.0.113.${attempt + 1}` }).call()).account.signInInternal({ email: user.email, password: "wrong password 1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        }
        await expect((await browser({ ip: "203.0.113.200" }).call()).account.signInInternal({ email: user.email, password: PASSWORD })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      });
    });

    describe("legacy administrator channel is unchanged", () => {
      async function legacyAdmin(withPasswordSession: boolean) {
        const [user] = await db.insert(schema.users).values({ openId: unique("legacy"), email: uniqueEmail("legacy"), role: "admin", name: "Legacy" }).returning();
        await db.insert(schema.adminPermissionProfiles).values({ userId: user.id, permissionsJson: JSON.stringify(["manage_client_onboarding"]) });
        const raw = unique("admin-session");
        if (withPasswordSession) await db.insert(schema.adminAccessSessions).values({ userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3_600_000) });
        const headers = withPasswordSession ? { cookie: `${ADMIN_ACCESS_COOKIE}=${raw}` } : {};
        return appRouter.createCaller({ req: { ip: "203.0.113.50", protocol: "https", headers }, res: {}, user, authChannel: "legacy" } as unknown as TrpcContext);
      }

      it("still needs the administrator-password session", async () => {
        await expect((await legacyAdmin(false)).onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/verify your .* administrator password/i) });
        await expect((await legacyAdmin(true)).onboarding.candidates()).resolves.toBeDefined();
        expect(await (await legacyAdmin(true)).adminAccess.status()).toMatchObject({ passwordVerified: true, signedInVia: "legacy", isAdmin: true });
        expect(await (await legacyAdmin(false)).adminAccess.status()).toMatchObject({ passwordVerified: false });
      });

      it("keeps the legacy role gate: a legacy user without the admin flag is refused", async () => {
        const [user] = await db.insert(schema.users).values({ openId: unique("plain"), email: uniqueEmail("plain"), role: "user" }).returning();
        const caller = appRouter.createCaller({ req: { ip: "203.0.113.51", protocol: "https", headers: {} }, res: {}, user, authChannel: "legacy" } as unknown as TrpcContext);
        await expect(caller.onboarding.candidates()).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("prefers the legacy session when both are present", async () => {
        const staff = await person({}, ["analyst"]);
        const b = await staffSession(staff);
        const context = await createContext({ req: { ip: "203.0.113.52", protocol: "https", headers: { cookie: `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(b.token()!)}` } }, res: {} } as never);
        expect(context.authChannel).toBe("account");
        expect(context.user?.id).toBe(staff.id);
      });
    });

    describe("owner bootstrap", () => {
      async function ownerRow() {
        return (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
      }
      const credentialOf = async (userId: number) => (await db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, userId)))[0];

      it("creates the owner account when it does not exist, stores only a hash, and lets the owner sign in", async () => {
        await db.delete(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`);
        const result = await bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: OWNER_PASSWORD });
        expect(result.action).toBe("created-account");
        const owner = await ownerRow();
        expect(owner).toMatchObject({ role: "admin", status: "active", loginMethod: "password" });
        const credential = await credentialOf(owner.id);
        expect(credential.passwordHash).toMatch(/^scrypt\$/);
        expect(credential.passwordHash).not.toContain(OWNER_PASSWORD);
        const b = browser();
        await (await b.call()).account.signInInternal({ email: OWNER_ADMIN_EMAIL, password: OWNER_PASSWORD });
        expect((await (await b.call()).adminAccess.status())).toMatchObject({ isOwner: true, passwordVerified: true });
        const events = await audit("owner_credential_bootstrapped", owner.id);
        expect(events).toHaveLength(1);
        expect(JSON.stringify(events[0])).not.toContain(OWNER_PASSWORD);
      });

      it("adds a credential to an existing owner (a legacy OAuth user) without creating a second identity", async () => {
        await db.delete(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`);
        const [legacy] = await db.insert(schema.users).values({ openId: "manus-owner-openid", email: OWNER_ADMIN_EMAIL.toUpperCase(), name: "Owner", role: "user", loginMethod: "google" }).returning();
        const before = (await db.select().from(schema.users)).length;
        const result = await bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: OWNER_PASSWORD });
        expect(result).toEqual({ action: "set-password", userId: legacy.id });
        expect((await db.select().from(schema.users)).length).toBe(before);
        const refreshed = (await db.select().from(schema.users).where(eq(schema.users.id, legacy.id)))[0];
        expect(refreshed).toMatchObject({ role: "admin", openId: "manus-owner-openid" });
      });

      it("refuses any address other than the recognised owner", async () => {
        const before = (await db.select().from(schema.userCredentials)).length;
        await expect(bootstrapOwnerCredential(db, { email: uniqueEmail("not-the-owner"), password: OWNER_PASSWORD })).rejects.toThrow(/recognised owner/);
        await expect(bootstrapOwnerCredential(db, { email: "", password: OWNER_PASSWORD })).rejects.toThrow(/recognised owner/);
        expect((await db.select().from(schema.userCredentials)).length).toBe(before);
      });

      it("enforces the administrator password policy", async () => {
        for (const weak of ["short", "alllowercaseletters", "NoSymbolsOrDigitsHere"]) {
          await expect(bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: weak })).rejects.toThrow();
        }
      });

      it("never overwrites an existing password unless a reset is asked for, and a reset signs the owner out everywhere", async () => {
        const owner = (await ownerRow()) ?? (await bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: OWNER_PASSWORD }), await ownerRow());
        const before = (await credentialOf(owner.id)).passwordHash;
        await expect(bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: "Another-Pass-98765!" })).rejects.toThrow(/--reset/);
        expect((await credentialOf(owner.id)).passwordHash).toBe(before);

        await db.insert(schema.userSessions).values({ userId: owner.id, tokenHash: sha256(unique("tok")), expiresAt: new Date(Date.now() + 60_000) });
        const reset = await bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: "Another-Pass-98765!", replaceExisting: true });
        expect(reset.action).toBe("reset-password");
        expect((await credentialOf(owner.id)).passwordHash).not.toBe(before);
        expect((await sessionsOf(owner.id)).every((row: { revokedAt: Date | null }) => row.revokedAt !== null)).toBe(true);
        expect(await audit("owner_credential_reset", owner.id)).toHaveLength(1);
      });

      it("will not silently reactivate a disabled owner", async () => {
        const owner = await ownerRow();
        await db.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, owner.id));
        try {
          await expect(bootstrapOwnerCredential(db, { email: OWNER_ADMIN_EMAIL, password: OWNER_PASSWORD, replaceExisting: true })).rejects.toThrow(/not active/);
        } finally {
          await db.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, owner.id));
        }
      });
    });
  });
}
