/**
 * Whose items the Work Plan shows, and what the search box matches (ET, 13 November 2026). A view only: everyone on the
 * engagement still sees every item, and the server decides what each may do.
 */
export type Whose = "everyone" | "tasks" | "reviews" | "client" | number;

type Filterable = { side: string; title: string; ref?: string | null; detail?: string | null; owners?: readonly { userId: number }[]; reviewer?: { userId: number } | null };

/** Whether this person owns the item (lead owner or with others), and whether they review it. */
export function roleOf(item: Filterable, userId: number | null) {
  return { owns: userId !== null && (item.owners ?? []).some(owner => owner.userId === userId), reviews: userId !== null && item.reviewer?.userId === userId };
}

/**
 * Everyone's; My tasks (what this person owns, as lead owner or with others); My reviews (what they check, ET 14 November
 * 2026); the client's side; or one colleague's, owned or reviewed.
 */
export function matchesWhose(item: Filterable, whose: Whose, viewerUserId: number | null) {
  if (whose === "everyone") return true;
  if (whose === "client") return item.side === "client";
  if (whose === "tasks") return roleOf(item, viewerUserId).owns;
  if (whose === "reviews") return roleOf(item, viewerUserId).reviews;
  const role = roleOf(item, whose);
  return role.owns || role.reviews;
}

/** The tag a row carries for the person reading it: theirs to do, theirs to review, or waiting for their review now. */
export function roleTag(item: Filterable & { status: string }, userId: number | null): { text: string; tone: "do" | "follow" | "review" | "ready" } | null {
  const role = roleOf(item, userId);
  if (role.reviews && item.status === "received") return { text: "Ready for review", tone: "ready" };
  // The client does their own items; the team member named on one follows it up (ET, 14 November 2026).
  if (role.owns && item.side === "client") return { text: "To follow up", tone: "follow" };
  if (role.owns) return { text: "To do", tone: "do" };
  if (role.reviews) return { text: "To review", tone: "review" };
  return null;
}

/** The title, the item's reference (A1, 2.04) and a workplan code written in its detail ("Workplan 1.04"); any case. */
export function matchesSearch(item: Filterable, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const codes = Array.from((item.detail ?? "").matchAll(/Workplan (\d+\.\d+)/g), match => match[1]);
  const text = [item.title, item.ref ?? "", ...codes].join(" ").toLowerCase();
  return words.every(word => text.includes(word));
}

/** The choice as a select's value, and back. */
export const whoseValue = (whose: Whose) => String(whose);
export const whoseFrom = (value: string): Whose => (value === "everyone" || value === "tasks" || value === "reviews" || value === "client" ? value : Number(value));
