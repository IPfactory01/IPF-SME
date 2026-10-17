/**
 * Password reset links issued by the team, and account suspension, on PostgreSQL (PGlite on every run, plus
 * TEST_DATABASE_URL via `pnpm test:db`). Real routers and sessions; email is stubbed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";

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

import { appRouter } from "@server/routers";
import { createContext, type TrpcContext } from "@server/_core/context";
import { hashAdminPassword, OWNER_ADMIN_EMAIL, sha256 } from "@server/adminSecurity";
import { resetRateLimitsForTests } from "@server/rateLimit";
import { ACCOUNT_SESSION_COOKIE, PASSWORD_RESET_ERRORS, type PlatformRole } from "@shared/auth";

const targets = [
  { name: "PGlite", enabled: true, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];
let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueEmail = (label: string) => `${unique(label)}@example.test`;
const PASSWORD = "correct horse 42";
const NEW_PASSWORD = "new battery staple 9";

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
type EmailCall = { to: string; subject: string; body: string; sender?: string; idempotencyKey?: string };
const linkOf = (url: string) => decodeURIComponent(url.split("/reset/")[1]);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Password reset and suspension on ${target.name}`, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    let ownerId: number;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function person(roles: PlatformRole[] = [], overrides: Record<string, unknown> = {}) {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name: "Ada Example", role: "user", status: "active", ...overrides }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return user as { id: number; email: string };
    }
    async function signIn(user: { email: string }, password = PASSWORD, internal = false) {
      const b = browser();
      if (internal) await (await b.call()).account.signInInternal({ email: user.email, password });
      else await (await b.call()).account.signIn({ email: user.email, password });
      return b;
    }
    const emails = (): EmailCall[] => mocked.deliverEmail.mock.calls.map(call => call[0] as EmailCall);
    const audits = async (action: string) => db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, action));
    const resetRows = async (userId: number) => db.select().from(schema.userPasswordResetTokens).where(eq(schema.userPasswordResetTokens.userId, userId));

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      await db.insert(schema.users).values({ openId: unique("owner"), email: OWNER_ADMIN_EMAIL, role: "admin", name: "Owner" }).onConflictDoNothing();
      const owner = (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
      ownerId = owner.id;
      await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash }).onConflictDoNothing();
      superAdmin = await signIn(owner, PASSWORD, true);
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(async () => {
      await resetRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    describe("a reset link", () => {
      it("is issued by the Super Admin, emailed as IP Factory, stored only as a hash, and shown once; the page then sets a new password and signs the person out everywhere", async () => {
        const client = await person();
        const session = await signIn(client);
        expect(await (await session.call()).account.me()).not.toBeNull();

        const issued = await (await superAdmin.call()).people.issuePasswordReset({ userId: client.id });
        expect(issued.resetUrl).toMatch(/\/reset\/[A-Za-z0-9_-]{43}$/);
        expect(issued.deliveryStatus).toBe("Simulated");
        const sent = emails().find(item => item.to === client.email)!;
        expect(sent.subject).toBe("Reset your password on Advisory as a Service");
        expect(sent.sender).toBe("business_support");
        expect(sent.body).toContain(issued.resetUrl);
        expect(sent.idempotencyKey).toBe(`user_password_reset_tokens:${issued.resetId}`);
        const [row] = await resetRows(client.id);
        expect(row.tokenHash).toBe(sha256(linkOf(issued.resetUrl)));
        expect(row.issuedByUserId).toBe(ownerId);
        expect(JSON.stringify(row)).not.toContain(linkOf(issued.resetUrl));
        expect((await audits("account_password_reset_issued")).some((event: { targetEmail: string }) => event.targetEmail === client.email)).toBe(true);

        const visitor = browser();
        expect(await (await visitor.call()).account.resetPreview({ token: linkOf(issued.resetUrl) })).toEqual({ available: true, email: client.email });
        expect(await (await visitor.call()).account.resetPreview({ token: "x".repeat(43) })).toEqual({ available: false });
        await expect((await visitor.call()).account.resetPassword({ token: linkOf(issued.resetUrl), password: "short", confirmPassword: "short" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await visitor.call()).account.resetPassword({ token: linkOf(issued.resetUrl), password: NEW_PASSWORD, confirmPassword: "something else 1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(await (await visitor.call()).account.resetPassword({ token: linkOf(issued.resetUrl), password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).toEqual({ success: true, email: client.email });

        // The old session is gone, the old password no longer works, the new one does, and the link is spent.
        expect(await (await session.call()).account.me()).toBeNull();
        await expect((await browser().call()).account.signIn({ email: client.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        expect(await (await (await signIn(client, NEW_PASSWORD)).call()).account.me()).not.toBeNull();
        expect(await (await visitor.call()).account.resetPreview({ token: linkOf(issued.resetUrl) })).toEqual({ available: false });
        await expect((await visitor.call()).account.resetPassword({ token: linkOf(issued.resetUrl), password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toMatchObject({ code: "NOT_FOUND", message: PASSWORD_RESET_ERRORS.unavailable });
        expect((await audits("account_password_reset_completed")).some((event: { targetEmail: string }) => event.targetEmail === client.email)).toBe(true);
      });

      it("revokes the link still out when a new one is issued, and refuses an expired link", async () => {
        const client = await person();
        const first = await (await superAdmin.call()).people.issuePasswordReset({ userId: client.id });
        const second = await (await superAdmin.call()).people.issuePasswordReset({ userId: client.id });
        expect((await resetRows(client.id)).map((row: { revokedAt: Date | null }) => Boolean(row.revokedAt))).toEqual([true, false]);
        expect(await (await browser().call()).account.resetPreview({ token: linkOf(first.resetUrl) })).toEqual({ available: false });
        await db.update(schema.userPasswordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.userPasswordResetTokens.id, second.resetId));
        expect(await (await browser().call()).account.resetPreview({ token: linkOf(second.resetUrl) })).toEqual({ available: false });
        await expect((await browser().call()).account.resetPassword({ token: linkOf(second.resetUrl), password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("is only for people who manage users, and only for people with a password account", async () => {
        const analyst = await signIn(await person(["analyst"]), PASSWORD, true);
        const client = await person();
        await expect((await analyst.call()).people.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await analyst.call()).people.issuePasswordReset({ userId: client.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await analyst.call()).people.setStatus({ userId: client.id, status: "suspended", reason: "Testing" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await browser().call()).people.issuePasswordReset({ userId: client.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const [noPassword] = await db.insert(schema.users).values({ openId: unique("legacy"), email: uniqueEmail("legacy"), name: "Legacy Person", role: "user", status: "active" }).returning();
        await expect((await superAdmin.call()).people.issuePasswordReset({ userId: noPassword.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const listed = await (await superAdmin.call()).people.list();
        expect(listed.find(item => item.id === client.id)).toMatchObject({ email: client.email, status: "active", roles: [], superAdmin: false });
        expect(listed.find(item => item.id === ownerId)).toMatchObject({ superAdmin: true });
        expect(listed.some(item => item.id === noPassword.id)).toBe(false);
      });

      it("says it is not set up until migration 0010 is applied", async () => {
        const client = await person();
        await db.execute(sql.raw(`alter table user_password_reset_tokens rename to user_password_reset_tokens_hidden`));
        try {
          await expect((await superAdmin.call()).people.issuePasswordReset({ userId: client.id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: PASSWORD_RESET_ERRORS.notSetUp });
          expect(await (await browser().call()).account.resetPreview({ token: "x".repeat(43) })).toEqual({ available: false });
        } finally {
          await db.execute(sql.raw(`alter table user_password_reset_tokens_hidden rename to user_password_reset_tokens`));
        }
      });
    });

    describe("suspending an account", () => {
      it("signs the person out everywhere, refuses their sign-in with the generic message, records why, and reinstating lets them back in", async () => {
        const client = await person();
        const session = await signIn(client);
        expect(await (await superAdmin.call()).people.setStatus({ userId: client.id, status: "suspended", reason: "  Unpaid invoice  " })).toEqual({ success: true, changed: true, status: "suspended" });
        expect(await (await session.call()).account.me()).toBeNull();
        await expect((await browser().call()).account.signIn({ email: client.email, password: PASSWORD })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        const suspended = (await audits("account_suspended")).find((event: { targetEmail: string }) => event.targetEmail === client.email)!;
        expect(JSON.parse(suspended.details)).toEqual({ targetUserId: client.id, reason: "Unpaid invoice" });
        expect(await (await superAdmin.call()).people.setStatus({ userId: client.id, status: "suspended" })).toMatchObject({ changed: false });
        await expect((await superAdmin.call()).people.issuePasswordReset({ userId: client.id })).rejects.toMatchObject({ code: "CONFLICT" });

        expect(await (await superAdmin.call()).people.setStatus({ userId: client.id, status: "active" })).toMatchObject({ changed: true, status: "active" });
        expect(await (await (await signIn(client)).call()).account.me()).not.toBeNull();
        expect((await audits("account_reinstated")).some((event: { targetEmail: string }) => event.targetEmail === client.email)).toBe(true);
      });

      it("never suspends the actor's own account, the permanent Super Admin, or the last Super Admin", async () => {
        await expect((await superAdmin.call()).people.setStatus({ userId: ownerId, status: "suspended", reason: "Self" })).rejects.toMatchObject({ code: "CONFLICT" });
        const second = await signIn(await person(["super_admin"]), PASSWORD, true);
        await expect((await second.call()).people.setStatus({ userId: ownerId, status: "suspended", reason: "Coup" })).rejects.toMatchObject({ code: "CONFLICT", message: "The permanent Super Admin cannot be suspended." });
        await expect((await superAdmin.call()).people.setStatus({ userId: 2_000_000_000, status: "suspended" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });
  });
}
