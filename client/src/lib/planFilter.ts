/**
 * Whose items the Work Plan shows, and what the search box matches (ET, 13 November 2026). A view only: everyone on the
 * engagement still sees every item, and the server decides what each may do.
 */
export type Whose = "everyone" | "mine" | "client" | number;

type Filterable = { side: string; title: string; ref?: string | null; detail?: string | null; owners?: readonly { userId: number }[]; reviewer?: { userId: number } | null };

/** Everyone; Mine (an item this person owns, as lead owner or with others, or reviews); the client's side; or one team member's, the same way. */
export function matchesWhose(item: Filterable, whose: Whose, viewerUserId: number | null) {
  if (whose === "everyone") return true;
  if (whose === "client") return item.side === "client";
  const person = whose === "mine" ? viewerUserId : whose;
  return person !== null && ((item.owners ?? []).some(owner => owner.userId === person) || item.reviewer?.userId === person);
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
export const whoseFrom = (value: string): Whose => (value === "everyone" || value === "mine" || value === "client" ? value : Number(value));
