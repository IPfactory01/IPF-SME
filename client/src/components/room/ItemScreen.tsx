import { METHOD } from "@shared/method";
import { ArrowLeft } from "lucide-react";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Below the wide layout an item is its own screen (ET, 16 November 2026); `wide` is where it sits beside the list instead. */
type Wide = "lg" | "xl";
// Each side's panel pads differently (the client's p-5, the team's p-4); the bar reaches its edges.
const BELOW: Record<Wide, string> = { lg: "-top-5 -mx-5 lg:hidden", xl: "-top-4 -mx-4 xl:hidden" };

/**
 * The top of an item's screen on a phone, as an app has it: back to the Work Plan on the left, and Details and Messages
 * to move within the item. Hidden where the item sits beside the list.
 */
export function ItemScreenBar({ wide, taskId, onBack }: { wide: Wide; taskId: number; onBack: () => void }) {
  const toMessages = () => document.getElementById(`messages-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const toTop = (event: React.MouseEvent<HTMLButtonElement>) => event.currentTarget.closest("aside")?.scrollTo({ top: 0, behavior: "smooth" });
  return (
    <div className={`sticky z-10 mb-2 flex items-center justify-between gap-2 border-b border-line-soft bg-white px-2 py-1 ${BELOW[wide]}`}>
      <button type="button" onClick={onBack} aria-label={`Back to the ${METHOD.workPlan}`} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-brand">
        <ArrowLeft className="h-4 w-4" aria-hidden />{METHOD.workPlan}
      </button>
      <span className="flex gap-1 pr-2">
        <button type="button" onClick={toTop} className="min-h-9 rounded-full bg-brand-tint px-3 text-xs font-semibold text-brand-deep">Details</button>
        <button type="button" onClick={toMessages} className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold text-ink-600">Messages</button>
      </span>
    </div>
  );
}

const STICKY: Record<Wide, string> = {
  lg: "max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-5 max-lg:border-t max-lg:border-line-soft max-lg:bg-white max-lg:px-5 max-lg:py-3",
  xl: "max-xl:sticky max-xl:bottom-0 max-xl:z-10 max-xl:-mx-4 max-xl:border-t max-xl:border-line-soft max-xl:bg-white max-xl:px-4 max-xl:py-3",
};

/** An item's main actions, held at the foot of the screen on a phone so nobody scrolls to find them. */
export function StickyActions({ wide, children }: { wide: Wide; children: React.ReactNode }) {
  return <div className={STICKY[wide]} style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}>{children}</div>;
}

const QUERY: Record<Wide, string> = { lg: "(min-width: 1024px)", xl: "(min-width: 1280px)" };

/** Whether the screen is at least `wide` (lg or xl); false where the browser cannot say (tests). */
function useAtLeast(wide: Wide) {
  const read = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY[wide]).matches;
  const [at, setAt] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(QUERY[wide]);
    const onChange = () => setAt(query.matches);
    query.addEventListener?.("change", onChange);
    onChange();
    return () => query.removeEventListener?.("change", onChange);
  }, [wide]);
  return at;
}

/**
 * Where an item's screen is drawn (ET, 16 November 2026). Beside the list on a wide screen; on a phone straight onto the
 * page, outside the sliding strip of tabs: inside it the full screen was placed against the strip, off to one side, and
 * the phone showed a blank page.
 */
export function ItemSheet({ wide, skin, children }: { wide: Wide; skin?: string; children: React.ReactNode }) {
  const atLeast = useAtLeast(wide);
  if (atLeast || typeof document === "undefined") return <>{children}</>;
  // Outside the page it keeps the look its page gives it (the team's workspace: rounded fields, full-height buttons).
  return createPortal(skin ? <div className={skin}>{children}</div> : children, document.body);
}
