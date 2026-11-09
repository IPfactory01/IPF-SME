import { animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from "framer-motion";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type RoomTab = { id: string; label: string; count?: { value: number; label: string }; content: React.ReactNode };

/** Critically damped: the panel settles without overshoot, in the same time whether tapped or flung. */
export const TAB_SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;
/** Where a fling would come to rest, as a scroll view decelerates (UIScrollView's normal rate). */
export const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

/** The fade at an edge of the tab bar where more tabs sit; none when every tab shows. */
const fadeOf = (more: { left: boolean; right: boolean }) => {
  if (!more.left && !more.right) return undefined;
  return `linear-gradient(to right, ${more.left ? "transparent, black 32px" : "black"}, ${more.right ? "black calc(100% - 32px), transparent" : "black"})`;
};

const tabFromHash = (tabs: RoomTab[]) => {
  if (typeof window === "undefined") return -1;
  return tabs.findIndex(tab => `#${tab.id}` === window.location.hash);
};

/**
 * The room's three tabs: a segmented control that stays under the header, over panels that follow the finger. A swipe
 * is projected forward from its speed, so a flick moves one tab and a slow drag snaps back; the edges give with
 * resistance instead of stopping dead. Taps never wait for an animation, and a moving panel can be caught mid-way.
 * Hidden panels are inert, so the keyboard and screen readers only reach the tab on screen.
 */
/**
 * `onChange` hears which tab is on screen (the room shrinks its header off the Overview on a phone); `top` overrides
 * where the tab bar sticks (under the room's one-line bar when that shows).
 */
export default function RoomTabs({ tabs, initial, label, onChange, top: topOverride }: { tabs: RoomTab[]; initial: string; label: string; onChange?: (id: string) => void; top?: number }) {
  const [index, setIndex] = useState(() => {
    const fromHash = tabFromHash(tabs);
    return fromHash >= 0 ? fromHash : Math.max(0, tabs.findIndex(tab => tab.id === initial));
  });
  const indexRef = useRef(index);
  indexRef.current = index;
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const viewport = useRef<HTMLDivElement>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const [top, setTop] = useState(0);
  const dragged = useRef(false);
  const controls = useDragControls();
  const tablist = useRef<HTMLDivElement>(null);
  // Which edges of the tab bar hide more tabs, so the bar can fade there (R71).
  const [more, setMore] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const measureMore = useCallback(() => {
    const list = tablist.current;
    if (!list) return;
    const left = list.scrollLeft > 1;
    const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setMore(current => (current.left === left && current.right === right ? current : { left, right }));
  }, []);

  const settle = useCallback((to: number, velocity = 0) => {
    if (!width) return;
    if (reduce) x.set(-to * width);
    else animate(x, -to * width, { ...TAB_SPRING, velocity });
  }, [reduce, width, x]);

  const select = useCallback((to: number, options: { focus?: boolean; velocity?: number } = {}) => {
    const next = Math.max(0, Math.min(tabs.length - 1, to));
    setIndex(next);
    settle(next, options.velocity);
    if (options.focus) buttons.current[next]?.focus();
    if (typeof window !== "undefined" && window.history?.replaceState) window.history.replaceState(window.history.state, "", `#${tabs[next].id}`);
  }, [settle, tabs]);

  // The panel width, and the header's height so the control sits just under it.
  useLayoutEffect(() => {
    const measure = () => {
      const w = viewport.current?.clientWidth ?? 0;
      setWidth(w);
      x.set(-indexRef.current * w);
      setTop(document.querySelector("header")?.getBoundingClientRect().height ?? 0);
    };
    measure();
    window.addEventListener("resize", measure);
    // The page can change width without the window doing so (the rail appears, a scrollbar comes and goes); measure
    // again then, or the slide offset goes stale and the next panel shows at the edge.
    const observer = typeof ResizeObserver === "undefined" || !viewport.current ? null : new ResizeObserver(measure);
    if (observer && viewport.current) observer.observe(viewport.current);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, [x]);

  // The tab on screen: tell the room, and bring its button into view inside the bar (never scrolling the page) (R71).
  useEffect(() => {
    onChange?.(tabs[index]?.id ?? initial);
    const list = tablist.current;
    const button = buttons.current[index];
    if (list && button) list.scrollTo?.({ left: Math.max(0, button.offsetLeft - (list.clientWidth - button.offsetWidth) / 2), behavior: reduce ? "auto" : "smooth" });
    measureMore();
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener("resize", measureMore);
    return () => window.removeEventListener("resize", measureMore);
  }, [measureMore]);

  // The viewport takes the height of the panel on screen, so a short tab does not leave a long empty page.
  useEffect(() => {
    const panel = panels.current[index];
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(panel.offsetHeight));
    observer.observe(panel);
    setHeight(panel.offsetHeight);
    return () => observer.disconnect();
  }, [index]);

  // A link to a tab (#business) or to something inside one (#step-5) opens that tab first.
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const byTab = tabs.findIndex(tab => tab.id === id);
      const target = byTab >= 0 ? null : document.getElementById(id);
      const inPanel = target ? panels.current.findIndex(panel => panel?.contains(target)) : -1;
      const to = byTab >= 0 ? byTab : inPanel;
      if (to < 0) return;
      select(to);
      if (target) requestAnimationFrame(() => target.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" }));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [reduce, select, tabs]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (!width) return;
    const projected = x.get() + project(info.velocity.x);
    // One tab per gesture, however hard the flick.
    const to = Math.max(index - 1, Math.min(index + 1, Math.round(-projected / width)));
    select(to, { velocity: info.velocity.x });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key], { focus: true });
  };

  return (
    <div>
      <div className="sticky z-30 border-b border-line-soft bg-white px-2 sm:px-5" style={{ top: topOverride ?? top }} data-room-tabs>
        <div
          ref={tablist}
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          onScroll={measureMore}
          data-more={more.left && more.right ? "both" : more.right ? "right" : more.left ? "left" : undefined}
          className="flex gap-1 overflow-x-auto [scrollbar-width:none]"
          style={{ maskImage: fadeOf(more), WebkitMaskImage: fadeOf(more) }}
        >
          {tabs.map((tab, k) => (
            <button
              key={tab.id}
              ref={element => { buttons.current[k] = element; }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              aria-selected={k === index}
              tabIndex={k === index ? 0 : -1}
              onClick={() => select(k)}
              className={`relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${k === index ? "border-brand font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              {tab.label}
              {tab.count && tab.count.value > 0 && <span className="text-xs font-normal text-ink-muted tabular-nums" aria-label={tab.count.label}>{tab.count.value}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* relative: the clip's own box anchors absolutely placed controls inside the panels (a hidden file input), so
          one in a hidden panel cannot widen the page and let a phone drag the room sideways (design review B1). */}
      <div
        ref={viewport}
        data-room-panels
        className="relative overflow-clip transition-[height] duration-300 ease-out motion-reduce:transition-none"
        style={{ height: height ?? undefined, touchAction: "pan-y" }}
        // Swiping is for touch. With a mouse, a sideways drag selects text as it always has; the control changes tab.
        onPointerDown={event => { if (event.pointerType !== "mouse" && width) controls.start(event); }}
        onClickCapture={event => {
          // A drag that ends over a button is not a tap on it.
          if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; }
        }}
      >
        <motion.div
          className="flex items-start"
          style={{ x, width: `${tabs.length * 100}%` }}
          drag={width ? "x" : false}
          dragControls={controls}
          dragListener={false}
          dragDirectionLock
          dragElastic={0.18}
          dragMomentum={false}
          dragConstraints={{ left: -(tabs.length - 1) * width, right: 0 }}
          onDragStart={() => { dragged.current = true; }}
          onDragEnd={(event, info) => { onDragEnd(event, info); setTimeout(() => { dragged.current = false; }, 0); }}
        >
          {tabs.map((tab, k) => (
            <section
              key={tab.id}
              ref={element => { panels.current[k] = element; }}
              role="tabpanel"
              id={`panel-${tab.id}`}
              aria-labelledby={`tab-${tab.id}`}
              aria-hidden={k !== index}
              inert={k !== index}
              className="min-w-0 overflow-x-clip px-4 pb-10 pt-6 sm:px-7"
              style={{ width: `${100 / tabs.length}%` }}
            >
              {tab.content}
            </section>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
