/**
 * Phase 1 privileged access: two-step sign-in for everyone with an internal role, roles that end on a date, granting
 * only below your own role, one-click removal, two-step reset, and alerts to the Super Admins. Real application code on
 * PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`). Email is simulated in tests.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
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
import { createSession } from "@server/accountAuth";
import { hashAdminPassword, OWNER_ADMIN_EMAIL } from "@server/adminSecurity";
import { grantPlatformRole, loadAuthority, removeAccess, resetTwoStep } from "@server/platformAccess";
import { totpCode, totpStep } from "@server/twoStep";
import { ACCOUNT_SESSION_COOKIE, isTwoStepChallenge, TWO_STEP_ERRORS, TWO_STEP_MAX_ATTEMPTS, type TwoStepChallenge } from "@shared/auth";
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

function browser(userAgent = "Mozilla/5.0 (Test laptop)") {
  const jar = new Map<string, string>();
  const ip = `198.51.100.${(counter += 1) % 250}`;
  const call = () => {
    const headers: Record<string, string> = { "user-agent": userAgent };
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    if (cookie) headers.cookie = cookie;
    return appRouter.createCaller({
      req: { ip, protocol: "https", headers },
      res: { cookie: (name: string, value: string) => void jar.set(name, value), clearCookie: (name: string) => void jar.delete(name) },
      user: null,
    } as unknown as TrpcContext);
  };
  return { call, jar, token: () => jar.get(ACCOUNT_SESSION_COOKIE) };
}

const superAuthority: Authority = { roles: ["super_admin"], permissions: [], legacyCapabilities: [], isSuperAdmin: true };
const adminAuthority: Authority = { roles: ["admin"], permissions: ["manage_roles", "manage_users"], legacyCapabilities: [], isSuperAdmin: false };

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Privileged access on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let owner: { id: number; email: string };
    const previous = process.env.TWO_STEP_REQUIRED;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function makeUser(overrides: Record<string, unknown> = {}) {
      const email = (overrides.email as string | undefined) ?? uniqueEmail("person");
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email, name: "Test Person", role: "user", status: "active", ...overrides }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      return user as { id: number; email: string; name: string };
    }
    async function staff(role: (typeof schema.userPlatformRoles.$inferInsert)["role"] = "desk_lead", expiresAt: Date | null = null) {
      const user = await makeUser();
      await db.insert(schema.userPlatformRoles).values({ userId: user.id, role, expiresAt });
      return user;
    }
    const audit = async (action: string) => db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, action));
    const alerts = async (event: string, email: string) =>
      (await audit("security_alert")).filter((row: { targetEmail: string | null; details: string }) => row.targetEmail === email && row.details.includes(`"event":"${event}"`));
    const liveSessions = async (userId: number) => db.select().from(schema.userSessions).where(and(eq(schema.userSessions.userId, userId), isNull(schema.userSessions.revokedAt)));

    /** Password step: returns the challenge (and asserts no cookie was set yet). */
    async function passwordStep(b: ReturnType<typeof browser>, email: string): Promise<TwoStepChallenge> {
      const result = await b.call().account.signIn({ email, password: PASSWORD });
      expect(isTwoStepChallenge(result)).toBe(true);
      expect(b.token()).toBeUndefined();
      return result as TwoStepChallenge;
    }
    /** First sign-in: sets up two-step and returns the secret. */
    async function enrol(b: ReturnType<typeof browser>, email: string) {
      const challenge = await passwordStep(b, email);
      const secret = challenge.setup!.secret;
      const result = await b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: totpCode(secret, totpStep()) });
      return { secret, result };
    }

    beforeAll(async () => {
      process.env.TWO_STEP_REQUIRED = "true";
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      owner = await makeUser({ email: OWNER_ADMIN_EMAIL, name: "Owner" });
    }, 60_000);
    afterAll(async () => {
      process.env.TWO_STEP_REQUIRED = previous;
      await harness?.close();
    });
    beforeEach(() => { process.env.TWO_STEP_REQUIRED = "true"; });

    describe("two-step sign-in", () => {
      it("sets up on the first sign-in: no session until a correct code, then recovery codes once and a working-day session", async () => {
        const person = await staff();
        const b = browser();
        const challenge = await passwordStep(b, person.email);
        expect(challenge.setup?.uri).toContain("otpauth://totp/");
        expect(challenge.setup?.uri).toContain(`secret=${challenge.setup?.secret}`);
        // The challenge is not a sign-in, even if someone sets it as the cookie.
        const forged = browser();
        forged.jar.set(ACCOUNT_SESSION_COOKIE, challenge.challenge);
        expect(await forged.call().account.me()).toBeNull();

        await expect(b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: "000000" })).rejects.toThrow(TWO_STEP_ERRORS.wrongCode);
        const result = await b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: totpCode(challenge.setup!.secret, totpStep()) });
        expect(result.recoveryCodes).toHaveLength(8);
        expect(result.user.email).toBe(person.email);
        expect(b.token()).toBe(challenge.challenge);
        expect((await b.call().account.me())?.user.email).toBe(person.email);

        const [record] = await db.select().from(schema.userTwoStep).where(eq(schema.userTwoStep.userId, person.id));
        expect(record.enabledAt).not.toBeNull();
        expect(record.secretSealed).not.toContain(challenge.setup!.secret);
        expect(record.recoveryCodeHashes).not.toContain(result.recoveryCodes![0]);
        const [session] = await liveSessions(person.id);
        expect(session.twoStepVerifiedAt).not.toBeNull();
        expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(12 * 3_600_000 + 5_000);
        expect((await audit("two_step_enabled")).some((row: { actorUserId: number }) => row.actorUserId === person.id)).toBe(true);
      });

      it("asks only for the code next time, refuses a code used before, and takes a recovery code once", async () => {
        const person = await staff();
        const { secret, result } = await enrol(browser(), person.email);
        const b = browser();
        const challenge = await passwordStep(b, person.email);
        expect(challenge.setup).toBeNull();
        // The code from the step already used cannot be used again.
        await expect(b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: totpCode(secret, totpStep()) })).rejects.toThrow(TWO_STEP_ERRORS.wrongCode);
        const recovery = result.recoveryCodes![0];
        await b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: recovery.toUpperCase() });
        expect((await b.call().account.me())?.user.email).toBe(person.email);
        expect(await alerts("two_step_recovery_code_used", person.email)).toHaveLength(1);

        const again = browser();
        const second = await passwordStep(again, person.email);
        await expect(again.call().account.verifyTwoStep({ challenge: second.challenge, code: recovery })).rejects.toThrow(TWO_STEP_ERRORS.wrongCode);
      });

      it("ends the challenge after five wrong codes and tells the Super Admins", async () => {
        const person = await staff();
        await enrol(browser(), person.email);
        const b = browser();
        const challenge = await passwordStep(b, person.email);
        for (let attempt = 0; attempt < TWO_STEP_MAX_ATTEMPTS; attempt++) {
          await expect(b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: "123456" })).rejects.toThrow(TWO_STEP_ERRORS.wrongCode);
        }
        await expect(b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: "123456" })).rejects.toThrow(TWO_STEP_ERRORS.expired);
        expect(await alerts("two_step_attempts_exhausted", person.email)).toHaveLength(1);
      });

      it("reports a sign-in from a new device, but not from one seen before", async () => {
        const person = await staff();
        const { secret } = await enrol(browser("Laptop browser"), person.email);
        // Each later sign-in happens a minute on, so a fresh code exists (a code is never accepted twice).
        const later = async (userAgent: string, minutes: number) => {
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(Date.now() + minutes * 60_000);
          try {
            const b = browser(userAgent);
            const challenge = await passwordStep(b, person.email);
            await b.call().account.verifyTwoStep({ challenge: challenge.challenge, code: totpCode(secret, totpStep()) });
          } finally {
            vi.useRealTimers();
          }
        };
        await later("Laptop browser", 1);
        expect(await alerts("staff_new_device", person.email)).toHaveLength(0);
        await later("Phone browser", 2);
        expect(await alerts("staff_new_device", person.email)).toHaveLength(1);
      });

      it("signs a client in with the password alone", async () => {
        const client = await makeUser();
        const b = browser();
        const view = await b.call().account.signIn({ email: client.email, password: PASSWORD });
        expect(isTwoStepChallenge(view)).toBe(false);
        expect(b.token()).toBeTruthy();
      });

      it("does not count a staff session opened without two-step, such as one from an invitation", async () => {
        const person = await staff();
        const { token } = await db.transaction(async (tx: never) => createSession(tx, person.id));
        const b = browser();
        b.jar.set(ACCOUNT_SESSION_COOKIE, token);
        expect(await b.call().account.me()).toBeNull();
      });
    });

    describe("roles that end", () => {
      it("gives nothing once a role's end date has passed, and the person cannot reach the admin area", async () => {
        const ended = await staff("subject_matter_expert", new Date(Date.now() - 60_000));
        expect((await loadAuthority(db, { ...ended, role: "user", status: "active" })).roles).toEqual([]);
        const current = await staff("subject_matter_expert", new Date(Date.now() + 86_400_000));
        expect((await loadAuthority(db, { ...current, role: "user", status: "active" })).roles).toEqual(["subject_matter_expert"]);
        // With no current role, the password alone signs them in as a person with no internal access.
        const b = browser();
        const view = await b.call().account.signIn({ email: ended.email, password: PASSWORD });
        expect(isTwoStepChallenge(view)).toBe(false);
        expect((view as { platformRoles: string[] }).platformRoles).toEqual([]);
      });

      it("needs an end date for a specialist, gives roles only below the giver's own, and tells the Super Admins", async () => {
        const admin = { ...(await staff("admin")), role: "user" as const, status: "active" as const, authority: adminAuthority };
        const target = await makeUser();
        await expect(grantPlatformRole(db, { actor: admin, targetUserId: target.id, role: "subject_matter_expert" })).rejects.toThrow("needs an end date");
        await expect(grantPlatformRole(db, { actor: admin, targetUserId: target.id, role: "admin" })).rejects.toThrow("below your own");
        await expect(grantPlatformRole(db, { actor: admin, targetUserId: target.id, role: "subject_matter_expert", expiresAt: new Date(Date.now() + 500 * 86_400_000) })).rejects.toThrow("400 days");
        const ends = new Date(Date.now() + 90 * 86_400_000);
        await grantPlatformRole(db, { actor: admin, targetUserId: target.id, role: "subject_matter_expert", expiresAt: ends });
        const [row] = await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, target.id));
        expect(row.expiresAt.getTime()).toBe(ends.getTime());
        expect(await alerts("platform_role_granted", target.email)).toHaveLength(1);

        // Once ended, the same role can be given again: the row is renewed, not duplicated.
        await db.update(schema.userPlatformRoles).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.userPlatformRoles.id, row.id));
        await grantPlatformRole(db, { actor: admin, targetUserId: target.id, role: "subject_matter_expert", expiresAt: ends });
        expect(await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, target.id))).toHaveLength(1);
      });
    });

    describe("removing access", () => {
      it("takes every role, engagement, session and the two-step set-up away in one step, with the reason, and suspends the account", async () => {
        const contractor = await staff("subject_matter_expert", new Date(Date.now() + 86_400_000));
        await enrol(browser(), contractor.email);
        const client = await makeUser();
        const [business] = await db.insert(schema.businesses).values({ name: "Crown Example", slug: unique("slug"), createdByUserId: client.id }).returning();
        const [check] = await db.insert(schema.businessChecks).values({ publicToken: unique("check"), fullName: "Example Owner", email: client.email, stage: "unknown", answersJson: "{}" }).returning();
        const [engagement] = await db.insert(schema.engagements).values({ businessId: business.id, businessCheckId: check.id }).returning();
        await db.insert(schema.engagementTeam).values({ engagementId: engagement.id, userId: contractor.id, role: "expert" });
        expect(await liveSessions(contractor.id)).toHaveLength(1);

        const actor = { ...owner, role: "user" as const, status: "active" as const, authority: superAuthority };
        await expect(removeAccess(db, { actor, userId: contractor.id, reason: "  " })).rejects.toThrow("reason");
        const result = await removeAccess(db, { actor, userId: contractor.id, reason: "Contract ended" });
        expect(result).toMatchObject({ roles: ["subject_matter_expert"], engagements: [engagement.id], sessionsEnded: 1, reason: "Contract ended" });
        expect(await liveSessions(contractor.id)).toHaveLength(0);
        expect(await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, contractor.id))).toHaveLength(0);
        expect(await db.select().from(schema.engagementTeam).where(eq(schema.engagementTeam.userId, contractor.id))).toHaveLength(0);
        expect(await db.select().from(schema.userTwoStep).where(eq(schema.userTwoStep.userId, contractor.id))).toHaveLength(0);
        const [after] = await db.select().from(schema.users).where(eq(schema.users.id, contractor.id));
        expect(after.status).toBe("suspended");
        const [event] = (await audit("access_removed")).filter((row: { targetEmail: string }) => row.targetEmail === contractor.email);
        expect(JSON.parse(event.details)).toMatchObject({ reason: "Contract ended", sessionsEnded: 1 });
        expect(await alerts("access_removed", contractor.email)).toHaveLength(1);
        await expect(browser().call().account.signIn({ email: contractor.email, password: PASSWORD })).rejects.toThrow();
      });

      it("never removes yourself, a Super Admin by an Admin, the permanent Super Admin, or a role above the remover's", async () => {
        const admin = { ...(await staff("admin")), role: "user" as const, status: "active" as const, authority: adminAuthority };
        await expect(removeAccess(db, { actor: admin, userId: admin.id, reason: "Leaving" })).rejects.toThrow("your own account");
        await expect(removeAccess(db, { actor: admin, userId: owner.id, reason: "Leaving" })).rejects.toThrow("Only a Super Admin");
        const otherAdmin = await staff("admin");
        await expect(removeAccess(db, { actor: admin, userId: otherAdmin.id, reason: "Leaving" })).rejects.toThrow("not below your own");
        const superActor = { ...(await staff("super_admin")), role: "user" as const, status: "active" as const, authority: superAuthority };
        await expect(removeAccess(db, { actor: superActor, userId: owner.id, reason: "Leaving" })).rejects.toThrow("permanent Super Admin");
      });

      it("resets two-step for a lost phone: the person sets it up again at the next sign-in", async () => {
        const person = await staff("analyst");
        await enrol(browser(), person.email);
        const actor = { ...owner, role: "user" as const, status: "active" as const, authority: superAuthority };
        await resetTwoStep(db, { actor, userId: person.id });
        expect(await liveSessions(person.id)).toHaveLength(0);
        const challenge = await passwordStep(browser(), person.email);
        expect(challenge.setup).not.toBeNull();
        expect(await alerts("two_step_reset", person.email)).toHaveLength(1);
      });
    });
  });
}
