import type { Benchmark, ReportBlock, ReportHealth } from "@shared/fullReport/build";
import type { InsightArea, RoomInsight } from "@shared/fullReport/insight";
import { METHOD } from "@shared/method";
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "framer-motion";
import { ChevronRight, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWide } from "@/hooks/useWide";
import { project, TAB_SPRING } from "./RoomTabs";

/**
 * The Founder and Business tabs of the client room. Everything here comes from the owner's Full Report (or, without
 * one, their Business Health Check), as the server sent it: the room never says something the report does not.
 */

const CARD = "border border-line-soft bg-paper-raised p-5 shadow-sm";
const KICKER = "text-xs font-semibold uppercase tracking-widest text-ink-muted";
const HEALTH: Record<ReportHealth, { label: string; chip: string; bar: string }> = {
  stuck: { label: "Stuck", chip: "bg-health-stuck-tint text-health-stuck", bar: "bg-health-stuck" },
  watch: { label: "Watch", chip: "bg-health-watch-tint text-health-watch", bar: "bg-health-watch" },
  clear: { label: "Clear", chip: "bg-health-clear-tint text-health-clear", bar: "bg-health-clear" },
  not_assessed: { label: "Not assessed", chip: "bg-paper-sunken text-ink-muted", bar: "bg-line" },
};
const ZONE: Record<"stuck" | "watch" | "clear", string> = { stuck: "bg-health-stuck-tint", watch: "bg-health-watch-tint", clear: "bg-health-clear-tint" };

export function HealthChip({ health }: { health: ReportHealth }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${HEALTH[health].chip}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{HEALTH[health].label}
    </span>
  );
}

const sourceLine = (insight: RoomInsight) => `From your ${insight.source}`;

function Heading({ title, source }: { title: string; source: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="font-serif text-2xl font-bold tracking-tight">{title}</h2>
      <span className="text-xs text-ink-muted">{source}</span>
    </div>
  );
}

// ---- Founder ---------------------------------------------------------------------------------------------------------

export function FounderPanel({ insight }: { insight: RoomInsight }) {
  const { founder } = insight;
  return (
    <div className="space-y-4">
      <Heading title="You, as the founder" source={sourceLine(insight)} />
      {/* One section under the other on a phone; Founder readiness beside Strategic intent on a wide screen. */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      {founder.sections.length ? founder.sections.map(section => (
        <article key={section.number} className={CARD} aria-labelledby={`founder-${section.number}`}>
          <div className="flex items-start justify-between gap-3">
            <h3 id={`founder-${section.number}`} className="font-serif text-xl font-bold tracking-tight"><span className="text-ink-muted tabular-nums">{section.number}.</span> {section.title}</h3>
            {section.health && <HealthChip health={section.health} />}
          </div>
          <p className="mt-2 font-serif text-lg leading-snug">{section.standfirst}</p>
          <div className="mt-4 space-y-4"><ReportBlocks blocks={section.blocks} /></div>
          {section.number === 2 && founder.question && <Question question={founder.question} />}
        </article>
      )) : (
        <article className={CARD} aria-labelledby="founder-readiness">
          <div className="flex items-start justify-between gap-3">
            <h3 id="founder-readiness" className="font-serif text-xl font-bold tracking-tight">Founder readiness</h3>
            <HealthChip health={founder.readiness.health} />
          </div>
          <p className="mt-2 font-serif text-lg leading-snug">{founder.readiness.label}</p>
          {founder.profile.length > 0 && <Facts rows={founder.profile} />}
          <p className="mt-4 text-sm text-ink-muted">Your {METHOD.fullReport} adds the four money basics, your goal and how the gap to it closes. Without it, this tab shows what your {METHOD.businessCheck} found.</p>
        </article>
      )}
      </div>
    </div>
  );
}

function Question({ question }: { question: NonNullable<RoomInsight["founder"]["question"]> }) {
  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <p className={KICKER}>How the gap closes</p>
      <div className="mt-2 space-y-2 text-sm text-ink-600">{question.text.map(line => <p key={line}>{line}</p>)}</div>
      {question.bridge && <div className="mt-3"><Bridge steps={question.bridge.steps} /></div>}
      {question.levers.length > 0 && (
        <dl className="mt-3 divide-y divide-line-soft text-sm">
          {question.levers.map(lever => (
            <div key={lever.lever} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
              <dt className="font-semibold">{lever.lever} <span className="font-normal text-ink-muted">· {lever.difficulty}</span></dt>
              <dd className="text-right tabular-nums">{lever.factor}</dd>
              <dd className="col-span-2 text-xs text-ink-muted">{lever.fromTo}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// ---- Report blocks, as the web shows them ----------------------------------------------------------------------------

function Facts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="mt-3 divide-y divide-line-soft text-sm">
      {rows.map(row => <div key={row.label} className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">{row.label}</dt><dd className="text-right font-semibold">{row.value}</dd></div>)}
    </dl>
  );
}

function Recommendation({ code, lines }: { code?: string; lines: React.ReactNode[] }) {
  return (
    <div className="border-l-2 border-highlight-ink bg-brand-tint-softer px-4 py-3 text-sm">
      <p className="text-[11px] font-bold uppercase tracking-widest text-highlight-ink">Recommendation{code ? ` ${code}` : ""}</p>
      <div className="mt-1 space-y-1.5">{lines.map((line, k) => <p key={k}>{line}</p>)}</div>
    </div>
  );
}

export function ReportBlocks({ blocks }: { blocks: ReportBlock[] }) {
  return <>{blocks.map((block, k) => <ReportBlockView key={k} block={block} />)}</>;
}

function ReportBlockView({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case "subsection": return <h4 className="pt-1 text-sm font-bold"><span className="text-ink-muted tabular-nums">{block.code}</span> {block.title}</h4>;
    case "heading": return <h4 className="pt-1 text-sm font-bold">{block.text}</h4>;
    case "paragraph": return <p className="text-sm text-ink-600">{block.text}</p>;
    case "facts": return <Facts rows={block.rows} />;
    case "bullets": return <ul className="list-disc space-y-1 pl-5 text-sm text-ink-600">{block.items.map(item => <li key={item}>{item}</li>)}</ul>;
    case "numbered": return (
      <div className="text-sm">
        {block.title && <p className={KICKER}>{block.title}</p>}
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-ink-600">{block.items.map(item => <li key={item}>{item}</li>)}</ol>
      </div>
    );
    case "recommendation": return <Recommendation code={block.code} lines={block.lines} />;
    case "callout": return <div className="border border-brand-line bg-brand-tint p-3 text-sm"><p className="font-semibold">{block.title}</p><p className="mt-1 text-ink-600">{block.text}</p></div>;
    case "table": return (
      <table className="w-full table-fixed text-left text-sm">
        <thead><tr className="border-b border-line">{block.columns.map((column, k) => <th key={column} scope="col" className="pb-1.5 pr-2 text-xs font-semibold text-ink-muted" style={block.widths ? { width: `${block.widths[k] * 100}%` } : undefined}>{column}</th>)}</tr></thead>
        <tbody>{block.rows.map(row => <tr key={row.join("|")} className="border-b border-line-soft last:border-0">{row.map((cell, k) => <td key={k} className={`py-2 pr-2 align-top ${k === 0 ? "font-medium" : "text-ink-600"}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    );
    case "reading": return <Reading reading={block} />;
    case "benchmarks": return <Benchmarks items={block.items} />;
    case "bridge": return <Bridge steps={block.steps} />;
    case "metrics": return <dl className="grid grid-cols-2 gap-3 text-sm">{block.items.map(item => <div key={item.label} className="border border-line-soft p-3"><dt className="text-xs text-ink-muted">{item.label}</dt><dd className="mt-1 font-serif text-lg font-bold tabular-nums">{item.value}</dd><dd className="text-xs text-ink-muted">{item.note}</dd></div>)}</dl>;
    // The chart-only blocks belong to the PDF; the room shows the same facts elsewhere.
    default: return null;
  }
}

type ReadingBlock = Extract<ReportBlock, { kind: "reading" }>;

function Reading({ reading }: { reading: ReadingBlock }) {
  return (
    <div className="space-y-3 text-sm">
      {reading.shows.length > 0 && <div><p className={KICKER}>What your answers show</p><ul className="mt-1 list-disc space-y-1 pl-5 text-ink-600">{reading.shows.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {reading.meaning.length > 0 && <div><p className={KICKER}>What it means</p><div className="mt-1 space-y-1.5 text-ink-600">{reading.meaning.map(item => <p key={item}>{item}</p>)}</div></div>}
      <Recommendation code={reading.code} lines={[
        <><b className="block">First move</b>{reading.move}</>,
        <><b className="block">This week</b>{reading.thisWeek}</>,
        <><b className="block">Number to watch</b>{reading.watch}</>,
      ]} />
    </div>
  );
}

function Benchmarks({ items }: { items: Benchmark[] }) {
  return (
    <div className="space-y-4">
      {items.map(item => {
        const span = item.max - item.min || 1;
        let from = item.min;
        const zones = item.zones.map(zone => { const width = Math.max(0, Math.min(item.max, zone.to) - from); from = Math.min(item.max, zone.to); return { width, health: zone.health }; });
        const at = Math.max(0, Math.min(1, (item.value - item.min) / span)) * 100;
        return (
          <div key={item.label} className="text-sm">
            <div className="flex justify-between gap-3"><span className="font-semibold">{item.label}</span><span className="tabular-nums">{item.display}</span></div>
            <div className="relative mt-1.5 flex h-2.5" role="img" aria-label={`${item.label}: ${item.display}. ${item.target}`}>
              {zones.map((zone, k) => <i key={k} className={`block h-full ${ZONE[zone.health]}`} style={{ flex: zone.width }} />)}
              <span aria-hidden className="absolute -bottom-1 -top-1 w-0.5 bg-ink" style={{ left: `calc(${at}% - 1px)` }} />
            </div>
            <p className="mt-1 text-xs text-ink-muted">{item.target}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Today to the target: totals at each end, each lever a step that floats from the last. */
function Bridge({ steps }: { steps: { label: string; amount: number; display: string; total?: boolean }[] }) {
  const H = 130, W = 360, gap = 12, width = (W - gap * (steps.length + 1)) / steps.length;
  let running = 0;
  const spans = steps.map(step => {
    const from = step.total ? 0 : running;
    running = step.total ? step.amount : running + step.amount;
    return { ...step, from, to: running };
  });
  const top = Math.max(...spans.map(span => span.to), 1);
  const bars = spans.map((span, k) => ({ ...span, x: gap + k * (width + gap), y: 20 + H - (span.to / top) * H, height: Math.max(2, ((span.to - span.from) / top) * H) }));
  return (
    <svg viewBox={`0 0 ${W} ${H + 50}`} className="h-auto w-full" role="img" aria-label={steps.map(step => `${step.label}: ${step.display}`).join(", ")}>
      <line x1="0" x2={W} y1={20 + H} y2={20 + H} className="stroke-line" />
      {bars.map((bar, k) => (
        <g key={bar.label}>
          <rect x={bar.x} y={bar.y} width={width} height={bar.height} className={bar.total ? (k === 0 ? "fill-brand-slate" : "fill-brand") : "fill-health-clear"} />
          <text x={bar.x + width / 2} y={bar.y - 5} textAnchor="middle" className={`text-[10px] font-bold ${bar.total ? "fill-ink" : "fill-health-clear"}`}>{bar.display}</text>
          <text x={bar.x + width / 2} y={H + 36} textAnchor="middle" className="fill-ink-muted text-[10px]">{bar.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ---- Business --------------------------------------------------------------------------------------------------------

export function BusinessPanel({ insight }: { insight: RoomInsight }) {
  const [open, setOpen] = useState<InsightArea | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const count = (health: ReportHealth) => insight.areas.filter(area => area.health === health).length;
  const tally = (["stuck", "watch", "clear", "not_assessed"] as const).map(health => ({ health, n: count(health) }));
  const summary = tally.filter(item => item.n).map(item => `${item.n} ${HEALTH[item.health].label.toLowerCase()}`).join(", ");
  return (
    <div className="space-y-4">
      <Heading title="Your business" source={insight.areas.some(area => area.reading) ? "Open an area for detail" : sourceLine(insight)} />
      <div className={CARD}>
        <div className="flex h-2.5 gap-0.5" role="img" aria-label={summary}>{tally.filter(item => item.n).map(item => <i key={item.health} className={`block h-full ${HEALTH[item.health].bar}`} style={{ flex: item.n }} />)}</div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600 tabular-nums">
          {tally.map(item => <span key={item.health} className="inline-flex items-center gap-1.5"><i aria-hidden className={`h-2 w-2 rounded-full ${HEALTH[item.health].bar}`} />{item.n} {HEALTH[item.health].label.toLowerCase()}</span>)}
        </p>
      </div>
      {/* A list on a phone; a grid of the whole business at once on a wide screen. */}
      <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3" aria-label="Areas of your business">
        {insight.areas.map(area => (
          <li key={area.area} className="lg:flex">
            <button
              type="button"
              disabled={!area.reading && !area.benchmarks.length}
              onClick={event => { opener.current = event.currentTarget; setOpen(area); }}
              className="grid w-full grid-cols-[4px_1fr_auto] items-stretch gap-x-4 border lg:h-full border-line-soft bg-paper-raised text-left shadow-sm transition-[transform,border-color] duration-100 hover:border-brand-line active:scale-[0.985] disabled:cursor-default disabled:active:scale-100 motion-reduce:transition-none"
            >
              <span aria-hidden className={HEALTH[area.health].bar} />
              <span className="min-w-0 py-3">
                <span className="block font-bold">{area.area}</span>
                <span className="mt-0.5 block text-sm text-ink-600">{area.finding}</span>
              </span>
              <span className="flex flex-col items-end justify-between gap-2 py-3 pr-3">
                <HealthChip health={area.health} />
                {(area.reading || area.benchmarks.length > 0) && <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden />}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <AreaSheet area={open} source={insight.source} onClose={() => { setOpen(null); opener.current?.focus(); }} />}
    </div>
  );
}

/**
 * The detail for one area. On a phone, a sheet that rises from below and follows the finger down: let go quickly, or
 * past halfway, and it closes; otherwise it springs back. On a wide screen, a panel that slides in from the right, with
 * the page still in view beside it. Escape, the scrim and the close button close either.
 */
function AreaSheet({ area, source, onClose }: { area: InsightArea; source: RoomInsight["source"]; onClose: () => void }) {
  const reduce = useReducedMotion();
  const side = useWide();
  const offset = useMotionValue(reduce ? 0 : 1200);
  const scrim = useTransform(offset, [0, 600], [1, 0]);
  const sheet = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const controls = useDragControls();
  const closing = useRef(false);
  const size = () => (side ? sheet.current?.offsetWidth : sheet.current?.offsetHeight) ?? 600;

  const dismiss = (velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    if (reduce) { onClose(); return; }
    animate(offset, size() + 24, { ...TAB_SPRING, duration: 0.3, velocity, onComplete: onClose });
  };

  useEffect(() => {
    if (!reduce) animate(offset, 0, { ...TAB_SPRING, duration: 0.32 });
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // Runs once per sheet: opening is a single gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if ((offset.get() + project(info.velocity.y)) / size() > 0.45) dismiss(info.velocity.y);
    else animate(offset, 0, { ...TAB_SPRING, duration: 0.3, velocity: info.velocity.y });
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <motion.div aria-hidden className="fixed inset-0 z-[60] bg-ink/40" style={{ opacity: scrim }} onClick={() => dismiss()} />
      <motion.section
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-sheet-title"
        data-placement={side ? "side" : "bottom"}
        className={side
          ? "fixed inset-y-0 right-0 z-[61] flex w-[min(34rem,100vw)] flex-col border-l border-line-soft bg-paper-raised shadow-xl"
          : "fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[88vh] max-w-2xl flex-col border border-line-soft bg-paper-raised shadow-xl"}
        style={side ? { x: offset } : { y: offset }}
        drag={side ? false : "y"}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.08, bottom: 1 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
      >
        <div className={side ? "px-6 pb-3 pt-6" : "touch-none cursor-grab px-5 pb-3 pt-2"} onPointerDown={side ? undefined : event => controls.start(event)}>
          {!side && <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={KICKER}>{HEALTH[area.health].label} · from your {source}</p>
              <h2 id="area-sheet-title" className="mt-1 font-serif text-2xl font-bold tracking-tight">{area.area}</h2>
            </div>
            <button ref={close} type="button" onClick={() => dismiss()} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center bg-paper-sunken text-ink-muted hover:text-ink"><X className="h-4 w-4" aria-hidden /></button>
          </div>
        </div>
        <div className={`space-y-4 overflow-y-auto overscroll-contain pb-8 ${side ? "px-6" : "px-5"}`}>
          <p className="font-serif text-lg leading-snug">{area.finding}</p>
          {area.benchmarks.length > 0 && <div><p className={KICKER}>Against what good looks like</p><div className="mt-2"><Benchmarks items={area.benchmarks} /></div></div>}
          {area.reading && <Reading reading={area.reading} />}
        </div>
      </motion.section>
    </>,
    document.body,
  );
}
