/**
 * "Forgot your password?" on the sign-in pages, on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via
 * `pnpm test:db`). Real routers and sessions; email is stubbed. The database starts without the owner's account, as a
 * fresh production database does before anyone has run `pnpm owner:bootstrap`.
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
  const ip = `203.0.113.${(counter += 1) % 250}`;
  const call = async () => {
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    const res = { cookie: (name: string, value: string) => void jar.set(name, value), clearCookie: (name: string) => void jar.delete(name) };
    const context = await createContext({ req: { ip, protocol: "https", headers: cookie ? { cookie } : {} }, res } as never);
    return appRouter.createCaller(context as TrpcContext);
  };
  return { call };
}
type EmailCall = { to: string; subject: string; body: string; sender?: string; idempotencyKey?: string };
const linkIn = (body: string) => decodeURIComponent(body.match(/\/reset\/([A-Za-z0-9_%-]+)/)![1]);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Forgot your password on ${target.name}`, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function person(overrides: Record<string, unknown> = {}, withPassword = true) {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name: "Ada Example", role: "user", status: "active", ...overrides }).returning();
      if (withPassword) await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      return user as { id: number; email: string };
    }
    const emails = (): EmailCall[] => mocked.deliverEmail.mock.calls.map(call => call[0] as EmailCall);
    const resetRows = async (userId: number) => db.select().from(schema.userPasswordResetTokens).where(eq(schema.userPasswordResetTokens.userId, userId));
    const ownerRow = async () => (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      // A shared database may already hold the owner from another suite: start from no owner, as production did.
      const existing = await ownerRow();
      if (existing) await db.delete(schema.users).where(eq(schema.users.id, existing.id));
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(async () => {
      await resetRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    it("emails a person a link they asked for themselves; the link sets a new password once, and the answer never contains it", async () => {
      const client = await person();
      const answer = await (await browser().call()).account.requestReset({ email: client.email.toUpperCase() });
      expect(answer).toEqual({ success: true });

      const sent = emails().find(item => item.to === client.email)!;
      expect(sent.subject).toBe("Reset your password on Advisory as a Service");
      expect(sent.body).toContain("Someone asked to reset the password for this email address");
      expect(sent.sender).toBe("business_support");
      const [row] = await resetRows(client.id);
      expect(row.issuedByUserId).toBeNull();
      expect(row.tokenHash).toBe(sha256(linkIn(sent.body)));
      const audit = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "account_password_reset_requested"));
      expect(audit.some((event: { targetEmail: string }) => event.targetEmail === client.email)).toBe(true);

      const visitor = browser();
      expect(await (await visitor.call()).account.resetPassword({ token: linkIn(sent.body), password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).toEqual({ success: true, email: client.email });
      await (await browser().call()).account.signIn({ email: client.email, password: NEW_PASSWORD });
      await expect((await visitor.call()).account.resetPassword({ token: linkIn(sent.body), password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("answers the same, and sends nothing, for an unknown email, a suspended account or an account without a password", async () => {
      const suspended = await person({ status: "suspended" });
      const noPassword = await person({}, false);
      for (const email of [uniqueEmail("nobody"), suspended.email, noPassword.email]) {
        expect(await (await browser().call()).account.requestReset({ email })).toEqual({ success: true });
      }
      expect(emails()).toEqual([]);
      expect(await resetRows(suspended.id)).toEqual([]);
      expect(await resetRows(noPassword.id)).toEqual([]);
      expect((await db.select().from(schema.users).where(eq(schema.users.email, "nobody@example.test")))).toEqual([]);
    });

    it("refuses a malformed address and limits requests per email, so the form cannot flood an inbox", async () => {
      await expect((await browser().call()).account.requestReset({ email: "not an email" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const client = await person();
      for (let attempt = 0; attempt < 5; attempt++) await (await browser().call()).account.requestReset({ email: client.email });
      await expect((await browser().call()).account.requestReset({ email: client.email })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      // Each new link revokes the one before: only the latest works.
      const rows = await resetRows(client.id);
      expect(rows.filter((item: { revokedAt: Date | null }) => item.revokedAt === null)).toHaveLength(1);
    });

    it("lets the permanent Super Admin set a first password from their own inbox, with no account in the database yet, and then sign in to the admin area", async () => {
      expect(await ownerRow()).toBeUndefined();
      expect(await (await browser().call()).account.requestReset({ email: OWNER_ADMIN_EMAIL })).toEqual({ success: true });
      const owner = await ownerRow();
      expect(owner).toMatchObject({ status: "active", role: "admin" });
      expect(await db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, owner.id))).toEqual([]);

      const sent = emails().find(item => item.to === OWNER_ADMIN_EMAIL)!;
      expect(sent.subject).toBe("Set your password on Advisory as a Service");
      expect(sent.body).toContain("Set your password: ");
      expect((await (await browser().call()).account.resetPreview({ token: linkIn(sent.body) }))).toEqual({ available: true, email: OWNER_ADMIN_EMAIL });
      await (await browser().call()).account.resetPassword({ token: linkIn(sent.body), password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

      const roles = await db.select().from(schema.userPlatformRoles).where(eq(schema.userPlatformRoles.userId, owner.id));
      expect(roles.map((row: { role: string }) => row.role)).toContain("super_admin");
      const admin = browser();
      await (await admin.call()).account.signInInternal({ email: OWNER_ADMIN_EMAIL, password: NEW_PASSWORD });
      expect((await (await admin.call()).account.me())?.platformRoles).toContain("super_admin");

      // Asked again later, it is an ordinary reset of the password that now exists.
      mocked.deliverEmail.mockClear();
      await (await browser().call()).account.requestReset({ email: OWNER_ADMIN_EMAIL });
      expect(emails()[0].subject).toBe("Reset your password on Advisory as a Service");
    });
  });
}
