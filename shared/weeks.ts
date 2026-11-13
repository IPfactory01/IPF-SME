/**
 * The weeks of an engagement (R85): week 1 starts on the start date, and each week is seven days. The client's room
 * and the team's workspace card the Work Plan by these weeks, so both show the same shape.
 */
import { addDays } from "./agreement";

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The week a day falls in, from the start date; null before the start or with no start. */
export function weekOfDay(startedOn: string | null, day: string | null): number | null {
  if (!startedOn || !day) return null;
  const days = daysBetween(startedOn, day);
  return days < 0 ? null : Math.floor(days / 7) + 1;
}

/** The first and last day of a week. */
export const weekDays = (startedOn: string, week: number) => ({ from: addDays(startedOn, (week - 1) * 7), to: addDays(startedOn, (week - 1) * 7 + 6) });

/** Where a week stands against today: past, this week, next week, or later. */
export function weekPlace(startedOn: string | null, week: number | null, today: string): "past" | "now" | "next" | "later" | "none" {
  if (week === null) return "none";
  const current = weekOfDay(startedOn, today);
  if (current === null) return week === 1 ? "now" : week === 2 ? "next" : "later";
  return week < current ? "past" : week === current ? "now" : week === current + 1 ? "next" : "later";
}

/** "25 Nov to 1 Dec", for a week's card. */
export function weekLabel(startedOn: string, week: number) {
  const { from, to } = weekDays(startedOn, week);
  const short = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  return `${short(from)} to ${short(to)}`;
}
