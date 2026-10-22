/**
 * Universal account authentication on PostgreSQL: PGlite on every run, plus TEST_DATABASE_URL when set
 * (`pnpm test:db`). Real application code and a real schema; only email delivery is irrelevant (never called).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
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
import { ACCOUNT_AUTH_ERRORS, ACCOUNT_LOCKOUT_MS, ACCOUNT_SESSION_COOKIE } from "@shared/auth";
import { OWNER_ADMIN_EMAIL } from "@server/adminSecurity";
import { createOnboardingInvitation } from "@server/clientOnboarding";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "@server/_core/context";

const REMOTE_TEST_TIMEOUT_MS = 30_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const uniqueEmail = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const PASSWORD = "correct horse 42";

type Cookie = { value: string; options: Record<string, unknown> };

/** A browser: remembers the session cookie between calls, like a real client. */
function browser(options: { ip?: string; protocol?: string; origin?: string; host?: string } = {}) {
  const jar = new Map<string, Cookie>();
  const ip = options.ip ?? `198.51.100.${(counter += 1) % 250}`;
  const sets: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const call = () => {
    const cookie = [...jar.entries()].map(([name, entry]) => `${name}=${encodeURIComponent(entry.value)}`).join("; ");
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (options.origin) headers.origin = options.origin;
    if (options.host) headers.host = options.host;
    const ctx = {
      req: { ip, protocol: options.protocol ?? "https", headers },
      res: {
        cookie: (name: string, value: string, cookieOptions: Record<string, unknown>) => {
          jar.set(name, { value, options: cookieOptions });
          sets.push({ name, value, options: cookieOptions });
        },
        clearCookie: (name: string) => void jar.delete(name),
      },
      user: null,
    } as unknown as TrpcContext;
    return appRouter.createCaller(ctx);
  };
  return { call, jar, sets, token: () => jar.get(ACCOUNT_SESSION_COOKIE)?.value };
}

const signUpInput = (email: string, extra: Record<string, string> = {}) => ({
  fullName: "Ada Example", email, password: PASSWORD, confirmPassword: PASSWORD, businessName: "Example Traders", ...extra,
});

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Universal account authentication on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    let actorUserId = 0;

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      // The administrator who issues the invitations used to set accounts up.
      const [actor] = await db.insert(schema.users).values({ openId: `seed-admin-${Math.random()}`, role: "admin", email: uniqueEmail("seed-admin") }).returning();
      actorUserId = actor.id;
    }, 60_000);

    /**
     * Accounts exist only through the real onboarding path: a business check is invited, then the invitation is
     * accepted. `input.email` may be malformed or taken; the invitation then uses a placeholder (or is refused).
     */
    async function onboard(client: ReturnType<typeof browser>, input: ReturnType<typeof signUpInput>) {
      const wellFormed = /^\S+@\S+\.\S+$/.test(input.email.trim());
      const [check] = await db.insert(schema.businessChecks).values({
        publicToken: `check-${(counter += 1)}-${Math.random().toString(36).slice(2, 10)}`,
        fullName: input.fullName || "Prospect",
        email: wellFormed ? input.email : uniqueEmail("placeholder"),
        businessName: input.businessName.trim() || null,
        stage: "unknown",
        answersJson: "{}",
      }).returning();
      const invitation = await createOnboardingInvitation({ businessCheckId: check.id, actorUserId, overrideReason: "Test account" });
      const token = decodeURIComponent(invitation.invitationUrl.split("/onboarding/")[1]);
      return client.call().onboarding.accept({ token, fullName: input.fullName, email: input.email, password: input.password, confirmPassword: input.confirmPassword, businessName: input.businessName });
    }
    afterAll(async () => {
      await harness?.close();
    });

    const rowsFor = async (email: string) => {
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

    describe("account activation through an onboarding invitation", () => {
      it("creates one user, credential, business, owner membership and session, and signs the browser in", async () => {
        const email = uniqueEmail("signup");
        const b = browser();
        const view = await onboard(b, signUpInput(email));

        const rows = await rowsFor(email);
        expect(rows.user).toMatchObject({ email, name: "Ada Example", status: "active", role: "user", loginMethod: "password" });
        expect(rows.user.openId).toMatch(/^local:/);
        expect(rows.credentials).toHaveLength(1);
        expect(rows.businesses).toHaveLength(1);
        expect(rows.businesses[0]).toMatchObject({ name: "Example Traders", status: "active", description: null, sector: null });
        expect(rows.memberships).toHaveLength(1);
        expect(rows.memberships[0]).toMatchObject({ role: "owner", status: "active", businessId: rows.businesses[0].id });
        expect(rows.sessions).toHaveLength(1);

        expect(view).toEqual({
          user: { id: rows.user.id, fullName: "Ada Example", email, status: "active" },
          platformRoles: [],
          permissions: [],
          memberships: [{ businessId: rows.businesses[0].id, businessName: "Example Traders", role: "owner", status: "active", profileComplete: false, profilePercent: 20 }],
          activeBusiness: { businessId: rows.businesses[0].id, businessName: "Example Traders", role: "owner", status: "active", profileComplete: false, profilePercent: 20 },
          landingPath: "/dashboard",
        });
        // Only safe data is returned.
        expect(JSON.stringify(view)).not.toMatch(/passwordHash|scrypt|tokenHash/);
        expect(JSON.stringify(view)).not.toContain(b.token()!);
      });

      it("stores only a hash of the session token and sets a hardened cookie", async () => {
        const b = browser({ protocol: "https" });
        const email = uniqueEmail("cookie");
        await onboard(b, signUpInput(email));
        const token = b.token()!;
        const { sessions } = await rowsFor(email);
        expect(token.length).toBeGreaterThanOrEqual(43);
        expect(sessions[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(sessions[0].tokenHash).not.toContain(token);
        const cookie = b.jar.get(ACCOUNT_SESSION_COOKIE)!;
        expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
        expect(cookie.options.maxAge).toBeGreaterThan(0);
      });

      it("hashes the password with scrypt and never stores it", async () => {
        const email = uniqueEmail("hash");
        await onboard(browser(), signUpInput(email));
        const { credentials } = await rowsFor(email);
        expect(credentials[0].passwordHash).toMatch(/^scrypt\$/);
        expect(credentials[0].passwordHash).not.toContain(PASSWORD);
        expect(credentials[0]).toMatchObject({ failedAttempts: 0, lockedUntil: null });
      });

      it.each(["user", "credential", "business", "membership"] as const)("rolls everything back when the %s insert fails", async step => {
        const email = uniqueEmail(`rollback-${step}`);
        const table = { user: "users", credential: "user_credentials", business: "businesses", membership: "business_memberships" }[step];
        await db.execute(sql.raw(`create or replace function ipf_force_failure() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`));
        await db.execute(sql.raw(`create trigger ipf_force_failure before insert on ${table} for each row execute function ipf_force_failure()`));
        try {
          await expect(onboard(browser(), signUpInput(email, { businessName: `Rollback ${step}` }))).rejects.toBeTruthy();
        } finally {
          await db.execute(sql.raw(`drop trigger ipf_force_failure on ${table}`));
        }
        const rows = await rowsFor(email);
        expect(rows.user).toBeUndefined();
        expect(await db.select().from(schema.businesses).where(eq(schema.businesses.name, `Rollback ${step}`))).toHaveLength(0);
        // Nothing orphaned anywhere: no credential, membership or session for a user that does not exist.
        const orphans = await harness.query(sql`select (select count(*) from user_credentials where "userId" not in (select id from users)) as c, (select count(*) from business_memberships where "userId" not in (select id from users)) as m, (select count(*) from user_sessions where "userId" not in (select id from users)) as s`);
        expect(orphans[0]).toEqual({ c: expect.anything(), m: expect.anything(), s: expect.anything() });
        expect([Number(orphans[0].c), Number(orphans[0].m), Number(orphans[0].s)]).toEqual([0, 0, 0]);
        // The email is still free: a clean retry works.
        await onboard(browser(), signUpInput(email, { businessName: `Rollback ${step}` }));
        expect((await rowsFor(email)).businesses).toHaveLength(1);
      });

      it("rejects a duplicate email case-insensitively, even against a legacy mixed-case user", async () => {
        const email = uniqueEmail("dup");
        await onboard(browser(), signUpInput(email));
        await expect(onboard(browser(), signUpInput(email.toUpperCase()))).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(onboard(browser(), signUpInput(`  ${email}  `))).rejects.toMatchObject({ code: "CONFLICT" });
        expect(await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`)).toHaveLength(1);

        const legacy = uniqueEmail("Legacy").replace("legacy", "LeGaCy");
        await db.insert(schema.users).values({ openId: `oauth-${legacy}`, email: legacy, name: "Legacy" });
        await expect(onboard(browser(), signUpInput(legacy.toLowerCase()))).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("refuses the owner administrator's email and pending administrator invitations", async () => {
        await expect(onboard(browser(), signUpInput(OWNER_ADMIN_EMAIL))).rejects.toMatchObject({ code: "CONFLICT" });
        const invited = uniqueEmail("invited");
        const [owner] = await db.insert(schema.users).values({ openId: `owner-${invited}`, role: "admin" }).returning();
        await db.insert(schema.adminInvitations).values({ email: invited, tokenHash: `h-${invited}`.slice(0, 64), createdByUserId: owner.id, expiresAt: new Date(Date.now() + 86_400_000), proposedPermissionsJson: "[]" });
        await expect(onboard(browser(), signUpInput(invited))).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("answers each kind of email problem with its own code: invalid is BAD_REQUEST, taken or reserved is CONFLICT", async () => {
        const taken = uniqueEmail("outcome-taken");
        await onboard(browser(), signUpInput(taken));
        const invited = uniqueEmail("outcome-invited");
        const [admin] = await db.insert(schema.users).values({ openId: `outcome-${invited}`, role: "admin" }).returning();
        await db.insert(schema.adminInvitations).values({ email: invited, tokenHash: `h-${invited}`.slice(0, 64), createdByUserId: admin.id, expiresAt: new Date(Date.now() + 86_400_000), proposedPermissionsJson: "[]" });

        // The owner address must itself be well formed, whatever the environment says (it falls back to a default when blank).
        expect(OWNER_ADMIN_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
        const outcomes = async (email: string) => onboard(browser(), signUpInput(email)).then(() => "created", (error: { code: string }) => error.code);
        expect(await outcomes("not-an-email")).toBe("BAD_REQUEST");
        expect(await outcomes("")).toBe("BAD_REQUEST");
        expect(await outcomes(taken)).toBe("CONFLICT");
        expect(await outcomes(OWNER_ADMIN_EMAIL)).toBe("CONFLICT");
        expect(await outcomes(OWNER_ADMIN_EMAIL.toUpperCase())).toBe("CONFLICT");
        expect(await outcomes(invited)).toBe("CONFLICT");
        expect(await outcomes(uniqueEmail("outcome-free"))).toBe("created");
        // Seven full invite-and-accept round trips: about 150 network round trips on a real database.
      }, 90_000);

      it.each([
        ["a short password", { password: "a1", confirmPassword: "a1" }, /at least 10/],
        ["no number", { password: "onlyletters!!", confirmPassword: "onlyletters!!" }, /letter and one number/],
        ["a mismatched confirmation", { confirmPassword: "different 12345" }, /does not match/],
        ["an invalid email", { email: "not-an-email" }, /valid email/],
        ["a missing business name", { businessName: " " }, /business name/i],
        ["a one-letter name", { fullName: "A" }, /full name/i],
      ])("rejects %s without writing anything", async (_label, patch, message) => {
        const before = (await db.select().from(schema.users)).length;
        await expect(onboard(browser(), { ...signUpInput(uniqueEmail("invalid")), ...patch })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(message) });
        expect((await db.select().from(schema.users)).length).toBe(before);
      });
    });

    describe("sign-in", () => {
      it("signs in with the right password, issues a new session and updates lastSignedIn", async () => {
        const email = uniqueEmail("login");
        await onboard(browser(), signUpInput(email));
        await db.update(schema.users).set({ lastSignedIn: new Date("2001-01-01T00:00:00Z") }).where(sql`lower(${schema.users.email}) = ${email}`);

        const b = browser();
        const view = await b.call().account.signIn({ email: email.toUpperCase(), password: PASSWORD });
        expect(view.user.email).toBe(email);
        expect(view.activeBusiness?.role).toBe("owner");
        const { user, sessions } = await rowsFor(email);
        expect(user.lastSignedIn.getFullYear()).toBeGreaterThan(2020);
        expect(sessions).toHaveLength(2);
        expect(b.token()).toBeTruthy();
      });

      it("fails wrong password, unknown email and a suspended account with the same message", async () => {
        const email = uniqueEmail("generic");
        await onboard(browser(), signUpInput(email));
        const wrongPassword = await browser().call().account.signIn({ email, password: "wrong password 1" }).catch((e: unknown) => e);
        const unknownEmail = await browser().call().account.signIn({ email: uniqueEmail("ghost"), password: "wrong password 1" }).catch((e: unknown) => e);
        await db.update(schema.users).set({ status: "suspended" }).where(sql`lower(${schema.users.email}) = ${email}`);
        const suspended = await browser().call().account.signIn({ email, password: PASSWORD }).catch((e: unknown) => e);
        for (const error of [wrongPassword, unknownEmail, suspended]) {
          expect(error).toMatchObject({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.invalidCredentials });
        }
      });

      it("locks the credential after five failures, even for the right password, until the lock expires", async () => {
        const email = uniqueEmail("lock");
        await onboard(browser(), signUpInput(email));
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await expect(browser({ ip: `203.0.113.${attempt + 1}` }).call().account.signIn({ email, password: "wrong password 1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        }
        const { credentials } = await rowsFor(email);
        expect(credentials[0].lockedUntil.getTime()).toBeGreaterThan(Date.now());
        expect(credentials[0].lockedUntil.getTime()).toBeLessThanOrEqual(Date.now() + ACCOUNT_LOCKOUT_MS + 1000);
        // A fresh address is not throttled, so this is the database lockout speaking.
        await expect(browser({ ip: "203.0.113.200" }).call().account.signIn({ email, password: PASSWORD })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });

        await db.update(schema.userCredentials).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(schema.userCredentials.id, credentials[0].id));
        await browser({ ip: "203.0.113.201" }).call().account.signIn({ email, password: PASSWORD });
        expect((await rowsFor(email)).credentials[0]).toMatchObject({ failedAttempts: 0, lockedUntil: null });
      });

      it("throttles repeated attempts from one address for an email that does not exist, with the same message", async () => {
        const ghost = uniqueEmail("nobody");
        const b = browser({ ip: "192.0.2.77" });
        for (let attempt = 0; attempt < 5; attempt += 1) await expect(b.call().account.signIn({ email: ghost, password: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(b.call().account.signIn({ email: ghost, password: "x" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
      });
    });

    describe("sessions", () => {
      it("keeps the user signed in across separate requests (a page refresh)", async () => {
        const b = browser();
        const email = uniqueEmail("refresh");
        await onboard(b, signUpInput(email));
        const first = await b.call().account.me();
        const second = await b.call().account.me();
        expect(first?.user.email).toBe(email);
        expect(second).toEqual(first);
        expect((await b.call().account.workspace()).activeBusiness?.role).toBe("owner");
      });

      it("signs out: revokes the session server-side, clears the cookie and rejects the old token", async () => {
        const b = browser();
        const email = uniqueEmail("logout");
        await onboard(b, signUpInput(email));
        const stolen = { cookie: `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(b.token()!)}` };
        expect(await b.call().account.signOut()).toEqual({ success: true });
        expect(b.token()).toBeUndefined();
        const { sessions } = await rowsFor(email);
        expect(sessions[0].revokedAt).toBeInstanceOf(Date);

        const replay = appRouter.createCaller({ req: { ip: "198.51.100.250", protocol: "https", headers: stolen }, res: {}, user: null } as unknown as TrpcContext);
        expect(await replay.account.me()).toBeNull();
        await expect(replay.account.workspace()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        // Signing out again, or when never signed in, is harmless.
        expect(await browser().call().account.signOut()).toEqual({ success: true });
      });

      it("rejects an expired session, a revoked session and a suspended user", async () => {
        const email = uniqueEmail("expiry");
        const b = browser();
        await onboard(b, signUpInput(email));
        expect(await b.call().account.me()).not.toBeNull();

        await db.update(schema.userSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(sql`"userId" = (select id from users where lower(email) = ${email})`);
        expect(await b.call().account.me()).toBeNull();

        await db.update(schema.userSessions).set({ expiresAt: new Date(Date.now() + 3_600_000), revokedAt: new Date() }).where(sql`"userId" = (select id from users where lower(email) = ${email})`);
        expect(await b.call().account.me()).toBeNull();

        await db.update(schema.userSessions).set({ revokedAt: null }).where(sql`"userId" = (select id from users where lower(email) = ${email})`);
        expect(await b.call().account.me()).not.toBeNull();
        await db.update(schema.users).set({ status: "suspended" }).where(sql`lower(${schema.users.email}) = ${email}`);
        expect(await b.call().account.me()).toBeNull();
      });

      it("rejects anonymous requests to protected procedures without triggering the legacy login redirect", async () => {
        const anonymous = browser().call();
        for (const attempt of [() => anonymous.account.workspace(), () => anonymous.account.business({ businessId: 1 })]) {
          const error = await attempt().catch((e: unknown) => e) as { code: string; message: string };
          expect(error.code).toBe("UNAUTHORIZED");
          expect(error.message).toBe(ACCOUNT_AUTH_ERRORS.signInRequired);
          expect(error.message).not.toBe(UNAUTHED_ERR_MSG);
        }
        expect(await anonymous.account.me()).toBeNull();
      });

      it("refuses a sign-up, sign-in or sign-out whose Origin is another site", async () => {
        const hostile = browser({ origin: "https://evil.example", host: "app.example.test" });
        await expect(onboard(hostile, signUpInput(uniqueEmail("csrf")))).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.crossSite });
        await expect(hostile.call().account.signIn({ email: "a@example.test", password: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(hostile.call().account.signOut()).rejects.toMatchObject({ code: "FORBIDDEN" });
        const same = browser({ origin: "https://app.example.test", host: "app.example.test" });
        await onboard(same, signUpInput(uniqueEmail("sameorigin")));
      });
    });

    describe("business isolation and memberships", () => {
      it("never lets a user read another business by supplying its id", async () => {
        const a = browser();
        const bUser = browser();
        const viewA = await onboard(a, signUpInput(uniqueEmail("tenant-a"), { businessName: "Tenant A" }));
        const viewB = await onboard(bUser, signUpInput(uniqueEmail("tenant-b"), { businessName: "Tenant B" }));
        const idA = viewA.activeBusiness!.businessId;
        const idB = viewB.activeBusiness!.businessId;
        expect(idA).not.toBe(idB);

        expect(await a.call().account.business({ businessId: idA })).toMatchObject({ name: "Tenant A", role: "owner" });
        await expect(a.call().account.business({ businessId: idB })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
        await expect(bUser.call().account.business({ businessId: idA })).rejects.toMatchObject({ code: "FORBIDDEN" });
        // A business that does not exist is indistinguishable from one the caller cannot access.
        await expect(a.call().account.business({ businessId: 2_000_000_000 })).rejects.toMatchObject({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
      });

      it("ignores suspended or removed memberships and suspended businesses", async () => {
        const b = browser();
        const view = await onboard(b, signUpInput(uniqueEmail("inactive"), { businessName: "Inactive Co" }));
        const id = view.activeBusiness!.businessId;
        await db.update(schema.businessMemberships).set({ status: "removed" }).where(eq(schema.businessMemberships.businessId, id));
        expect((await b.call().account.me())!.memberships).toEqual([]);
        await expect(b.call().account.business({ businessId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await db.update(schema.businessMemberships).set({ status: "active" }).where(eq(schema.businessMemberships.businessId, id));
        await db.update(schema.businesses).set({ status: "suspended" }).where(eq(schema.businesses.id, id));
        expect((await b.call().account.me())!.memberships).toEqual([]);
      });

      it("supports several memberships per user and several users per business at database level", async () => {
        const owner = browser();
        const email = uniqueEmail("multi");
        const view = await onboard(owner, signUpInput(email, { businessName: "First Co" }));
        const { user } = await rowsFor(email);
        const [second] = await db.insert(schema.businesses).values({ name: "Second Co", slug: `second-${email}`.slice(0, 80), createdByUserId: user.id }).returning();
        await db.insert(schema.businessMemberships).values({ businessId: second.id, userId: user.id, role: "business_admin" });

        const after = (await owner.call().account.me())!;
        expect(after.memberships.map(m => [m.businessName, m.role])).toEqual([["First Co", "owner"], ["Second Co", "business_admin"]]);
        // Two businesses: one is the active workspace (the first until the person switches).
        expect(after.activeBusiness?.businessName).toBe("First Co");
        expect((await owner.call().account.business({ businessId: second.id })).role).toBe("business_admin");

        const teammate = browser();
        const teammateEmail = uniqueEmail("teammate");
        await onboard(teammate, signUpInput(teammateEmail, { businessName: "Teammate Co" }));
        const { user: teammateUser } = await rowsFor(teammateEmail);
        await db.insert(schema.businessMemberships).values({ businessId: view.activeBusiness!.businessId, userId: teammateUser.id, role: "member" });
        const members = await db.select().from(schema.businessMemberships).where(eq(schema.businessMemberships.businessId, view.activeBusiness!.businessId));
        expect(members.map((m: { role: string }) => m.role).sort()).toEqual(["member", "owner"]);
      });

      it("rejects a duplicate membership for the same business and user", async () => {
        const email = uniqueEmail("dupmember");
        const view = await onboard(browser(), signUpInput(email));
        const { user } = await rowsFor(email);
        const failure = await db.insert(schema.businessMemberships).values({ businessId: view.activeBusiness!.businessId, userId: user.id, role: "member" }).then(() => null, (e: unknown) => e);
        expect(pgErrorCode(failure)).toBe("23505");
      });

      it("rejects a membership for a business or user that does not exist", async () => {
        const failure = await db.insert(schema.businessMemberships).values({ businessId: 2_000_000_000, userId: 2_000_000_000 }).then(() => null, (e: unknown) => e);
        expect(pgErrorCode(failure)).toBe("23503");
      });
    });

    describe("coexistence with existing flows", () => {
      it("keeps the Free Business Health Check public: no account is needed", async () => {
        const error = await browser().call().businessCheck.requestNext({ token: "x".repeat(24), choice: "call" }).catch((e: unknown) => e) as { code: string };
        expect(error.code).toBe("NOT_FOUND");
      });

      it("does not turn an account session into administrator access", async () => {
        const b = browser();
        await onboard(b, signUpInput(uniqueEmail("notadmin")));
        await expect(b.call().scheduling.adminList({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("leaves the legacy users.role gate as user for new accounts", async () => {
        const email = uniqueEmail("role");
        await onboard(browser(), signUpInput(email));
        expect((await rowsFor(email)).user.role).toBe("user");
        expect(await db.select().from(schema.users).where(and(eq(schema.users.role, "admin"), sql`lower(${schema.users.email}) = ${email}`))).toHaveLength(0);
      });
    });
  });
}
