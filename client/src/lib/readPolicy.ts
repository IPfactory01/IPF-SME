/**
 * How every read behaves on a weak connection (design brief §5, R69). A failed read is tried twice more before the
 * screen says so; a refusal (the server answered: not signed in, not allowed, not found, a bad request, too many
 * requests) is an answer, never retried and never shown as a connection problem.
 */
const REFUSALS = new Set(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "METHOD_NOT_SUPPORTED", "CONFLICT", "PRECONDITION_FAILED", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "UNPROCESSABLE_CONTENT", "TOO_MANY_REQUESTS"]);

/** True when the server refused, as opposed to the request failing (no connection, a timeout, a server fault). */
export function isRefusal(error: unknown): boolean {
  const data = (error as { data?: { code?: unknown; httpStatus?: unknown } | null } | null | undefined)?.data;
  if (!data) return false;
  if (typeof data.httpStatus === "number") return data.httpStatus >= 400 && data.httpStatus < 500 && data.httpStatus !== 408;
  return typeof data.code === "string" && REFUSALS.has(data.code);
}

/** Tries after the first failure. */
export const READ_RETRIES = 2;

/** React Query's `retry` for every read (main.tsx). */
export function retryRead(failureCount: number, error: unknown): boolean {
  return failureCount < READ_RETRIES && !isRefusal(error);
}

/** 0.8 s, then 1.6 s: the whole wait stays under three seconds before the screen says it could not load. */
export const readRetryDelay = (attempt: number) => Math.min(800 * 2 ** attempt, 4000);

/** "10:42 am", in Lagos, for "Showing what we had at …". */
export function lagosClock(at: number | Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).format(at).replace(/\s?([ap])\.?m\.?$/i, " $1m").toLowerCase();
}
