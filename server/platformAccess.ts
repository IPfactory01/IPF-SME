import { and, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminPermissionProfiles, engagementTeam, userPlatformRoles, users, userSessions, userTwoStep } from "../drizzle/schema";
import { parseAdminPermissions } from "../shared/adminPermissions";
import type { PlatformRole } from "../shared/auth";
import {
  authorityAllows,
  canGrantRole,
  MAX_ROLE_DURATION_DAYS,
  resolveAuthority,
  ROLES_REQUIRING_END_DATE,
  LEVEL_ROLES,
  type FirmLevel,
  type AnyAuthorityPermission,
  type Authority,
} from "../shared/platformPermissions";
import { isOwnerAdmin, normalizeAdminEmail, OWNER_ADMIN_EMAIL } from "./adminSecurity";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { isUniqueViolation } from "./accountAuth";
import { databaseNow, emailEquals } from "./dbHelpers";
import { alertSuperAdmins } from "./securityAlerts";

/** A role counts while it has no end date or its end date is still ahead. */
export const roleIsCurrent = () => or(isNull(userPlatformRoles.expiresAt), gt(userPlatformRoles.expiresAt, new Date()));

const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  desk_lead: "Engagement lead",
  analyst: "Analyst",
  partner: "Partner",
  subject_matter_expert: "Specialist",
  finance: "Finance",
};
export const roleLabel = (role: PlatformRole) => ROLE_LABELS[role];

type Person = { id: number; role: "user" | "admin"; email: string | null; status: "active" | "suspended" | "disabled" };

export const NO_AUTHORITY: Authority = { roles: [], permissions: [], legacyCapabilities: [], isSuperAdmin: false };

/**
 * The single place that turns a person into authority. Both the legacy administrator channel (OAuth + administrator
 * password) and the account channel (email/password session) call this, so one person always gets one answer.
 */
export async function loadAuthority(db: Pick<Database, "select">, person: Person): Promise<Authority> {
  const [stored, profile] = await Promise.all([
    db.select({ role: userPlatformRoles.role }).from(userPlatformRoles).where(and(eq(userPlatformRoles.userId, person.id), roleIsCurrent())),
    db.select({ permissionsJson: adminPermissionProfiles.permissionsJson }).from(adminPermissionProfiles).where(eq(adminPermissionProfiles.userId, person.id)).limit(1),
  ]);
  return resolveAuthority({
    storedRoles: stored.map(row => row.role),
    legacyAdmin: person.role === "admin",
    ownerBridge: isOwnerAdmin({ email: person.email }),
    legacyProfile: parseAdminPermissions(profile[0]?.permissionsJson),
    active: person.status === "active",
  });
}

export async function requireAuthority(db: Pick<Database, "select">, person: Person, permission: AnyAuthorityPermission) {
  const authority = await loadAuthority(db, person);
  if (!authorityAllows(authority, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include this responsibility." });
  }
  return authority;
}

/** Active people who are Super Admin today: a stored `super_admin` role, or the owner-email bridge. */
export async function listSuperAdminIds(db: Pick<Database, "select">): Promise<Set<number>> {
  const stored = await db
    .select({ id: users.id })
    .from(userPlatformRoles)
    .innerJoin(users, eq(userPlatformRoles.userId, users.id))
    .where(and(eq(userPlatformRoles.role, "super_admin"), eq(users.status, "active"), roleIsCurrent()));
  const bridge = OWNER_ADMIN_EMAIL
    ? await db.select({ id: users.id }).from(users).where(and(emailEquals(users.email, normalizeAdminEmail(OWNER_ADMIN_EMAIL)), eq(users.status, "active")))
    : [];
  return new Set([...stored, ...bridge].map(row => row.id));
}

/**
 * Grants a platform role. Safeguards (the caller has already been checked for the `manage_roles` responsibility):
 *  - only a Super Admin may grant Super Admin;
 *  - nobody but a Super Admin may change their own roles (no self-escalation);
 *  - a business role grants nothing here: only an existing, active person can be given a platform role.
 */
export async function grantPlatformRole(db: Database, input: { actor: Person & { authority: Authority }; targetUserId: number; role: PlatformRole; expiresAt?: Date | null }) {
  const { actor, targetUserId, role } = input;
  if (role === "super_admin" && !actor.authority.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only a Super Admin can grant Super Admin." });
  }
  if (!canGrantRole(actor.authority, role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `You can only give roles below your own. Ask a Super Admin to give ${roleLabel(role)}.` });
  }
  const expiresAt = input.expiresAt ?? null;
  if (!expiresAt && ROLES_REQUIRING_END_DATE.includes(role)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${roleLabel(role)} access needs an end date.` });
  }
  if (expiresAt && (expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + MAX_ROLE_DURATION_DAYS * 86_400_000)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Choose an end date between tomorrow and ${MAX_ROLE_DURATION_DAYS} days from now.` });
  }
  if (targetUserId === actor.id && !actor.authority.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot change your own roles." });
  }
  const target = (await db.select({ id: users.id, name: users.name, email: users.email, status: users.status }).from(users).where(eq(users.id, targetUserId)).limit(1))[0];
  if (!target || target.status !== "active") throw new TRPCError({ code: "NOT_FOUND", message: "That person does not exist or is not active." });
  const held = (await db.select({ id: userPlatformRoles.id, expiresAt: userPlatformRoles.expiresAt }).from(userPlatformRoles)
    .where(and(eq(userPlatformRoles.userId, target.id), eq(userPlatformRoles.role, role))).limit(1))[0];
  const lapsed = Boolean(held?.expiresAt && held.expiresAt.getTime() <= Date.now());
  if (held && !lapsed) throw new TRPCError({ code: "CONFLICT", message: "That person already holds this role." });
  const details = { targetUserId: target.id, role, expiresAt: expiresAt?.toISOString() ?? null };
  try {
    await db.transaction(async tx => {
      // A role whose end date has passed is renewed in place, so the history stays one row.
      if (held) await tx.update(userPlatformRoles).set({ expiresAt, grantedByUserId: actor.id }).where(eq(userPlatformRoles.id, held.id));
      else await tx.insert(userPlatformRoles).values({ userId: target.id, role, grantedByUserId: actor.id, expiresAt });
      await recordAudit(tx, { action: "platform_role_granted", actorUserId: actor.id, targetEmail: target.email, details });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "That person already holds this role." });
    throw error;
  }
  const until = expiresAt ? `, until ${expiresAt.toUTCString().slice(0, 16)}` : "";
  await alertSuperAdmins(db, {
    subject: `${roleLabel(role)} role given to ${target.email}`,
    lines: [`${actor.email ?? "An administrator"} gave ${target.name || target.email} the ${roleLabel(role)} role${until}.`, "If you did not expect this, remove the role from People in the admin area."],
    event: "platform_role_granted",
    actorUserId: actor.id,
    targetEmail: target.email,
  });
  return { success: true } as const;
}

/**
 * Revokes a stored platform role. The last Super Admin can never be removed: the removal is refused if nobody else
 * (and not the permanent owner bridge) would remain. The owner-email Super Admin cannot be revoked through roles at all.
 */
export async function revokePlatformRole(db: Database, input: { actor: Person & { authority: Authority }; targetUserId: number; role: PlatformRole }) {
  const { actor, targetUserId, role } = input;
  if (role === "super_admin" && !actor.authority.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only a Super Admin can revoke Super Admin." });
  }
  if (!canGrantRole(actor.authority, role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `You can only remove roles below your own. Ask a Super Admin to remove ${roleLabel(role)}.` });
  }
  if (targetUserId === actor.id && !actor.authority.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot change your own roles." });
  }
  const target = (await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, targetUserId)).limit(1))[0];
  const assignment = target
    ? (await db.select({ id: userPlatformRoles.id }).from(userPlatformRoles).where(and(eq(userPlatformRoles.userId, targetUserId), eq(userPlatformRoles.role, role))).limit(1))[0]
    : undefined;
  if (!target || !assignment) throw new TRPCError({ code: "NOT_FOUND", message: "That person does not hold this role." });

  if (role === "super_admin") {
    const before = await listSuperAdminIds(db);
    const stillSuper = isOwnerAdmin({ email: target.email });
    if (stillSuper) throw new TRPCError({ code: "CONFLICT", message: "The permanent Super Admin cannot be removed." });
    if (before.has(target.id) && before.size <= 1) throw new TRPCError({ code: "CONFLICT", message: "This is the last Super Admin and cannot be removed." });
  }
  await db.transaction(async tx => {
    await tx.delete(userPlatformRoles).where(eq(userPlatformRoles.id, assignment.id));
    await recordAudit(tx, { action: "platform_role_revoked", actorUserId: actor.id, targetEmail: target.email, details: { targetUserId: target.id, role } });
  });
  return { success: true } as const;
}

export async function listPlatformRoleAssignments(db: Pick<Database, "select">) {
  const rows = await db
    .select({ id: userPlatformRoles.id, userId: users.id, name: users.name, email: users.email, status: users.status, role: userPlatformRoles.role, expiresAt: userPlatformRoles.expiresAt, createdAt: userPlatformRoles.createdAt })
    .from(userPlatformRoles)
    .innerJoin(users, eq(userPlatformRoles.userId, users.id))
    .orderBy(users.id, userPlatformRoles.id);
  return rows;
}


type Actor = Person & { authority: Authority };

/** The checks shared by removing someone's access and resetting their two-step sign-in. */
async function guardTarget(db: Database, actor: Actor, targetUserId: number, verb: string) {
  if (targetUserId === actor.id) throw new TRPCError({ code: "CONFLICT", message: `You cannot ${verb} your own account. Ask another Super Admin.` });
  const target = (await db.select({ id: users.id, name: users.name, email: users.email, status: users.status }).from(users).where(eq(users.id, targetUserId)).limit(1))[0];
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "That person does not exist." });
  const superAdmins = await listSuperAdminIds(db);
  const targetIsSuper = superAdmins.has(target.id) || isOwnerAdmin({ email: target.email });
  if (targetIsSuper && !actor.authority.isSuperAdmin) throw new TRPCError({ code: "FORBIDDEN", message: `Only a Super Admin can ${verb} a Super Admin.` });
  const roles = (await db.select({ role: userPlatformRoles.role }).from(userPlatformRoles).where(eq(userPlatformRoles.userId, target.id))).map(row => row.role);
  const above = roles.find(role => !canGrantRole(actor.authority, role));
  if (above) throw new TRPCError({ code: "FORBIDDEN", message: `This person holds ${roleLabel(above)}, which is not below your own role. Ask a Super Admin.` });
  return { target, roles, targetIsSuper, superAdmins };
}

export const removeAccessInputSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().trim().min(3, "Give a short reason; it is kept in the audit log.").max(500),
});

/**
 * Removes a person's access in one step: every platform role, every engagement they are on, every open session, and
 * their two-step set-up; the account is suspended (it can be reinstated later from People, and they set up two-step
 * again). The reason is kept in the audit log and the Super Admins are told. The permanent and the last Super Admin
 * can never be removed, and nobody can remove themselves.
 */
export async function removeAccess(db: Database, input: { actor: Actor; userId: number; reason: string }) {
  const { actor } = input;
  const reason = input.reason.trim();
  if (reason.length < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Give a short reason; it is kept in the audit log." });
  const { target, roles, targetIsSuper, superAdmins } = await guardTarget(db, actor, input.userId, "remove access for");
  if (targetIsSuper) {
    if (isOwnerAdmin({ email: target.email })) throw new TRPCError({ code: "CONFLICT", message: "The permanent Super Admin cannot be removed." });
    if (superAdmins.size <= 1) throw new TRPCError({ code: "CONFLICT", message: "This is the last Super Admin and cannot be removed." });
  }
  const result = await db.transaction(async tx => {
    const engagements = await tx.delete(engagementTeam).where(eq(engagementTeam.userId, target.id)).returning({ id: engagementTeam.engagementId });
    await tx.delete(userPlatformRoles).where(eq(userPlatformRoles.userId, target.id));
    const sessions = await tx.update(userSessions).set({ revokedAt: databaseNow() })
      .where(and(eq(userSessions.userId, target.id), isNull(userSessions.revokedAt))).returning({ id: userSessions.id });
    await tx.delete(userTwoStep).where(eq(userTwoStep.userId, target.id));
    if (target.status === "active") await tx.update(users).set({ status: "suspended" }).where(eq(users.id, target.id));
    const summary = { targetUserId: target.id, roles, engagements: engagements.map(row => row.id), sessionsEnded: sessions.length, reason };
    await recordAudit(tx, { action: "access_removed", actorUserId: actor.id, targetEmail: target.email, details: summary });
    return summary;
  });
  await alertSuperAdmins(db, {
    subject: `Access removed: ${target.email}`,
    lines: [
      `${actor.email ?? "An administrator"} removed all access for ${target.name || target.email}.`,
      `Roles taken away: ${roles.map(roleLabel).join(", ") || "none"}. Engagements left: ${result.engagements.length}. Sessions ended: ${result.sessionsEnded}.`,
      `Reason: ${reason}`,
    ],
    event: "access_removed",
    actorUserId: actor.id,
    targetEmail: target.email,
  });
  return { success: true as const, ...result };
}

/**
 * For a lost or replaced phone: clears the person's two-step set-up and ends their sessions. At their next sign-in they
 * add the account to their authenticator app again. Same seniority rules as removing access.
 */
export async function resetTwoStep(db: Database, input: { actor: Actor; userId: number }) {
  const { actor } = input;
  const { target } = await guardTarget(db, actor, input.userId, "reset two-step sign-in for");
  await db.transaction(async tx => {
    await tx.delete(userTwoStep).where(eq(userTwoStep.userId, target.id));
    await tx.update(userSessions).set({ revokedAt: databaseNow() }).where(and(eq(userSessions.userId, target.id), isNull(userSessions.revokedAt)));
    await recordAudit(tx, { action: "two_step_reset", actorUserId: actor.id, targetEmail: target.email, details: { targetUserId: target.id } });
  });
  await alertSuperAdmins(db, {
    subject: `Two-step sign-in reset: ${target.email}`,
    lines: [`${actor.email ?? "An administrator"} reset two-step sign-in for ${target.name || target.email}. They will set it up again at their next sign-in.`],
    event: "two_step_reset",
    actorUserId: actor.id,
    targetEmail: target.email,
  });
  return { success: true as const };
}

/** Who has two-step sign-in switched on, for the People screen. */
export async function listTwoStepStatus(db: Pick<Database, "select">): Promise<Map<number, boolean>> {
  const rows = await db.select({ userId: userTwoStep.userId, enabledAt: userTwoStep.enabledAt }).from(userTwoStep);
  return new Map(rows.map(row => [row.userId, Boolean(row.enabledAt)]));
}

/**
 * Sets a staff member's level (ET, 5 November 2026): their firm title, and the roles that level gives (LEVEL_ROLES).
 * The new roles are given first, then roles the level does not include are removed, so access never drops to nothing
 * on the way. Super Admin is never touched. Each grant and removal follows the usual rules (below the giver's own
 * role; a Specialist needs an end date), and each is in the audit log.
 */
export async function setStaffLevel(db: Database, input: { actor: Person & { authority: Authority }; targetUserId: number; level: FirmLevel; expiresAt: Date | null }) {
  const desired = LEVEL_ROLES[input.level];
  const held = (await db.select({ role: userPlatformRoles.role, expiresAt: userPlatformRoles.expiresAt }).from(userPlatformRoles).where(eq(userPlatformRoles.userId, input.targetUserId)))
    .filter(row => !row.expiresAt || row.expiresAt.getTime() > Date.now()).map(row => row.role);
  for (const role of desired) {
    if (!held.includes(role)) await grantPlatformRole(db, { actor: input.actor, targetUserId: input.targetUserId, role, expiresAt: ROLES_REQUIRING_END_DATE.includes(role) ? input.expiresAt : null });
  }
  for (const role of held) {
    if (role !== "super_admin" && !desired.includes(role)) await revokePlatformRole(db, { actor: input.actor, targetUserId: input.targetUserId, role });
  }
  const target = (await db.select({ email: users.email }).from(users).where(eq(users.id, input.targetUserId)).limit(1))[0];
  await db.transaction(async tx => {
    await tx.update(users).set({ jobTitle: input.level }).where(eq(users.id, input.targetUserId));
    await recordAudit(tx, { action: "staff_level_set", actorUserId: input.actor.id, targetEmail: target?.email ?? null, details: { targetUserId: input.targetUserId, level: input.level, roles: desired } });
  });
  return { success: true, level: input.level } as const;
}

