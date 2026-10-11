import { eq, sql } from "drizzle-orm";
import { rateLimitCounters } from "../drizzle/schema";
import { sha256 } from "./adminSecurity";
import { getDb } from "./db";
import { isUndefinedTable } from "./dbHelpers";

/**
 * Fixed-window rate limits shared by every function instance. Each attempt advances a counter in rate_limit_counters
 * in one statement (migration 0010), so a limit holds across Vercel's instances and cold starts. Before the migration
 * is applied, or while the database cannot be written, this instance's own memory stands in: a public form must never
 * fail because its counter could not be stored. Subjects (addresses, emails, tokens) are hashed into the key, so none
 * is stored in clear.
 */

export type RateLimitRule = { scope: string; max: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The limits, in one place. */
export const LIMITS = {
  /** New Business Checks from one address, whatever email is typed. */
  checkStartIp: { scope: "check_start_ip", max: 20, windowMs: 15 * MINUTE },
  /** New Business Checks from one address and email. */
  checkStartEmail: { scope: "check_start_email", max: 5, windowMs: 15 * MINUTE },
  /** Progress saves per check (one per answer). */
  checkSave: { scope: "check_save", max: 300, windowMs: 15 * MINUTE },
  /** Submissions per check: each runs the AI summary and sends two emails. */
  checkSubmit: { scope: "check_submit", max: 3, windowMs: HOUR },
  /** Debrief and Full Report requests per check: each can email and look up Calendly. */
  checkNext: { scope: "check_next", max: 5, windowMs: DAY },
  /** Report Intake reads and submissions per report link. */
  reportForm: { scope: "report_form", max: 30, windowMs: HOUR },
  /** Report downloads per link: each renders the PDF again. */
  reportDownload: { scope: "report_download", max: 5, windowMs: DAY },
  /** Public token lookups per address: legacy reset confirmation and invitation status. */
  publicLookup: { scope: "public_lookup", max: 30, windowMs: HOUR },
} as const satisfies Record<string, RateLimitRule>;

const memory = new Map<string, { count: number; resetAt: number }>();
/** When the shared store could not be used, memory stands in until this time, then the store is tried again. */
let storeRetryAt = 0;
const STORE_RETRY_MS = 5 * MINUTE;
let missingTableReported = false;

/** The row key: the scope and a hash of the subject (never the subject itself). */
export function limitKey(rule: RateLimitRule, subject: string) {
  return `${rule.scope}:${sha256(`${rule.scope}|${subject.trim().toLowerCase()}`).slice(0, 40)}`;
}

function consumeInMemory(key: string, rule: RateLimitRule, now: number) {
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= rule.max;
}

async function store() {
  if (Date.now() < storeRetryAt) return null;
  try {
    return await getDb();
  } catch {
    return null;
  }
}

function standIn(reason: string, error?: unknown) {
  storeRetryAt = Date.now() + STORE_RETRY_MS;
  if (error === undefined || !isUndefinedTable(error)) {
    console.error(`[RateLimit] ${reason}; this instance's memory stands in for five minutes.`, error instanceof Error ? error.message : "");
  } else if (!missingTableReported) {
    missingTableReported = true;
    console.error("[RateLimit] The rate_limit_counters table is missing (migration 0010): limits are per function instance until it is applied.");
  }
}

/** Counts one attempt by `subject` against the rule and says whether it is still within the allowance. */
export async function consumeLimit(rule: RateLimitRule, subject: string): Promise<boolean> {
  const key = limitKey(rule, subject);
  const now = Date.now();
  const db = await store();
  if (db) {
    try {
      const windowEndsAt = new Date(now + rule.windowMs);
      const [row] = await db.insert(rateLimitCounters)
        .values({ key, count: 1, windowEndsAt })
        .onConflictDoUpdate({
          target: rateLimitCounters.key,
          set: {
            count: sql`case when ${rateLimitCounters.windowEndsAt} <= now() then 1 else ${rateLimitCounters.count} + 1 end`,
            windowEndsAt: sql`case when ${rateLimitCounters.windowEndsAt} <= now() then ${windowEndsAt}::timestamptz else ${rateLimitCounters.windowEndsAt} end`,
          },
        })
        .returning({ count: rateLimitCounters.count });
      if (row) return row.count <= rule.max;
    } catch (error) {
      standIn("The rate-limit counter could not be written", error);
    }
  }
  return consumeInMemory(key, rule, now);
}

/** Forgets a subject's attempts (after a successful sign-in, for example). */
export async function releaseLimit(rule: RateLimitRule, subject: string) {
  const key = limitKey(rule, subject);
  memory.delete(key);
  const db = await store();
  if (!db) return;
  try {
    await db.delete(rateLimitCounters).where(eq(rateLimitCounters.key, key));
  } catch (error) {
    standIn("The rate-limit counter could not be released", error);
  }
}

/** Deletes counters whose window has passed. Cheap; safe to run on any schedule. */
export async function purgeExpiredLimits() {
  const db = await store();
  if (!db) return 0;
  try {
    return (await db.delete(rateLimitCounters).where(sql`${rateLimitCounters.windowEndsAt} <= now()`).returning({ key: rateLimitCounters.key })).length;
  } catch (error) {
    standIn("Expired rate-limit counters could not be purged", error);
    return 0;
  }
}

/**
 * Clears every counter, in memory and in the store. Tests only: the limits are shared, so tests that share a process
 * (and an address) would otherwise spend one another's allowance. Never call this from application code.
 */
export async function resetRateLimitsForTests() {
  memory.clear();
  storeRetryAt = 0;
  missingTableReported = false;
  const db = await store();
  if (!db) return;
  try {
    await db.delete(rateLimitCounters);
  } catch (error) {
    if (!isUndefinedTable(error)) throw error;
  }
}
