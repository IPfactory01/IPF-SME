import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FUNNEL_STATUS_LABELS, type FunnelStatus, type FunnelTone } from "@shared/businessCheck/funnelStatus";
import { Check, Copy } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

const TONES: Record<FunnelTone, string> = {
  muted: "border-line bg-paper-sunken text-ink-muted",
  neutral: "border-line bg-white text-ink",
  attention: "border-health-watch/40 bg-health-watch-tint text-ink",
  info: "border-brand-line bg-brand-tint text-brand",
  positive: "border-health-clear/40 bg-health-clear-tint text-ink",
  negative: "border-danger-line bg-danger-tint text-danger-strong",
};

/** A small coloured label for where a prospect is in the funnel. Colour never carries the meaning alone: the words do. */
export function StatusBadge({ status }: { status: FunnelStatus }) {
  const { label, tone } = FUNNEL_STATUS_LABELS[status];
  return <span className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{label}</span>;
}

export function AdminMetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-line bg-white px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="mt-1 font-serif text-2xl leading-none text-ink">{value}</dd>
    </div>
  );
}

/** Name, then email, then WhatsApp: the way every table identifies a prospect. */
export function ProspectCell({ fullName, email, whatsapp, businessName }: { fullName: string; email: string; whatsapp?: string | null; businessName?: string | null }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm font-medium text-ink">{fullName}</span>
      {/* On a phone the Business column is hidden, so the business name moves under the name. */}
      {businessName ? <span className="block truncate text-[13px] text-ink sm:hidden">{businessName}</span> : null}
      <span className="block truncate text-[13px] text-ink-muted">{email}</span>
      {whatsapp ? <span className="hidden truncate text-xs text-ink-muted md:block">{whatsapp}</span> : null}
    </span>
  );
}

/**
 * A whole table row that opens its record. Mouse users click anywhere on the row; keyboard and screen-reader users reach a
 * real button in the first cell (Enter or Space press it, and its click bubbles to the row), and the row shows a focus state.
 */
export function ClickableRow({ onOpen, children, selected }: { onOpen: () => void; children: React.ReactNode; selected?: boolean }) {
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-line-soft transition-colors hover:bg-brand-tint/50 focus-within:bg-brand-tint/70 active:bg-brand-tint active:duration-0 ${selected ? "bg-brand-tint/40" : ""}`}
    >
      {children}
    </tr>
  );
}

/** The focusable control inside a ClickableRow's first cell. It has no handler of its own: the row's onClick does the work. */
export function RowButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-haspopup="dialog" aria-label={label} className="block w-full min-w-0 text-left focus:outline-none focus-visible:underline">
      {children}
    </button>
  );
}

export const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted";
export const TD = "px-3 py-3 align-top text-[13px] text-ink";

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line-soft pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Copies a value (never logged or sent anywhere); shows a brief tick. Safe where the clipboard API is unavailable. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Copy ${label}`}
      className="h-7 w-7 p-0 text-ink-muted hover:text-brand"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error("Could not copy. Select the text and copy it instead."),
        );
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

/**
 * The right-hand record panel: about 576px on a laptop, the full width on a phone. Closing it leaves the table as it was.
 * It slides in from the right and back out the same way (motion in index.css, `[data-record-drawer]`), quickly and without
 * overshoot; with reduced motion it fades instead.
 */
export function RecordDrawer({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-record-drawer="" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-line-soft p-6 pr-12">
          <SheetTitle className="font-serif text-2xl text-ink">{title}</SheetTitle>
          <SheetDescription className="text-sm text-ink-muted">{description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
