/** Display helpers for the admin console. Presentation only: nothing here decides access or changes a record. */
import { PLATFORM_ROLE_LABELS } from "@shared/auth";

type Dateish = Date | string | null | undefined;

export const formatDate = (value: Dateish) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");

/** "2:00 PM" */
export const formatTime = (value: Dateish) =>
  value ? new Date(value).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?([ap])m$/i, (_, letter: string) => ` ${letter.toUpperCase()}M`) : "-";

export const formatDateTime = (value: Dateish) => (value ? `${formatDate(value)}, ${formatTime(value)}` : "-");

const READINESS_WORDS: Record<string, string> = { advanced: "Advanced", intermediate: "Intermediate", nascent: "Early stage" };

/** The short form used in tables ("Intermediate readiness"); the full sentence lives in the record drawer. */
export const readinessShort = (level: string | null | undefined) => (level ? `${READINESS_WORDS[level] ?? level} readiness` : "");

export const ROUTE_LABELS: Record<string, string> = { programme: "Programme", foundation: "Foundation", idea: "Idea stage", advisory: "Advisory" };

/** A wa.me link from a phone number, or null if it does not look like one. Digits only, so nothing else reaches the URL. */
export function whatsappLink(number: string | null | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

const pad = (value: number) => String(value).padStart(2, "0");
/** For an <input type="date"> in the browser's own time zone. */
export const toDateInput = (value: Dateish) => (value ? `${new Date(value).getFullYear()}-${pad(new Date(value).getMonth() + 1)}-${pad(new Date(value).getDate())}` : "");
/** For an <input type="time"> in the browser's own time zone. */
export const toTimeInput = (value: Dateish) => (value ? `${pad(new Date(value).getHours())}:${pad(new Date(value).getMinutes())}` : "");

/** Combines the two inputs into one moment, or null when either is missing or invalid. */
export function combineDateAndTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const combined = new Date(`${date}T${time}`);
  return Number.isNaN(combined.getTime()) ? null : combined;
}

const ROLE_LABELS: Record<string, string> = PLATFORM_ROLE_LABELS;

/** "Super Admin", or "Super Admin · Engagement lead". The plain Admin role is implied by Super Admin, so it is not repeated. */
export function roleDisplay(roles: readonly string[] | undefined): string {
  const shown = (roles ?? []).filter(role => !(role === "admin" && roles?.includes("super_admin")));
  return shown.map(role => ROLE_LABELS[role] ?? role.replace(/_/g, " ")).join(" · ");
}
