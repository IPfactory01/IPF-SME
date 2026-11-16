import { X } from "lucide-react";
import React, { useState } from "react";

export type BottomItem = { id: string; label: string; icon: React.ReactNode; onSelect: () => void; active?: boolean; badge?: number };

/**
 * A phone's bottom bar, as an app has it (ET, 16 November 2026, after ClickUp): the places used most, within thumb's
 * reach, and More for the rest in a sheet. Hidden from tablet width up, where the rail or the tabs do this job.
 */
export default function BottomBar({ label, items, more = [], footer }: { label: string; items: BottomItem[]; more?: BottomItem[]; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pick = (item: BottomItem) => { setOpen(false); item.onSelect(); };
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="More" className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }} onClick={event => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">More</p>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink-600"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <ul className="divide-y divide-line-soft">
              {more.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => pick(item)} className={`flex min-h-12 w-full items-center gap-3 text-left text-sm ${item.active ? "font-semibold text-brand" : "text-ink"}`}>
                    <span className="text-ink-muted">{item.icon}</span>{item.label}
                    {item.badge ? <span className="ml-auto rounded-full bg-brand-plum px-2 text-xs font-medium text-white tabular-nums">{item.badge}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {footer}
          </div>
        </div>
      )}
      <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-white lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <ul className="mx-auto flex max-w-xl">
          {[...items, ...(more.length || footer ? [{ id: "__more", label: "More", icon: <MoreIcon />, onSelect: () => setOpen(true), active: more.some(item => item.active) } as BottomItem] : [])].map(item => (
            <li key={item.id} className="flex-1">
              <button type="button" onClick={item.onSelect} aria-current={item.active ? "page" : undefined}
                className={`relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] ${item.active ? "font-semibold text-brand" : "text-ink-600"}`}>
                {item.icon}
                <span>{item.label}</span>
                {item.badge ? <span className="absolute right-[calc(50%-1.4rem)] top-1.5 rounded-full bg-brand-plum px-1.5 text-[10px] font-medium leading-4 text-white tabular-nums" aria-label={`${item.badge} waiting`}>{item.badge}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

const MoreIcon = () => <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>;
