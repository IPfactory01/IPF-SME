/**
 * The small drawing of what a product hands over, on its tile in the menu and in the order summary. One line style for
 * every product, drawn in the theme's colours. The story file (shared/productStories.ts) names the kind.
 */
import type { ArtKind } from "@shared/productStories";
import React from "react";

const C = {
  brand: "var(--color-brand)",
  plum: "var(--color-brand-plum)",
  crimson: "var(--color-highlight-ink)",
  cyan: "var(--color-highlight)",
  line: "var(--color-line)",
  muted: "var(--color-ink-muted)",
  soft: "var(--color-ink-soft)",
  ink: "var(--color-ink)",
  sunken: "var(--color-paper-sunken)",
  raised: "var(--color-paper-raised)",
  good: "var(--color-health-clear)",
};
const FONT = "Plus Jakarta Sans, Arial, sans-serif";

const tick = (x: number, y: number, key?: React.Key) => <path key={key} d={`M${x} ${y} l5 5 l9 -10`} fill="none" stroke={C.good} strokeWidth={3.5} />;

const DRAWINGS: Record<ArtKind, { label: string; draw: () => React.ReactNode }> = {
  check: {
    label: "A phone showing ten areas, some red, some amber, some green",
    draw: () => (
      <>
        <rect x={78} y={8} width={64} height={114} fill={C.raised} stroke={C.line} strokeWidth={2} />
        {[C.good, C.crimson, "var(--color-health-watch)", C.crimson, C.good, "var(--color-health-watch)"].map((fill, i) => <rect key={i} x={88} y={20 + i * 16} width={44} height={10} fill={fill} />)}
      </>
    ),
  },
  report: {
    label: "A report with a ranked list of fixes",
    draw: () => (
      <>
        <rect x={60} y={10} width={100} height={110} fill={C.raised} stroke={C.line} strokeWidth={2} />
        <rect x={60} y={10} width={100} height={6} fill={C.crimson} />
        {[0, 1, 2, 3].map(i => <g key={i}><text x={70} y={42 + i * 20} fontSize={12} fontWeight={800} fill={C.brand} fontFamily={FONT}>{i + 1}</text><line x1={84} y1={38 + i * 20} x2={146 - (i % 2) * 20} y2={38 + i * 20} stroke={C.muted} strokeWidth={4} /></g>)}
      </>
    ),
  },
  forecast: {
    label: "A 13-week cash line dipping below zero in week 7",
    draw: () => (
      <>
        <line x1={10} y1={80} x2={210} y2={80} stroke={C.line} strokeWidth={2} />
        <polyline points="12,30 28,36 44,44 60,52 76,60 92,74 108,104 124,92 140,74 156,60 172,50 188,42 204,34" fill="none" stroke={C.brand} strokeWidth={4} strokeLinejoin="round" />
        <circle cx={108} cy={104} r={7} fill={C.crimson} />
        <text x={116} y={124} fontSize={12} fontWeight={700} fill={C.crimson} fontFamily={FONT}>Week 7</text>
      </>
    ),
  },
  ledger: {
    label: "A ledger with every row ticked off",
    draw: () => (
      <>
        <rect x={40} y={10} width={140} height={112} fill={C.sunken} />
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={58} y1={32 + i * 18} x2={130 - (i % 2) * 18} y2={32 + i * 18} stroke={C.muted} strokeWidth={4} />{tick(146, 28 + i * 18)}</g>)}
      </>
    ),
  },
  pricing: {
    label: "Cost and price bars for three products, one priced below cost",
    draw: () => (
      <>
        <line x1={20} y1={112} x2={200} y2={112} stroke={C.line} strokeWidth={2} />
        {([[40, 62, 40], [100, 30, 74], [160, 48, 52]] as const).map(([x, cost, price], i) => (
          <g key={x}><rect x={x} y={112 - cost} width={18} height={cost} fill={C.muted} /><rect x={x + 22} y={112 - price} width={18} height={price} fill={i === 0 ? C.crimson : C.brand} /></g>
        ))}
      </>
    ),
  },
  plan: {
    label: "Three priorities across 90 days",
    draw: () => (
      <>
        <line x1={20} y1={114} x2={200} y2={114} stroke={C.line} strokeWidth={2} />
        {([["30", 28, C.plum], ["60", 54, C.crimson], ["90", 80, C.cyan]] as const).map(([day, w, fill], i) => (
          <g key={day}><rect x={24} y={18 + i * 30} width={w * 2} height={18} fill={fill} /><text x={30 + w * 2} y={32 + i * 30} fontSize={12} fontWeight={700} fill={C.soft} fontFamily={FONT}>day {day}</text></g>
        ))}
      </>
    ),
  },
  funding: {
    label: "A document pack with the lender's checklist ticked",
    draw: () => (
      <>
        <rect x={62} y={22} width={92} height={100} fill={C.sunken} />
        <rect x={52} y={14} width={92} height={100} fill={C.raised} stroke={C.line} strokeWidth={2} />
        {[0, 1, 2, 3].map(i => <g key={i}>{tick(64, 36 + i * 20)}<line x1={84} y1={36 + i * 20} x2={130} y2={36 + i * 20} stroke={C.muted} strokeWidth={4} /></g>)}
      </>
    ),
  },
  hiring: {
    label: "An interview scorecard",
    draw: () => (
      <>
        <rect x={50} y={12} width={120} height={108} fill={C.raised} stroke={C.line} strokeWidth={2} />
        {[4, 5, 3, 4].map((score, i) => (
          <g key={i}><line x1={62} y1={34 + i * 22} x2={96} y2={34 + i * 22} stroke={C.muted} strokeWidth={4} />{[0, 1, 2, 3, 4].map(j => <rect key={j} x={104 + j * 12} y={28 + i * 22} width={9} height={12} fill={j < score ? C.brand : C.sunken} />)}</g>
        ))}
      </>
    ),
  },
  readiness: {
    label: "A readiness gauge at 64 per cent",
    draw: () => (
      <>
        <path d="M40 110 A70 70 0 0 1 180 110" fill="none" stroke={C.sunken} strokeWidth={16} />
        <path d="M40 110 A70 70 0 0 1 150 54" fill="none" stroke={C.brand} strokeWidth={16} />
        <text x={110} y={104} textAnchor="middle" fontSize={30} fontWeight={800} fill={C.ink} fontFamily={FONT}>64%</text>
      </>
    ),
  },
  review: {
    label: "Two weeks with two Sessions",
    draw: () => (
      <>
        <line x1={20} y1={70} x2={200} y2={70} stroke={C.line} strokeWidth={3} />
        {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={28 + i * 18.5} cy={70} r={3.5} fill={C.muted} />)}
        <circle cx={65} cy={70} r={13} fill={C.plum} />
        <circle cx={176} cy={70} r={13} fill={C.crimson} />
        <text x={65} y={104} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.soft} fontFamily={FONT}>Session 1</text>
        <text x={176} y={104} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.soft} fontFamily={FONT}>Session 2</text>
      </>
    ),
  },
  fix: {
    label: "One number rising over six weekly check-ins",
    draw: () => (
      <>
        <line x1={20} y1={112} x2={200} y2={112} stroke={C.line} strokeWidth={2} />
        {[30, 38, 44, 58, 70, 86].map((h, i) => <rect key={i} x={28 + i * 29} y={112 - h} width={20} height={h} fill={i === 5 ? C.crimson : C.brand} />)}
      </>
    ),
  },
  monthly: {
    label: "A month's calendar with the 10th marked",
    draw: () => (
      <>
        <rect x={44} y={14} width={132} height={106} fill={C.raised} stroke={C.line} strokeWidth={2} />
        <rect x={44} y={14} width={132} height={20} fill={C.brand} />
        {Array.from({ length: 28 }, (_, i) => {
          const x = 54 + (i % 7) * 17;
          const y = 48 + Math.floor(i / 7) * 18;
          return i === 9 ? <rect key={i} x={x - 5} y={y - 9} width={16} height={16} fill={C.crimson} /> : <rect key={i} x={x} y={y - 4} width={6} height={6} fill={C.sunken} />;
        })}
      </>
    ),
  },
  adviser: {
    label: "Three monthly Sessions, each with agreed actions",
    draw: () => (
      <>
        {[0, 1, 2].map(i => (
          <g key={i}><rect x={30 + i * 56} y={30} width={46} height={70} fill={i === 2 ? C.brand : C.raised} stroke={C.line} strokeWidth={2} />{[0, 1, 2].map(j => <line key={j} x1={38 + i * 56} y1={50 + j * 14} x2={68 + i * 56 - j * 6} y2={50 + j * 14} stroke={i === 2 ? C.raised : C.muted} strokeWidth={4} />)}</g>
        ))}
      </>
    ),
  },
};

export function ProductArt({ kind, className = "h-36 w-auto" }: { kind: ArtKind; className?: string }) {
  const art = DRAWINGS[kind];
  return (
    <svg viewBox="0 0 220 130" role="img" aria-label={art.label} className={className}>
      {art.draw()}
    </svg>
  );
}
