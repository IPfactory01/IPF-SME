import { isRefusal, lagosClock } from "@/lib/readPolicy";
import React from "react";

/**
 * The four states of a screen that loads data (design brief §5, R69): loading, empty, failed and partly done. A failure
 * is never shown as empty: a read that failed says so, offers Try again, and keeps the last copy when there is one.
 */
export const FAILED_TEXT = "We could not load this. Check your connection and try again.";

const TRY = "inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-deep-hover disabled:opacity-60";

/** The outline of what is coming, in the sunken tone; never a blank screen or a spinner alone. */
export function Loading({ label, rows = 3, className = "" }: { label: string; rows?: number; className?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={`space-y-3 ${className}`}>
      <div aria-hidden className="h-5 w-2/5 rounded-lg bg-paper-sunken" />
      {Array.from({ length: rows }, (_, index) => <div key={index} aria-hidden className="h-14 w-full rounded-lg bg-paper-sunken" />)}
    </div>
  );
}

/** What will appear here, and who adds it or when; at most one action. */
export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-6 text-sm text-ink-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** The request failed: say so and offer Try again. A refusal says what the server said, or `refusal`, and offers nothing. */
export function Failed({ error, onRetry, retrying = false, refusal }: { error: unknown; onRetry: () => void; retrying?: boolean; refusal?: string }) {
  if (isRefusal(error)) {
    const said = (error as { message?: string }).message;
    return <p role="alert" className="text-sm text-danger-strong">{refusal ?? said ?? "This account cannot see this."}</p>;
  }
  return (
    <div role="alert" className="rounded-lg border border-danger-line bg-danger-tint p-4 text-sm text-danger-strong">
      <p>{FAILED_TEXT}</p>
      <button type="button" onClick={onRetry} disabled={retrying} className={`mt-3 ${TRY}`}>{retrying ? "Trying again…" : "Try again"}</button>
    </div>
  );
}

/** A refresh failed but the last copy is on screen: say how old it is. */
export function Stale({ updatedAt, onRetry, retrying = false }: { updatedAt?: number; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper-raised px-4 py-2 text-sm text-ink-600">
      <span>We could not refresh this.{updatedAt ? ` Showing what we had at ${lagosClock(updatedAt)}.` : ""}</span>
      <button type="button" onClick={onRetry} disabled={retrying} className="inline-flex min-h-11 items-center px-2 font-semibold text-brand underline underline-offset-2 disabled:opacity-60">{retrying ? "Trying again…" : "Try again"}</button>
    </div>
  );
}

/** The parts of a React Query read these states need (a test's stand-in needs only data and error). */
export type Read<T> = { data: T | undefined; error?: unknown; isLoading?: boolean; isFetching?: boolean; dataUpdatedAt?: number; refetch?: () => unknown };

/**
 * One read, its states and its content: the outline while it loads, Failed when it failed with nothing to show, the
 * content with a Stale line when a refresh failed, and the content otherwise. Empty is the content's own business,
 * because only the content knows what "nothing yet" means; it is never reached on a failure.
 */
export function ReadState<T>({ read, loading, rows, refusal, children }: { read: Read<T>; loading: string; rows?: number; refusal?: string; children: (data: T) => React.ReactNode }) {
  const retry = () => void read.refetch?.();
  if (read.data === undefined) {
    if (read.error) return <Failed error={read.error} onRetry={retry} retrying={read.isFetching} refusal={refusal} />;
    if (read.isLoading) return <Loading label={loading} rows={rows} />;
    return null;
  }
  return (
    <>
      {read.error && !isRefusal(read.error) ? <Stale updatedAt={read.dataUpdatedAt} onRetry={retry} retrying={read.isFetching} /> : null}
      {children(read.data)}
    </>
  );
}

/** The Stale line for a read whose refresh failed while its last copy is on screen; nothing otherwise. */
export function StaleLine({ read }: { read: Read<unknown> }) {
  if (read.data === undefined || !read.error || isRefusal(read.error)) return null;
  return <Stale updatedAt={read.dataUpdatedAt} onRetry={() => void read.refetch?.()} retrying={read.isFetching} />;
}
