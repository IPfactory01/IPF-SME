/**
 * Draws a product's sample work (shared/productStories.ts) from data: a line, bars, a table, a checklist, actions, a
 * timeline or a Measure of Success. Every figure is a sample and is labelled as one. Charts are drawn to one scale,
 * with their labels inside the drawing.
 */
import type { StoryVisual as Visual } from "@shared/productStories";
import { Check, Minus, X } from "lucide-react";
import React from "react";

const FONT = "Plus Jakarta Sans, Arial, sans-serif";
const AXIS = { fontSize: 12, fill: "var(--color-ink-muted)", fontFamily: FONT } as const;

function Frame({ title, children, sample = true }: { title: string; children: React.ReactNode; sample?: boolean }) {
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{title.replace(/^Sample:?\s*/i, "")}</span>
        {sample && <span className="border border-line px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">Sample</span>}
      </figcaption>
      {children}
    </figure>
  );
}

/** A drawing wider than a phone scrolls sideways; it takes keyboard focus so the scroll is reachable without a mouse. */
function Scroll({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${label} (scrolls sideways)`}>{children}</div>;
}

function LineChart({ visual }: { visual: Extract<Visual, { kind: "line" }> }) {
  const W = 900, H = 330, L = 64, R = 24, T = 24, B = 44;
  const lo = Math.floor(Math.min(0, ...visual.values));
  const hi = Math.ceil(Math.max(...visual.values));
  const x = (i: number) => L + (i * (W - L - R)) / (visual.values.length - 1);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const points = visual.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const worst = visual.values.indexOf(Math.min(...visual.values));
  const shortRun = visual.values.map((v, i) => (v < 0 ? i : -1)).filter(i => i >= 0);
  const fmt = (v: number) => `${v < 0 ? "−" : ""}₦${Math.abs(v)}${visual.unit.replace("₦", "")}`;
  return (
    <Scroll label={visual.title}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${visual.title}. ${visual.callout}.`} className="block h-auto w-full min-w-[540px]">
        <defs><linearGradient id="story-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-brand)" stopOpacity={0.2} /><stop offset="1" stopColor="var(--color-brand)" stopOpacity={0} /></linearGradient></defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke={t === 0 ? "var(--color-ink-muted)" : "var(--color-line)"} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={L - 10} y={y(t) + 4} textAnchor="end" {...AXIS}>{fmt(t)}</text>
          </g>
        ))}
        {shortRun.length > 0 && <rect x={x(shortRun[0] - 0.5)} y={T} width={x(shortRun[shortRun.length - 1] + 0.5) - x(shortRun[0] - 0.5)} height={H - T - B} fill="var(--color-danger-tint)" />}
        <polygon points={`${x(0)},${y(Math.max(lo, 0))} ${points} ${x(visual.values.length - 1)},${y(Math.max(lo, 0))}`} fill="url(#story-area)" />
        <polyline points={points} fill="none" stroke="var(--color-brand)" strokeWidth={3.5} strokeLinejoin="round" />
        {visual.values.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={v < 0 ? 6.5 : 4} fill={v < 0 ? "var(--color-highlight-ink)" : "var(--color-brand)"} />
            <text x={x(i)} y={H - 16} textAnchor="middle" {...AXIS}>{visual.labels[i]}</text>
          </g>
        ))}
        <text x={x(worst) + 12} y={y(visual.values[worst]) + 5} fontSize={14} fontWeight={800} fill="var(--color-highlight-ink)" fontFamily={FONT}>{visual.callout}</text>
      </svg>
    </Scroll>
  );
}

function Bars({ visual }: { visual: Extract<Visual, { kind: "bars" }> }) {
  const W = 900, H = 320, L = 24, R = 24, T = 24, B = 54;
  const max = Math.max(...visual.groups.flatMap(group => group.values)) * 1.12;
  const band = (W - L - R) / visual.groups.length;
  const bar = Math.min(54, band / 3.2);
  const h = (v: number) => (v / max) * (H - T - B);
  const money = (v: number) => `₦${v.toLocaleString("en-GB")}`;
  return (
    <div>
      <Scroll label={visual.title}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${visual.title}. ${visual.note ?? ""}`} className="block h-auto w-full min-w-[540px]">
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--color-line)" strokeWidth={1.5} />
        {visual.groups.map((group, i) => {
          const cx = L + band * i + band / 2;
          const [cost, price] = group.values;
          const losing = price < cost;
          return (
            <g key={group.label}>
              <rect x={cx - bar - 3} y={H - B - h(cost)} width={bar} height={h(cost)} fill="var(--color-ink-muted)" />
              <rect x={cx + 3} y={H - B - h(price)} width={bar} height={h(price)} fill={losing || i === visual.highlight ? "var(--color-highlight-ink)" : "var(--color-brand)"} />
              <text x={cx + 3 + bar / 2} y={H - B - h(price) - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-ink)" fontFamily={FONT}>{money(price)}</text>
              <text x={cx} y={H - B + 22} textAnchor="middle" {...AXIS}>{group.label}</text>
            </g>
          );
        })}
      </svg>
      </Scroll>
      <div className="mt-2 flex flex-wrap gap-5 text-[13px] text-ink-soft">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-ink-muted align-[-1px]" />{visual.legend[0]}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-brand align-[-1px]" />{visual.legend[1]}</span>
        {visual.note && <span className="font-semibold text-highlight-ink">{visual.note}</span>}
      </div>
    </div>
  );
}

function Measure({ visual }: { visual: Extract<Visual, { kind: "measure" }> }) {
  const W = 900, H = 300, L = 56, R = 24, T = 24, B = 44;
  const top = Math.max(visual.target, ...visual.readings) * 1.15;
  const band = (W - L - R) / visual.readings.length;
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const fmt = (v: number) => (visual.unit === "%" ? `${v}%` : `₦${v}${visual.unit}`);
  return (
    <Scroll label={visual.title}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${visual.title}: from ${fmt(visual.baseline)} to ${fmt(visual.readings[visual.readings.length - 1])}, target ${fmt(visual.target)}.`} className="block h-auto w-full min-w-[480px]">
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--color-line)" strokeWidth={1.5} />
        <line x1={L} y1={y(visual.target)} x2={W - R} y2={y(visual.target)} stroke="var(--color-health-clear)" strokeWidth={2} strokeDasharray="6 6" />
        <text x={W - R} y={y(visual.target) - 8} textAnchor="end" fontSize={13} fontWeight={800} fill="var(--color-health-clear)" fontFamily={FONT}>Target {fmt(visual.target)}</text>
        {visual.readings.map((v, i) => {
          const cx = L + band * i + band / 2;
          const reached = v >= visual.target;
          return (
            <g key={i}>
              <rect x={cx - band * 0.28} y={y(v)} width={band * 0.56} height={H - B - y(v)} fill={reached ? "var(--color-highlight-ink)" : "var(--color-brand)"} />
              <text x={cx} y={y(v) - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-ink)" fontFamily={FONT}>{fmt(v)}</text>
              <text x={cx} y={H - 16} textAnchor="middle" {...AXIS}>Week {i + 1}</text>
            </g>
          );
        })}
        <text x={L - 8} y={y(visual.baseline) + 4} textAnchor="end" {...AXIS}>{fmt(visual.baseline)}</text>
      </svg>
    </Scroll>
  );
}

const STATE = {
  ready: { icon: Check, label: "Ready", tone: "text-health-clear-strong bg-health-clear-tint" },
  nearly: { icon: Minus, label: "Nearly", tone: "text-health-watch bg-health-watch-tint" },
  missing: { icon: X, label: "Missing", tone: "text-health-stuck bg-health-stuck-tint" },
} as const;

export function StoryVisual({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case "line":
      return <Frame title={visual.title}><LineChart visual={visual} /></Frame>;
    case "bars":
      return <Frame title={visual.title}><Bars visual={visual} /></Frame>;
    case "measure":
      return <Frame title={visual.title}><Measure visual={visual} /></Frame>;
    case "table":
      return (
        <Frame title={visual.title}>
          <Scroll label={visual.title}>
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr>{visual.columns.map((column, i) => <th key={i} scope="col" className={`border-b border-line px-2 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted ${i === 0 ? "text-left" : "text-right"}`}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {visual.rows.map((row, r) => {
                  const marked = visual.highlight?.includes(r);
                  return (
                    <tr key={r} className={marked ? "bg-danger-tint font-bold text-danger" : ""}>
                      {row.map((cell, c) => <td key={c} className={`border-b border-line px-2 py-2.5 ${c === 0 ? "text-left" : "text-right"}`}>{cell}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Scroll>
        </Frame>
      );
    case "checklist":
      return (
        <Frame title={visual.title}>
          {visual.score !== undefined && (
            <div className="mb-4 flex items-center gap-4">
              <span className="font-sans text-5xl font-extrabold tracking-tight text-ink tabular-nums">{visual.score}%</span>
              <span className="h-2 flex-1 bg-paper-sunken"><span className="block h-2 bg-brand" style={{ width: `${visual.score}%` }} /></span>
            </div>
          )}
          <ul className="grid gap-2">
            {visual.items.map((item) => {
              const state = STATE[item.state];
              const Icon = state.icon;
              return (
                <li key={item.label} className="flex items-center justify-between gap-3 bg-paper-sunken px-3.5 py-3">
                  <span className="min-w-0 text-[15px] text-ink">{item.label}{item.note && <span className="block text-xs text-ink-muted">{item.note}</span>}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs font-bold ${state.tone}`}><Icon className="h-3.5 w-3.5" aria-hidden />{state.label}</span>
                </li>
              );
            })}
          </ul>
        </Frame>
      );
    case "moves":
      return (
        <Frame title={visual.title}>
          <ul className="grid gap-2.5">
            {visual.rows.map((row) => (
              <li key={row.text} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border border-line bg-paper-raised p-3.5 sm:grid-cols-[6.5rem_1fr_auto]">
                <b className="col-span-2 text-[11px] font-bold uppercase tracking-[0.14em] text-highlight-ink sm:col-span-1">{row.tag}</b>
                <span className="text-[15px] text-ink">{row.text}</span>
                <em className="whitespace-nowrap font-sans text-sm font-extrabold not-italic text-health-clear tabular-nums">{row.value}</em>
              </li>
            ))}
          </ul>
        </Frame>
      );
    case "timeline":
      return (
        <Frame title={visual.title}>
          <ol className="relative grid gap-5 border-l-2 border-line pl-6">
            {visual.items.map((item, i) => (
              <li key={item.when} className="relative">
                <span aria-hidden className={`absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-paper-raised ${i === visual.items.length - 1 ? "bg-highlight-ink" : "bg-brand"}`} />
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">{item.when}</p>
                <p className="mt-0.5 font-bold text-ink">{item.title}</p>
                {item.detail && <p className="text-sm text-ink-soft">{item.detail}</p>}
              </li>
            ))}
          </ol>
        </Frame>
      );
  }
}
