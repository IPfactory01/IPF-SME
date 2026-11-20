/**
 * PulseShare — results-page sharing controls (15 Aug 2026).
 *
 * Two complementary sharing modes, per the user's request:
 *  1. "Share results" — a small button that opens the device's native share
 *     sheet (WhatsApp, Messages, etc.) via the Web Share API, with a WhatsApp
 *     button and clipboard fallback for desktop browsers. The shared link
 *     points to the *view-only* results page for this session so colleagues
 *     can see the summary without starting a new assessment.
 *  2. "Invite someone" — an address-bar-style box with a copyable invite
 *     link (?ref=<sessionId>) that pre-tags every referred respondent with
 *     the sharer's session id, visible in the admin dashboard.
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Share2 } from "lucide-react";

/** Shared and invite links always use the live site, so a link copied from a preview still opens for the recipient. */
const PRODUCTION_ORIGIN = "https://www.ipfactory.co";

/** Public results page (view-only summary: score, dimensions, 90-day plan, engagement). */
function resultsUrl(sessionId: string): string {
  return `${PRODUCTION_ORIGIN}/pulse/results/${encodeURIComponent(sessionId)}`;
}

/**
 * Compact invite alias — the full session token is stored on the session row
 * as shortCode, resolved server-side (PulseStart accepts `ic` OR `ref`).
 * Falls back to the full URL if no short code is available yet.
 */
function inviteUrl(sessionId: string, shortCode: string | null | undefined): string {
  const base = `${PRODUCTION_ORIGIN}/pulse`;
  if (shortCode) return `${base}?ic=${encodeURIComponent(shortCode)}`;
  return `${base}?ref=${encodeURIComponent(sessionId)}`;
}

function ShareText({
  sessionId,
  classificationLabel,
  shortCode,
}: {
  sessionId: string;
  classificationLabel: string;
  shortCode?: string | null;
}) {
  return `I just took the IPF AI & Workflow Readiness Pulse — my organisation's readiness score is ${classificationLabel}. Take yours in a few minutes: ${inviteUrl(sessionId, shortCode)}`;
}

async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Non-HTTPS contexts may reject clipboard; copy via selection fallback.
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/** Copy the view-only results link to the clipboard (15 Aug 2026 polish). */
function CopyLinkButton({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyLink(resultsUrl(sessionId));
    if (!ok) {
      toast.error("Unable to copy — please select the link manually.");
      return;
    }
    setCopied(true);
    toast.success("Results link copied — you can paste it into WhatsApp or any app.");
  };

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy results link"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-1.5 text-xs font-semibold text-ink transition-all duration-150 hover:bg-brand-tint active:scale-[0.97]"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-brand-deep" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copy link
        </>
      )}
    </button>
  );
}

function ShareButton({
  sessionId,
  classificationLabel,
  shortCode,
}: {
  sessionId: string;
  classificationLabel: string;
  shortCode?: string | null;
}) {
  const title = "My IPF AI & Workflow Readiness Pulse";
  const text = ShareText({ sessionId, classificationLabel, shortCode });
  const nativeSupported = useMemo(() => typeof navigator !== "undefined" && "share" in navigator, []);

  const doShare = async () => {
    try {
      if (nativeSupported) {
        await navigator.share({ title, text, url: resultsUrl(sessionId) });
        return;
      }
      // Desktop fallback: WhatsApp web/app share of the view-only results page.
      const wa = `https://wa.me/?text=${encodeURIComponent(`${title} — ${text} ${resultsUrl(sessionId)}`)}`;
      window.open(wa, "_blank", "noopener");
      toast.success("Opening WhatsApp — if nothing appears, the link has been copied to your clipboard.");
      await copyLink(`${title} — ${text} ${resultsUrl(sessionId)}`);
    } catch (err) {
      // User cancelled a native share sheet — do nothing noisy.
      if (err instanceof Error && /cancel/i.test(err.message)) return;
      await copyLink(`${title} — ${text} ${resultsUrl(sessionId)}`);
      toast.success("Link copied — you can paste it into WhatsApp or any app.");
    }
  };

  return (
    <button
      type="button"
      onClick={doShare}
      aria-label="Share results"
      className="inline-flex items-center gap-1.5 rounded-lg border border-highlight/40 bg-highlight/10 px-3 py-1.5 text-xs font-semibold text-brand-deep transition-all duration-200 hover:bg-highlight/20 active:scale-[0.97]"
    >
      <Share2 className="h-3.5 w-3.5" />
      Share results
    </button>
  );
}

function InviteBox({
  sessionId,
  organisationName,
  shortCode,
}: {
  sessionId: string;
  organisationName: string;
  shortCode?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(sessionId, shortCode);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Non-HTTPS contexts may reject clipboard; copy via selection fallback.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success("Invite link copied — share it with anyone.");
  };

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-deep">
          <Link2 className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="font-display text-sm font-bold text-ink">
            Invite someone to take their AI Pulse
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Share this with someone who may find it useful. Each person who starts from it is
            tagged as invited by you — visible in the summary IPF keeps.
          </p>
          {/* Address-bar style invite link — min-w-0 + break-all so any length stays inside the card */}
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-paper-raised px-3 py-2">
            <span className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-ink-muted select-all">
              {url}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-deep px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:bg-brand-deep active:scale-[0.97]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShareResultsRow({
  sessionId,
  classificationLabel,
  shortCode,
}: {
  sessionId: string;
  classificationLabel: string;
  shortCode?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Share your result
      </p>
      <div className="flex items-center gap-2">
        <ShareButton sessionId={sessionId} classificationLabel={classificationLabel} shortCode={shortCode} />
        <CopyLinkButton sessionId={sessionId} />
      </div>
    </div>
  );
}

export function InviteTeamBox({
  sessionId,
  organisationName,
  shortCode,
}: {
  sessionId: string;
  organisationName: string;
  shortCode?: string | null;
}) {
  return <InviteBox sessionId={sessionId} organisationName={organisationName || "your organisation"} shortCode={shortCode} />;
}

export default function PulseShare({
  sessionId,
  classificationLabel,
  organisationName,
  shortCode,
}: {
  sessionId: string;
  classificationLabel: string;
  organisationName: string;
  shortCode?: string | null;
}) {
  return (
    <div className="space-y-4">
      <ShareResultsRow sessionId={sessionId} classificationLabel={classificationLabel} />
      <InviteTeamBox sessionId={sessionId} organisationName={organisationName} shortCode={shortCode} />
    </div>
  );
}
