import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { userCredentials, userPlatformRoles, users, userSessions } from "../drizzle/schema";
import { hashAdminPassword, normalizeAdminEmail, OWNER_ADMIN_EMAIL, validateAdminPassword } from "./adminSecurity";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { databaseNow, emailEquals } from "./dbHelpers";

export type OwnerBootstrapResult = { action: "created-account" | "set-password" | "reset-password" | "ensured-role"; userId: number };

/**
 * Gives the recognised owner (OWNER_ADMIN_EMAIL) a universal email-and-password credential, so the Super Admin can sign
 * in at /admin/login. It is run once by a person with database access (`pnpm owner:bootstrap`), which prompts for the
 * password without echoing it, and needs no email. The owner can also set the first password from their own inbox with
 * "Forgot your password?" (server/accountRecovery.ts).
 *
 *  - only the recognised owner address is accepted;
 *  - the password must satisfy the administrator policy and is stored only as a scrypt hash, never logged or returned;
 *  - an existing credential is never replaced unless `replaceExisting` is passed explicitly, and a reset signs the owner
 *    out everywhere;
 *  - a disabled owner row is refused rather than silently reactivated.
 */
export async function bootstrapOwnerCredential(
  db: Database,
  input: { email: string; password: string; replaceExisting?: boolean },
): Promise<OwnerBootstrapResult> {
  const email = normalizeAdminEmail(input.email);
  if (!email || email !== normalizeAdminEmail(OWNER_ADMIN_EMAIL)) {
    throw new Error("Only the recognised owner address (OWNER_ADMIN_EMAIL) can be bootstrapped.");
  }
  const policy = validateAdminPassword(input.password);
  if (policy) throw new Error(policy);
  const passwordHash = hashAdminPassword(input.password);

  return db.transaction(async tx => {
    let user = (await tx.select().from(users).where(emailEquals(users.email, email)).limit(1))[0];
    let created = false;
    if (!user) {
      [user] = await tx.insert(users).values({
        openId: `local:${randomUUID()}`,
        name: "Super Admin",
        email,
        loginMethod: "password",
        role: "admin",
        status: "active",
      }).returning();
      created = true;
    } else {
      if (user.status !== "active") throw new Error("The owner account is not active. Reactivate it deliberately before setting a password.");
      if (user.role !== "admin") await tx.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
    }

    const existing = (await tx.select({ id: userCredentials.id }).from(userCredentials).where(eq(userCredentials.userId, user.id)).limit(1))[0];
    if (existing && !input.replaceExisting) {
      throw new Error("The owner already has a password. Run again with --reset to replace it deliberately.");
    }
    if (existing) {
      await tx.update(userCredentials).set({ passwordHash, failedAttempts: 0, lockedUntil: null }).where(eq(userCredentials.id, existing.id));
      await tx.update(userSessions).set({ revokedAt: databaseNow() }).where(and(eq(userSessions.userId, user.id), isNull(userSessions.revokedAt)));
    } else {
      await tx.insert(userCredentials).values({ userId: user.id, passwordHash });
    }
    await tx.insert(userPlatformRoles).values({ userId: user.id, role: "super_admin", grantedByUserId: user.id }).onConflictDoNothing();
    const action = existing ? "reset-password" : created ? "created-account" : "set-password";
    await recordAudit(tx, { action: existing ? "owner_credential_reset" : "owner_credential_bootstrapped", actorUserId: user.id, targetEmail: email, details: { action } });
    return { action, userId: user.id };
  });
}

/**
 * Stores the `super_admin` platform role for the recognised owner without touching the password. Safe to repeat. The
 * role makes Super Admin status a stored fact, so it no longer depends on OWNER_ADMIN_EMAIL matching at runtime.
 * Refuses when the owner has no sign-in yet (use the bootstrap) or is not active.
 */
export async function ensureOwnerSuperAdminRole(db: Database, input: { email: string }): Promise<OwnerBootstrapResult> {
  const email = normalizeAdminEmail(input.email);
  if (!email || email !== normalizeAdminEmail(OWNER_ADMIN_EMAIL)) {
    throw new Error("Only the recognised owner address (OWNER_ADMIN_EMAIL) can be updated.");
  }
  return db.transaction(async tx => {
    const user = (await tx.select().from(users).where(emailEquals(users.email, email)).limit(1))[0];
    if (!user) throw new Error("The owner account does not exist yet. Run the bootstrap to create it.");
    if (user.status !== "active") throw new Error("The owner account is not active. Reactivate it deliberately first.");
    const stored = await tx.insert(userPlatformRoles).values({ userId: user.id, role: "super_admin", grantedByUserId: user.id }).onConflictDoNothing().returning({ id: userPlatformRoles.id });
    if (stored.length > 0) await recordAudit(tx, { action: "platform_role_granted", actorUserId: user.id, targetEmail: email, details: { targetUserId: user.id, role: "super_admin", via: "owner-bootstrap" } });
    return { action: "ensured-role" as const, userId: user.id };
  });
}
