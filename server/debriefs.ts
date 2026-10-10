import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { businessChecks, debriefs } from "../drizzle/schema";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";

/**
 * The Debrief: the free call after the Business Check, written up by the analyst within the hour, following the
 * firm's Client Debrief Meeting guide cut to The Shift. One record per business check. It informs the Work Plan,
 * and once shared it opens the owner's room warm. Nothing here decides who may call it: the routers do.
 */

export const DEBRIEF_MISSING_MESSAGE = "The Debrief record is not set up in the database yet (migration 0009).";

export function isMissingDebriefTable(error: unknown) {
  const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01";
}

export type DebriefInput = {
  businessCheckId: number;
  heldAt: Date | null;
  heard: string | null;
  problemInOwnerWords: string | null;
  successLooksLike: string | null;
  tried: string | null;
  nextSteps: string | null;
};

/** What the owner sees of the Debrief once it is shared: the summary, never who captured it. */
export type SharedDebrief = { heldAt: Date | null; heard: string | null; problemInOwnerWords: string | null; successLooksLike: string | null; tried: string | null; nextSteps: string | null; sharedAt: Date };

async function requireCheck(db: Pick<Database, "select">, businessCheckId: number) {
  const check = (await db.select({ id: businessChecks.id, email: businessChecks.email }).from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "This business check does not exist." });
  return check;
}

/** The team's view of the Debrief for a business check, or null when none has been written up yet. */
export async function getDebrief(db: Pick<Database, "select">, businessCheckId: number) {
  return (await db.select().from(debriefs).where(eq(debriefs.businessCheckId, businessCheckId)).limit(1))[0] ?? null;
}

/** Writes the Debrief up, or rewrites it: one record per business check. Sharing is a separate, deliberate step. */
export async function saveDebrief(db: Database, input: DebriefInput, actorUserId: number) {
  const check = await requireCheck(db, input.businessCheckId);
  const values = { heldAt: input.heldAt, heard: input.heard, problemInOwnerWords: input.problemInOwnerWords, successLooksLike: input.successLooksLike, tried: input.tried, nextSteps: input.nextSteps, capturedByUserId: actorUserId };
  return db.transaction(async tx => {
    const [row] = await tx.insert(debriefs).values({ businessCheckId: check.id, ...values })
      .onConflictDoUpdate({ target: debriefs.businessCheckId, set: values })
      .returning({ id: debriefs.id, sharedAt: debriefs.sharedAt });
    await recordAudit(tx, { action: "debrief_saved", actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, debriefId: row.id } });
    return { debriefId: row.id, shared: row.sharedAt !== null } as const;
  });
}

/** Lets the owner see the Debrief in their room, or takes it back. The room shows it only to the owner and full-access staff. */
export async function shareDebrief(db: Database, input: { businessCheckId: number; shared: boolean }, actorUserId: number) {
  const check = await requireCheck(db, input.businessCheckId);
  return db.transaction(async tx => {
    const updated = await tx.update(debriefs).set({ sharedAt: input.shared ? new Date() : null }).where(eq(debriefs.businessCheckId, check.id)).returning({ id: debriefs.id });
    if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "Write the Debrief up before sharing it." });
    await recordAudit(tx, { action: "debrief_shared", actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, debriefId: updated[0].id, shared: input.shared } });
    return { success: true } as const;
  });
}

/** The shared Debrief for the owner's room; null when none, not shared, or the table is not there yet (0009). */
export async function sharedDebriefFor(db: Pick<Database, "select">, businessCheckId: number): Promise<SharedDebrief | null> {
  try {
    const row = await getDebrief(db, businessCheckId);
    if (!row || !row.sharedAt) return null;
    return { heldAt: row.heldAt, heard: row.heard, problemInOwnerWords: row.problemInOwnerWords, successLooksLike: row.successLooksLike, tried: row.tried, nextSteps: row.nextSteps, sharedAt: row.sharedAt };
  } catch (error) {
    if (isMissingDebriefTable(error)) return null;
    throw error;
  }
}
