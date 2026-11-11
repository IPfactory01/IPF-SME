import { ENV } from "./_core/env";

/**
 * Reads a booking from IP Factory's Calendly account, so the admin console shows when a discovery call is booked for.
 * The browser only passes the booking's address (Calendly tells the page when someone books); the time is fetched here
 * with CALENDLY_API_TOKEN, so it cannot be made up by the browser, and the booking must belong to the owner who took the
 * check. Without the token, or if anything fails, nothing is recorded and the call stays "requested".
 */

const API = "https://api.calendly.com";
/** The only shape accepted from the browser: a scheduled event in Calendly's API. */
export const CALENDLY_EVENT_URI = /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]{8,64}$/;

export function isCalendlyConfigured() {
  return Boolean(ENV.calendlyApiToken);
}

async function calendly<T>(path: string): Promise<T | null> {
  // A slow Calendly must never hold up the owner's confirmation: give up after 5 seconds.
  const response = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${ENV.calendlyApiToken}`, accept: "application/json" }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    // Visible in the hosting logs; never includes the token or anyone's email. 401 means the token is wrong or revoked.
    console.warn(`[Calendly] ${path.split("?")[0].replace(/[A-Za-z0-9-]{8,}/g, "…")} returned ${response.status}`);
    return null;
  }
  return (await response.json()) as T;
}

/** IP Factory's Calendly organisation, read once per server instance. */
let organisation: Promise<string | null> | null = null;
function organisationUri() {
  organisation ??= calendly<{ resource?: { current_organization?: string } }>("/users/me").then((me) => {
    const uri = me?.resource?.current_organization ?? null;
    if (!uri) organisation = null; // try again next time rather than remembering a failure
    return uri;
  });
  return organisation;
}

/** Forgets the cached organisation and session event type (tests). */
export function resetCalendlyForTests() {
  organisation = null;
  sessionEventType = null;
}

const sameUrl = (a: string, b: string) => a.trim().toLowerCase().replace(/\/+$/, "") === b.trim().toLowerCase().replace(/\/+$/, "");

/** Whether the room can offer "Book Session N": the token reads bookings back, and the booking page is set. */
export function isSessionBookingConfigured() {
  return isCalendlyConfigured() && /^https:\/\/calendly\.com\/[^\s?#]+$/i.test(ENV.calendlySessionUrl);
}

/** The Session booking page with the owner's name and email filled in, as Calendly reads them from the address. */
export function sessionBookingUrl(input: { name: string; email: string }) {
  if (!isSessionBookingConfigured()) return null;
  const url = new URL(ENV.calendlySessionUrl);
  if (input.name.trim()) url.searchParams.set("name", input.name.trim());
  url.searchParams.set("email", input.email.trim().toLowerCase());
  return url.toString();
}

/** The Calendly event type behind CALENDLY_SESSION_URL, found once per server instance by its booking page. */
let sessionEventType: Promise<string | null> | null = null;
function sessionEventTypeUri() {
  sessionEventType ??= (async () => {
    const org = await organisationUri();
    if (!org) return null;
    const types = await calendly<{ collection?: { uri?: string; scheduling_url?: string }[] }>(`/event_types?${new URLSearchParams({ organization: org, count: "100" })}`);
    return types?.collection?.find((type) => type.uri && type.scheduling_url && sameUrl(type.scheduling_url, ENV.calendlySessionUrl))?.uri ?? null;
  })().then((uri) => {
    if (!uri) sessionEventType = null;
    return uri;
  });
  return sessionEventType;
}

export type SessionBooking = { start: Date; end: Date | null; joinUrl: string | null };

/**
 * The owner's active Session bookings since `since`, earliest first: only the Session event type, so the Discovery
 * Call or any other booking is never mistaken for a Session. Empty when anything is missing or fails.
 */
export async function findSessionBookings(inviteeEmail: string, since: Date): Promise<SessionBooking[]> {
  if (!isSessionBookingConfigured()) return [];
  try {
    const [org, eventType] = [await organisationUri(), await sessionEventTypeUri()];
    if (!org || !eventType) return [];
    const query = new URLSearchParams({ organization: org, invitee_email: inviteeEmail.trim().toLowerCase(), status: "active", sort: "start_time:asc", min_start_time: since.toISOString(), count: "20" });
    const events = await calendly<{ collection?: { start_time?: string; end_time?: string; status?: string; event_type?: string; location?: { join_url?: string } }[] }>(`/scheduled_events?${query}`);
    return (events?.collection ?? [])
      .filter((event) => event.status === "active" && event.event_type === eventType && event.start_time)
      .map((event) => ({ start: new Date(event.start_time!), end: event.end_time ? new Date(event.end_time) : null, joinUrl: event.location?.join_url && /^https:\/\//.test(event.location.join_url) ? event.location.join_url : null }))
      .filter((booking) => !Number.isNaN(booking.start.getTime()))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  } catch (error) {
    console.warn("[Calendly] Could not look up Session bookings:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * The time of the active Calendly booking made with `inviteeEmail`: the next upcoming one, or else the most recent.
 * Used to fill in bookings the page could not report (made before the token was set, or in a new tab).
 */
export async function findBookedCall(inviteeEmail: string, now = new Date()): Promise<Date | null> {
  if (!isCalendlyConfigured()) return null;
  try {
    const org = await organisationUri();
    if (!org) return null;
    const query = new URLSearchParams({ organization: org, invitee_email: inviteeEmail.trim().toLowerCase(), status: "active", sort: "start_time:desc", count: "20" });
    const events = await calendly<{ collection?: { start_time?: string; status?: string; event_type?: string }[] }>(`/scheduled_events?${query}`);
    // A Business Review Session is not a Discovery Call.
    const sessionType = isSessionBookingConfigured() ? await sessionEventTypeUri() : null;
    const times = (events?.collection ?? [])
      .filter((event) => event.status === "active" && event.start_time && !(sessionType && event.event_type === sessionType))
      .map((event) => new Date(event.start_time!))
      .filter((time) => !Number.isNaN(time.getTime()));
    const upcoming = times.filter((time) => time >= now).sort((a, b) => a.getTime() - b.getTime());
    const past = times.filter((time) => time < now).sort((a, b) => b.getTime() - a.getTime());
    return upcoming[0] ?? past[0] ?? null;
  } catch (error) {
    console.warn("[Calendly] Could not look up bookings:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * The start time of an active Calendly booking made by `inviteeEmail`, or null when the token is missing, the booking
 * is not in IP Factory's account, it was cancelled, or someone else booked it.
 */
export async function bookedCallTime(eventUri: string, inviteeEmail: string): Promise<Date | null> {
  if (!isCalendlyConfigured() || !CALENDLY_EVENT_URI.test(eventUri)) return null;
  const path = eventUri.slice(API.length);
  try {
    const event = await calendly<{ resource?: { start_time?: string; status?: string } }>(path);
    const start = event?.resource?.start_time ? new Date(event.resource.start_time) : null;
    if (!start || Number.isNaN(start.getTime()) || event?.resource?.status !== "active") return null;
    const invitees = await calendly<{ collection?: { email?: string; status?: string }[] }>(`${path}/invitees?email=${encodeURIComponent(inviteeEmail)}`);
    const email = inviteeEmail.trim().toLowerCase();
    const matches = (invitees?.collection ?? []).some((invitee) => invitee.email?.trim().toLowerCase() === email && invitee.status !== "canceled");
    return matches ? start : null;
  } catch (error) {
    console.warn("[Calendly] Could not read the booking:", error instanceof Error ? error.message : error);
    return null;
  }
}

// ---- The monthly reviews (R80) ----------------------------------------------------------------------------------

const BOOKING_PAGE = /^https:\/\/calendly\.com\/[^\s?#]+$/i;
/** The tag a review's booking link carries, so the booking lands on that review. */
export const reviewTag = (sessionId: number) => `session-${sessionId}`;

/** Whether reviews can be booked by the client: the token reads bookings back, and the review page is set. */
export function isReviewBookingConfigured() {
  return isCalendlyConfigured() && BOOKING_PAGE.test(ENV.calendlyReviewUrl);
}

/** The review booking page with the owner's name and email filled in, and the review it is for. */
export function reviewBookingUrl(input: { name: string; email: string; sessionId: number }) {
  if (!isReviewBookingConfigured()) return null;
  const url = new URL(ENV.calendlyReviewUrl);
  if (input.name.trim()) url.searchParams.set("name", input.name.trim());
  url.searchParams.set("email", input.email.trim().toLowerCase());
  url.searchParams.set("utm_content", reviewTag(input.sessionId));
  return url.toString();
}

let reviewEventType: Promise<string | null> | null = null;
function reviewEventTypeUri() {
  reviewEventType ??= (async () => {
    const org = await organisationUri();
    if (!org) return null;
    const types = await calendly<{ collection?: { uri?: string; scheduling_url?: string }[] }>(`/event_types?${new URLSearchParams({ organization: org, count: "100" })}`);
    return types?.collection?.find((type) => type.uri && type.scheduling_url && sameUrl(type.scheduling_url, ENV.calendlyReviewUrl))?.uri ?? null;
  })().then((uri) => {
    if (!uri) reviewEventType = null;
    return uri;
  });
  return reviewEventType;
}
export function resetReviewEventTypeForTests() { reviewEventType = null; }

export type ReviewBooking = SessionBooking & { sessionId: number | null };

/**
 * The owner's active review bookings since `since`, earliest first, each with the review its link named (from the
 * invitee's tracking), or null for one booked from the plain page. Empty when anything is missing or fails.
 */
export async function findReviewBookings(inviteeEmail: string, since: Date): Promise<ReviewBooking[]> {
  if (!isReviewBookingConfigured()) return [];
  try {
    const [org, eventType] = [await organisationUri(), await reviewEventTypeUri()];
    if (!org || !eventType) return [];
    const email = inviteeEmail.trim().toLowerCase();
    const query = new URLSearchParams({ organization: org, invitee_email: email, status: "active", sort: "start_time:asc", min_start_time: since.toISOString(), count: "20" });
    const events = await calendly<{ collection?: { uri?: string; start_time?: string; end_time?: string; status?: string; event_type?: string; location?: { join_url?: string } }[] }>(`/scheduled_events?${query}`);
    const found: ReviewBooking[] = [];
    for (const event of events?.collection ?? []) {
      if (event.status !== "active" || event.event_type !== eventType || !event.start_time || !event.uri) continue;
      const start = new Date(event.start_time);
      if (Number.isNaN(start.getTime())) continue;
      const uuid = event.uri.split("/scheduled_events/")[1] ?? "";
      const invitees = /^[A-Za-z0-9-]{8,64}$/.test(uuid) ? await calendly<{ collection?: { email?: string; tracking?: { utm_content?: string | null } }[] }>(`/scheduled_events/${uuid}/invitees?${new URLSearchParams({ email })}`) : null;
      const tag = invitees?.collection?.find((invitee) => invitee.email?.toLowerCase() === email)?.tracking?.utm_content ?? "";
      const match = /^session-(\d+)$/.exec(tag);
      found.push({ start, end: event.end_time ? new Date(event.end_time) : null, joinUrl: event.location?.join_url && /^https:\/\//.test(event.location.join_url) ? event.location.join_url : null, sessionId: match ? Number(match[1]) : null });
    }
    return found.sort((a, b) => a.start.getTime() - b.start.getTime());
  } catch (error) {
    console.warn("[Calendly] Could not look up review bookings:", error instanceof Error ? error.message : error);
    return [];
  }
}
