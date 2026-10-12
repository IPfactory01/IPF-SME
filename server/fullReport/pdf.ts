import PDFDocument from "pdfkit";
import { BRAND } from "../../shared/brand";
import type { Benchmark, FullReport, PlanMove, ReportBlock, ReportHealth, ScoreRow } from "../../shared/fullReport/build";
import { PLAYFAIR_DISPLAY_700, PLUS_JAKARTA_SANS_400, PLUS_JAKARTA_SANS_600, PLUS_JAKARTA_SANS_700 } from "./fonts";
import { PRINT_LOGO_PNG_BASE64, PRINT_LOGO_SIZE } from "./logo";

/**
 * Lays the full report out as an A4 PDF in the IP Factory brand: the logo, the site's fonts and only BRAND.palette
 * colours. It adds no words of its own beyond labels: everything the owner reads comes from buildFullReport.
 */

const C = BRAND.palette;
const PAGE = { width: 595.28, height: 841.89 };
const M = { top: 64, bottom: 70, left: 56, right: 56 };
const W = PAGE.width - M.left - M.right;

const SANS = "Sans";
const SANS_600 = "Sans-600";
const SANS_700 = "Sans-700";
const DISPLAY = "Display";

const HEALTH: Record<ReportHealth, { label: string; fg: string; bg: string }> = {
  clear: { label: "Clear", fg: C["health-clear"], bg: C["health-clear-tint"] },
  watch: { label: "Watch", fg: C["health-watch"], bg: C["health-watch-tint"] },
  stuck: { label: "Stuck", fg: C["health-stuck"], bg: C["health-stuck-tint"] },
  not_assessed: { label: "Not assessed", fg: C["ink-muted"], bg: C["brand-tint-softer"] },
};

type Doc = PDFKit.PDFDocument;

/** Playfair Display has no naira sign, so a heading with an amount is set in Plus Jakarta Sans. */
const displayFont = (text: string) => (text.includes("₦") ? SANS_700 : DISPLAY);

function ensure(doc: Doc, height: number) {
  if (doc.y + height > PAGE.height - M.bottom) doc.addPage();
}

function eyebrow(doc: Doc, text: string, color: string = C["highlight-ink"]) {
  doc.font(SANS_700).fontSize(7.5).fillColor(color).text(text.toUpperCase(), M.left, doc.y, { width: W, characterSpacing: 1.3 });
  doc.moveDown(0.5);
}

function chip(doc: Doc, health: ReportHealth, x: number, y: number) {
  const style = HEALTH[health];
  doc.font(SANS_700).fontSize(7.5);
  const width = doc.widthOfString(style.label.toUpperCase(), { characterSpacing: 0.8 }) + 12;
  doc.rect(x, y, width, 14).fill(style.bg);
  doc.fillColor(style.fg).text(style.label.toUpperCase(), x + 6, y + 3.6, { characterSpacing: 0.8, lineBreak: false });
  return width;
}

function paragraph(doc: Doc, text: string, options: { size?: number; color?: string; font?: string; x?: number; width?: number } = {}) {
  doc.font(options.font ?? SANS).fontSize(options.size ?? 10).fillColor(options.color ?? C["ink-soft"])
    .text(text, options.x ?? M.left, doc.y, { width: options.width ?? W, lineGap: 3 });
  doc.moveDown(0.6);
}

function subhead(doc: Doc, text: string) {
  ensure(doc, 30);
  doc.moveDown(0.2);
  doc.font(SANS_700).fontSize(7.5).fillColor(C.brand).text(text.toUpperCase(), M.left, doc.y, { width: W, characterSpacing: 1.1 });
  doc.moveDown(0.35);
}

function bullets(doc: Doc, items: string[]) {
  for (const item of items) {
    doc.font(SANS).fontSize(9.5);
    const height = doc.heightOfString(item, { width: W - 14, lineGap: 2.5 });
    ensure(doc, height + 4);
    const y = doc.y;
    doc.fillColor(C.highlight).font(SANS_700).text("•", M.left, y, { lineBreak: false });
    doc.fillColor(C.ink).font(SANS).fontSize(9.5).text(item, M.left + 14, y, { width: W - 14, lineGap: 2.5 });
    doc.moveDown(0.3);
  }
  doc.moveDown(0.3);
}

function facts(doc: Doc, rows: { label: string; value: string }[]) {
  const labelWidth = 138;
  const valueWidth = W - labelWidth - 10;
  for (const row of rows) {
    doc.font(SANS).fontSize(9.5);
    const valueHeight = doc.heightOfString(row.value, { width: valueWidth, lineGap: 2 });
    doc.font(SANS_600).fontSize(8.5);
    const labelHeight = doc.heightOfString(row.label, { width: labelWidth, lineGap: 2 });
    const height = Math.max(valueHeight, labelHeight) + 9;
    ensure(doc, height);
    const y = doc.y;
    doc.fillColor(C["brand-slate"]).font(SANS_600).fontSize(8.5).text(row.label, M.left, y + 4.5, { width: labelWidth, lineGap: 2 });
    doc.fillColor(C.ink).font(SANS).fontSize(9.5).text(row.value, M.left + labelWidth + 10, y + 4.5, { width: valueWidth, lineGap: 2 });
    doc.moveTo(M.left, y + height).lineTo(M.left + W, y + height).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.x = M.left;
    doc.y = y + height;
  }
  doc.moveDown(0.8);
}

function table(doc: Doc, block: Extract<ReportBlock, { kind: "table" }>) {
  const widths = (block.widths ?? block.columns.map(() => 1 / block.columns.length)).map((fraction) => fraction * W);
  const pad = 6;
  const header = () => {
    doc.font(SANS_700).fontSize(7);
    const height = Math.max(...block.columns.map((column, index) => doc.heightOfString(column.toUpperCase(), { width: widths[index] - pad * 2, characterSpacing: 0.8 }))) + pad * 2;
    const y = doc.y;
    doc.rect(M.left, y, W, height).fill(C["brand-tint-softer"]);
    let x = M.left;
    block.columns.forEach((column, index) => {
      doc.fillColor(C["ink-muted"]).font(SANS_700).fontSize(7).text(column.toUpperCase(), x + pad, y + pad, { width: widths[index] - pad * 2, characterSpacing: 0.8 });
      x += widths[index];
    });
    doc.y = y + height;
  };
  const rowHeight = (row: string[]) => Math.max(...row.map((cell, index) => {
    doc.font(index === 0 ? SANS_600 : SANS).fontSize(9);
    return doc.heightOfString(cell || " ", { width: widths[index] - pad * 2, lineGap: 2 });
  })) + pad * 2;
  // A short table is kept on one page; a long one breaks between rows and repeats its header.
  const total = 24 + block.rows.reduce((sum, row) => sum + rowHeight(row), 0);
  ensure(doc, total < 320 ? total : 60);
  header();
  for (const row of block.rows) {
    const height = rowHeight(row);
    if (doc.y + height > PAGE.height - M.bottom) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    let x = M.left;
    row.forEach((cell, index) => {
      const health = (["Clear", "Watch", "Stuck"] as const).find((word) => word === cell);
      if (health) chip(doc, health.toLowerCase() as ReportHealth, x + pad, y + pad - 1);
      else doc.fillColor(index === 0 ? C.ink : C["ink-soft"]).font(index === 0 ? SANS_600 : SANS).fontSize(9).text(cell, x + pad, y + pad, { width: widths[index] - pad * 2, lineGap: 2 });
      x += widths[index];
    });
    doc.moveTo(M.left, y + height).lineTo(M.left + W, y + height).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.x = M.left;
    doc.y = y + height;
  }
  doc.moveDown(1);
}

function metrics(doc: Doc, items: { label: string; value: string; note: string }[]) {
  const gap = 10;
  const width = (W - gap * (items.length - 1)) / items.length;
  const inner = width - 20;
  // Figures shrink to fit their tile on one line where they can; long words still wrap.
  const valueSize = (value: string) => {
    let size = 15;
    doc.font(SANS_700);
    while (size > 10 && doc.fontSize(size).widthOfString(value) > inner) size -= 0.5;
    return size;
  };
  const heightOf = (item: { label: string; value: string; note: string }) => {
    doc.font(SANS_700).fontSize(7);
    const label = doc.heightOfString(item.label.toUpperCase(), { width: inner, characterSpacing: 0.8 });
    doc.font(SANS_700).fontSize(valueSize(item.value));
    const value = doc.heightOfString(item.value, { width: inner });
    doc.font(SANS).fontSize(8);
    const note = doc.heightOfString(item.note, { width: inner, lineGap: 1.5 });
    return label + value + note + 30;
  };
  const height = Math.max(...items.map(heightOf));
  ensure(doc, height + 10);
  const y = doc.y;
  items.forEach((item, index) => {
    const x = M.left + index * (width + gap);
    doc.rect(x, y, width, height).lineWidth(0.6).strokeColor(C["brand-line"]).stroke();
    doc.rect(x, y, width, 2.5).fill(C.brand);
    doc.fillColor(C["ink-muted"]).font(SANS_700).fontSize(7).text(item.label.toUpperCase(), x + 10, y + 12, { width: inner, characterSpacing: 0.8 });
    doc.fillColor(C.ink).font(SANS_700).fontSize(valueSize(item.value)).text(item.value, x + 10, doc.y + 4, { width: inner });
    doc.fillColor(C["ink-muted"]).font(SANS).fontSize(8).text(item.note, x + 10, doc.y + 3, { width: inner, lineGap: 1.5 });
  });
  doc.x = M.left;
  doc.y = y + height + 14;
}

function box(doc: Doc, accent: string, draw: (measure: boolean) => number) {
  const height = draw(true) + 22;
  ensure(doc, height);
  const y = doc.y;
  doc.rect(M.left, y, W, height).fill(C["brand-tint-softer"]);
  doc.rect(M.left, y, 3, height).fill(accent);
  doc.y = y + 11;
  draw(false);
  doc.x = M.left;
  doc.y = y + height + 12;
}

function callout(doc: Doc, title: string, text: string, accent: string = C["highlight-ink"]) {
  const x = M.left + 16;
  const width = W - 30;
  box(doc, accent, (measure) => {
    doc.font(SANS_700).fontSize(10);
    const titleHeight = doc.heightOfString(title, { width });
    doc.font(SANS).fontSize(9.5);
    const textHeight = doc.heightOfString(text, { width, lineGap: 2.5 });
    if (!measure) {
      doc.fillColor(C.ink).font(SANS_700).fontSize(10).text(title, x, doc.y, { width });
      doc.fillColor(C["ink-soft"]).font(SANS).fontSize(9.5).text(text, x, doc.y + 4, { width, lineGap: 2.5 });
    }
    return titleHeight + textHeight + 4;
  });
}

function reading(doc: Doc, block: Extract<ReportBlock, { kind: "reading" }>) {
  ensure(doc, 90);
  const y = doc.y;
  doc.font(SANS_700).fontSize(11.5).fillColor(C.ink).text(block.area, M.left, y, { lineBreak: false });
  const nameWidth = doc.widthOfString(block.area);
  chip(doc, block.health, M.left + nameWidth + 10, y);
  doc.x = M.left;
  doc.y = y + 18;
  paragraph(doc, block.theirWords, { size: 9.5, color: C["ink-muted"] });
  subhead(doc, "What your answers show");
  bullets(doc, block.shows);
  subhead(doc, "What it means");
  for (const text of block.meaning) paragraph(doc, text);
  subhead(doc, "What good looks like");
  paragraph(doc, block.good);
  const x = M.left + 16;
  const width = W - 30;
  box(doc, C.highlight, (measure) => {
    const lines: [string, string, string][] = [["First move", block.move, SANS_600], ["This week", block.thisWeek, SANS], ["Number to watch", block.watch, SANS]];
    let total = 0;
    for (const [label, text, font] of lines) {
      doc.font(SANS_700).fontSize(7);
      const labelHeight = doc.heightOfString(label.toUpperCase(), { width, characterSpacing: 0.8 });
      doc.font(font).fontSize(9.5);
      const textHeight = doc.heightOfString(text, { width, lineGap: 2.5 });
      if (!measure) {
        doc.fillColor(C.brand).font(SANS_700).fontSize(7).text(label.toUpperCase(), x, doc.y, { width, characterSpacing: 0.8 });
        doc.fillColor(C.ink).font(font).fontSize(9.5).text(text, x, doc.y + 2, { width, lineGap: 2.5 });
        doc.y += 6;
      }
      total += labelHeight + textHeight + 8;
    }
    return total - 6;
  });
  doc.moveDown(0.4);
}

/** The heat map: a coloured cell per area, then the finding. */
function scorecard(doc: Doc, rows: ScoreRow[], compact = false) {
  const areaWidth = compact ? 118 : 132;
  const cellWidth = 66;
  const findingX = M.left + areaWidth + cellWidth + 10;
  const findingWidth = W - areaWidth - cellWidth - 10;
  const size = compact ? 8.5 : 9;
  const heightOf = (row: ScoreRow) => {
    doc.font(SANS).fontSize(size);
    const finding = doc.heightOfString(row.finding, { width: findingWidth - 6, lineGap: 1.5 });
    doc.font(SANS_600).fontSize(size);
    const area = doc.heightOfString(row.area, { width: areaWidth - 12 });
    return Math.max(finding, area, 12) + (compact ? 9 : 12);
  };
  ensure(doc, Math.min(rows.reduce((sum, row) => sum + heightOf(row) + 2, 0), 300));
  for (const row of rows) {
    const height = heightOf(row);
    ensure(doc, height + 2);
    const y = doc.y;
    const style = HEALTH[row.health];
    doc.rect(M.left, y, W, height).fill(C["brand-tint-softer"]);
    doc.rect(M.left, y, 3, height).fill(style.fg);
    doc.fillColor(C.ink).font(SANS_600).fontSize(size).text(row.area, M.left + 10, y + (compact ? 4.5 : 6), { width: areaWidth - 12 });
    doc.rect(M.left + areaWidth, y, cellWidth, height).fill(style.bg);
    doc.fillColor(style.fg).font(SANS_700).fontSize(7.5).text(style.label.toUpperCase(), M.left + areaWidth, y + height / 2 - 4, { width: cellWidth, align: "center", characterSpacing: 0.8, lineBreak: false });
    doc.fillColor(C["ink-soft"]).font(SANS).fontSize(size).text(row.finding, findingX, y + (compact ? 4.5 : 6), { width: findingWidth - 6, lineGap: 1.5 });
    doc.x = M.left;
    doc.y = y + height + 2;
  }
  doc.moveDown(0.8);
}

/** Numbered points: a filled number, a bold headline, a line of detail. */
function takeaways(doc: Doc, title: string, items: { headline: string; detail: string; health?: ReportHealth }[]) {
  subhead(doc, title);
  const x = M.left + 30;
  const width = W - 30;
  items.forEach((item, index) => {
    doc.font(SANS_700).fontSize(10.5);
    const headline = doc.heightOfString(item.headline, { width });
    doc.font(SANS).fontSize(9.5);
    const detail = doc.heightOfString(item.detail, { width, lineGap: 2 });
    ensure(doc, headline + detail + 12);
    const y = doc.y;
    doc.circle(M.left + 10, y + 8, 10).fill(C.brand);
    doc.fillColor(C["paper-raised"]).font(SANS_700).fontSize(10).text(String(index + 1), M.left, y + 3, { width: 20, align: "center", lineBreak: false });
    doc.fillColor(C.ink).font(SANS_700).fontSize(10.5).text(item.headline, x, y, { width });
    if (item.health) {
      const after = doc.y;
      doc.font(SANS_700).fontSize(10.5);
      chip(doc, item.health, x + doc.widthOfString(item.headline) + 8, y - 0.5);
      doc.y = after;
    }
    doc.fillColor(C["ink-soft"]).font(SANS).fontSize(9.5).text(item.detail, x, doc.y + 2, { width, lineGap: 2 });
    doc.x = M.left;
    doc.y += 10;
  });
  doc.moveDown(0.3);
}

/** The "so what": implications in a box, each after an arrow. */
function soWhat(doc: Doc, title: string, items: string[]) {
  const x = M.left + 16;
  const width = W - 30;
  box(doc, C["highlight-ink"], (measure) => {
    doc.font(SANS_700).fontSize(7.5);
    let total = doc.heightOfString(title.toUpperCase(), { width, characterSpacing: 1.1 }) + 6;
    if (!measure) {
      doc.fillColor(C["highlight-ink"]).font(SANS_700).fontSize(7.5).text(title.toUpperCase(), x, doc.y, { width, characterSpacing: 1.1 });
      doc.y += 6;
    }
    for (const item of items) {
      doc.font(SANS_600).fontSize(9.5);
      const height = doc.heightOfString(item, { width: width - 16, lineGap: 2 });
      if (!measure) {
        const y = doc.y;
        doc.polygon([x, y + 3], [x + 7, y + 6.5], [x, y + 10]).fill(C["highlight-ink"]);
        doc.fillColor(C.ink).font(SANS_600).fontSize(9.5).text(item, x + 16, y, { width: width - 16, lineGap: 2 });
        doc.y += 6;
      }
      total += height + 6;
    }
    return total - 6;
  });
}

/** Bullet bars: coloured zones, a marker at the owner's number, the number itself and what good looks like. */
function benchmarks(doc: Doc, items: Benchmark[], title?: string) {
  const labelWidth = 112;
  const valueWidth = 116;
  const barX = M.left + labelWidth;
  const barWidth = W - labelWidth - valueWidth - 12;
  const rowHeight = 38;
  // The title moves with the chart, so it is never left alone at the foot of a page.
  ensure(doc, rowHeight * items.length + (title ? 34 : 10));
  if (title) subhead(doc, title);
  for (const item of items) {
    const y = doc.y;
    const scale = (value: number) => barX + ((Math.min(Math.max(value, item.min), item.max) - item.min) / (item.max - item.min)) * barWidth;
    doc.fillColor(C.ink).font(SANS_600).fontSize(8.5).text(item.label, M.left, y + 3, { width: labelWidth - 8 });
    let from = item.min;
    for (const zone of item.zones) {
      doc.rect(scale(from), y + 2, scale(zone.to) - scale(from), 12).fill(HEALTH[zone.health].bg);
      from = zone.to;
    }
    const marker = scale(item.value);
    const style = HEALTH[item.health];
    doc.rect(marker - 1.5, y - 1, 3, 18).fill(style.fg);
    doc.fillColor(style.fg).font(SANS_700).fontSize(9).text(item.display, barX + barWidth + 12, y + 3, { width: valueWidth, lineBreak: false });
    doc.fillColor(C["ink-muted"]).font(SANS).fontSize(7.5).text(item.target, barX, y + 19, { width: barWidth, lineBreak: false });
    doc.x = M.left;
    doc.y = y + rowHeight;
  }
  doc.moveDown(0.4);
}

/** Money in, costs out, what is left: three bars on one naira scale, costs floating down from money in. */
function waterfall(doc: Doc, steps: { label: string; amount: number; display: string }[]) {
  const chartHeight = 130;
  ensure(doc, chartHeight + 50);
  const top = doc.y + 16;
  const [income, costs, left] = steps.map((step) => step.amount);
  const high = Math.max(income, 0);
  const low = Math.min(0, left);
  const y = (value: number) => top + ((high - value) / (high - low || 1)) * chartHeight;
  const columnWidth = W / 3;
  const barWidth = 64;
  const bars: [number, number, string][] = [[0, income, C.brand], [income, income + costs, C["brand-slate"]], [0, left, left < 0 ? C["health-stuck"] : C["health-clear"]]];
  bars.forEach(([from, to, color], index) => {
    const x = M.left + index * columnWidth + (columnWidth - barWidth) / 2;
    const y1 = Math.min(y(from), y(to));
    const height = Math.max(Math.abs(y(from) - y(to)), 1.5);
    doc.rect(x, y1, barWidth, height).fill(color);
    if (index < 2) doc.moveTo(x + barWidth, y(to)).lineTo(x + columnWidth, y(to)).lineWidth(0.6).dash(2, { space: 2 }).strokeColor(C["ink-muted"]).stroke().undash();
    doc.fillColor(color).font(SANS_700).fontSize(9).text(steps[index].display, x - 30, y1 - 13, { width: barWidth + 60, align: "center", lineBreak: false });
    doc.fillColor(C["ink-muted"]).font(SANS_600).fontSize(8).text(steps[index].label, x - 30, top + chartHeight + 8, { width: barWidth + 60, align: "center", lineBreak: false });
  });
  doc.moveTo(M.left, y(0)).lineTo(M.left + W, y(0)).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.x = M.left;
  doc.y = top + chartHeight + 30;
}

/** Likelihood across, impact up: tinted by how much the two together matter, each risk a numbered dot. */
function riskMatrix(doc: Doc, risks: { number: number; likelihood: number; impact: number }[]) {
  const cellWidth = 92;
  const cellHeight = 38;
  const gridX = M.left + (W - cellWidth * 3) / 2 + 30;
  ensure(doc, cellHeight * 3 + 62);
  const top = doc.y + 14;
  const levels = ["Low", "Medium", "High"];
  for (let impact = 3; impact >= 1; impact -= 1) {
    for (let likelihood = 1; likelihood <= 3; likelihood += 1) {
      const score = impact * likelihood;
      const health: ReportHealth = score >= 6 ? "stuck" : score >= 3 ? "watch" : "clear";
      const x = gridX + (likelihood - 1) * cellWidth;
      const cellY = top + (3 - impact) * cellHeight;
      doc.rect(x, cellY, cellWidth - 2, cellHeight - 2).fill(HEALTH[health].bg);
      const here = risks.filter((risk) => risk.likelihood === likelihood && risk.impact === impact);
      here.forEach((risk, index) => {
        const cx = x + (cellWidth - 2) / 2 + (index - (here.length - 1) / 2) * 22;
        doc.circle(cx, cellY + (cellHeight - 2) / 2, 9).fill(C.brand);
        doc.fillColor(C["paper-raised"]).font(SANS_700).fontSize(8.5).text(String(risk.number), cx - 9, cellY + (cellHeight - 2) / 2 - 4.5, { width: 18, align: "center", lineBreak: false });
      });
    }
    doc.fillColor(C["ink-muted"]).font(SANS_600).fontSize(7.5).text(levels[impact - 1], gridX - 66, top + (3 - impact) * cellHeight + cellHeight / 2 - 5, { width: 58, align: "right", lineBreak: false });
  }
  levels.forEach((level, index) => doc.fillColor(C["ink-muted"]).font(SANS_600).fontSize(7.5).text(level, gridX + index * cellWidth, top + cellHeight * 3 + 3, { width: cellWidth - 2, align: "center", lineBreak: false }));
  doc.fillColor(C.brand).font(SANS_700).fontSize(7).text("LIKELIHOOD", gridX, top + cellHeight * 3 + 16, { width: cellWidth * 3, align: "center", characterSpacing: 1, lineBreak: false });
  doc.fillColor(C.brand).font(SANS_700).fontSize(7).text("IMPACT", gridX - 66, top - 12, { width: 58, align: "right", characterSpacing: 1, lineBreak: false });
  doc.x = M.left;
  doc.y = top + cellHeight * 3 + 36;
}

/** The 90-day plan as columns under arrow-shaped month headers. */
function timeline(doc: Doc, moves: PlanMove[], title?: string) {
  if (!moves.length) return;
  const gap = 6;
  const width = (W - gap * (moves.length - 1)) / moves.length;
  const inner = width - 16;
  const sections = (move: PlanMove): [string, string, string][] => [["Move", move.move, SANS_600], ["This week", move.thisWeek, SANS], ["Measure of Success", move.watch, SANS]];
  const heightOf = (move: PlanMove) => {
    doc.font(SANS_700).fontSize(10);
    let total = doc.heightOfString(move.area, { width: inner }) + 8;
    for (const [label, text, font] of sections(move)) {
      doc.font(SANS_700).fontSize(6.5);
      total += doc.heightOfString(label.toUpperCase(), { width: inner, characterSpacing: 0.8 }) + 2;
      doc.font(font).fontSize(8.5);
      total += doc.heightOfString(text, { width: inner, lineGap: 1.5 }) + 7;
    }
    return total + 8;
  };
  const height = Math.max(...moves.map(heightOf));
  ensure(doc, height + (title ? 54 : 30));
  if (title) subhead(doc, title);
  const top = doc.y;
  const shades = [C.brand, C["brand-slate"], C["brand-plum"]];
  moves.forEach((move, index) => {
    const x = M.left + index * (width + gap);
    const tip = 10;
    doc.polygon([x, top], [x + width - tip, top], [x + width, top + 11], [x + width - tip, top + 22], [x, top + 22], ...(index ? [[x + tip, top + 11]] as [number, number][] : [])).fill(shades[index % shades.length]);
    doc.fillColor(C["paper-raised"]).font(SANS_700).fontSize(8).text(move.month.toUpperCase(), x + (index ? tip + 6 : 8), top + 7, { width: width - tip * 2 - 8, characterSpacing: 1, lineBreak: false });
    doc.rect(x, top + 26, width, height).fill(C["brand-tint-softer"]);
    doc.fillColor(C.ink).font(SANS_700).fontSize(10).text(move.area, x + 8, top + 34, { width: inner });
    doc.y += 8;
    for (const [label, text, font] of sections(move)) {
      doc.fillColor(C.brand).font(SANS_700).fontSize(6.5).text(label.toUpperCase(), x + 8, doc.y, { width: inner, characterSpacing: 0.8 });
      doc.fillColor(C.ink).font(font).fontSize(8.5).text(text, x + 8, doc.y + 2, { width: inner, lineGap: 1.5 });
      doc.y += 7;
    }
  });
  doc.x = M.left;
  doc.y = top + 26 + height + 14;
}

function blocks(doc: Doc, items: ReportBlock[]) {
  for (const block of items) {
    switch (block.kind) {
      case "paragraph": ensure(doc, 40); paragraph(doc, block.text); break;
      case "heading": ensure(doc, 60); doc.moveDown(0.3); doc.font(SANS_700).fontSize(11.5).fillColor(C.ink).text(block.text, M.left, doc.y, { width: W }); doc.moveDown(0.5); break;
      case "facts": facts(doc, block.rows); break;
      case "bullets": bullets(doc, block.items); break;
      case "metrics": metrics(doc, block.items); break;
      case "table": table(doc, block); break;
      case "reading": reading(doc, block); break;
      case "callout": callout(doc, block.title, block.text); break;
      case "scorecard": scorecard(doc, block.rows); break;
      case "takeaways": takeaways(doc, block.title, block.items); break;
      case "benchmarks": benchmarks(doc, block.items, "Against what good looks like"); break;
      case "waterfall": waterfall(doc, block.steps); break;
      case "riskMatrix": riskMatrix(doc, block.risks); break;
      case "timeline": timeline(doc, block.moves); break;
    }
  }
}

function brandRule(doc: Doc, y: number, height = 4, x = 0, width = PAGE.width) {
  const gradient = doc.linearGradient(x, y, x + width, y);
  gradient.stop(0, C["brand-plum"]).stop(0.5, C["highlight-ink"]).stop(1, C.highlight);
  doc.rect(x, y, width, height).fill(gradient);
}

function partHeading(doc: Doc, eyebrowText: string, title: string, finding: string, health?: ReportHealth) {
  eyebrow(doc, eyebrowText);
  doc.font(SANS_700).fontSize(12).fillColor(C.brand).text(title, M.left, doc.y, { width: W });
  doc.moveDown(0.35);
  doc.font(displayFont(finding)).fontSize(19).fillColor(C.ink).text(finding, M.left, doc.y, { width: W, lineGap: 2 });
  doc.moveDown(0.5);
  if (health) {
    chip(doc, health, M.left, doc.y);
    doc.y += 22;
  }
  doc.moveTo(M.left, doc.y).lineTo(M.left + W, doc.y).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.moveDown(1);
}

function cover(doc: Doc, report: FullReport) {
  brandRule(doc, 0, 6);
  const logoWidth = 104;
  const logoHeight = (logoWidth * PRINT_LOGO_SIZE.height) / PRINT_LOGO_SIZE.width;
  doc.image(Buffer.from(PRINT_LOGO_PNG_BASE64, "base64"), M.left, 56, { width: logoWidth });
  doc.moveTo(M.left + logoWidth + 18, 62).lineTo(M.left + logoWidth + 18, 56 + logoHeight - 6).lineWidth(0.8).strokeColor(C.line).stroke();
  doc.font(SANS_700).fontSize(10).fillColor(C["ink-muted"]).text(BRAND.productName.toUpperCase(), M.left + logoWidth + 34, 56 + logoHeight / 2 - 6, { characterSpacing: 2.4, lineBreak: false });

  doc.x = M.left;
  doc.y = 250;
  eyebrow(doc, "Full business check report");
  doc.font(displayFont(report.businessName)).fontSize(34).fillColor(C.ink).text(report.businessName, M.left, doc.y, { width: W, lineGap: 2 });
  doc.moveDown(0.4);
  paragraph(doc, report.descriptor, { size: 13 });
  doc.moveDown(0.6);
  facts(doc, [
    { label: "Prepared for", value: report.ownerName },
    { label: "Date", value: report.date },
    { label: "Reference", value: report.reference },
  ]);

  doc.y = Math.max(doc.y + 10, 520);
  eyebrow(doc, "What is inside", C.brand);
  const entries: [string, string][] = [["", "Executive summary"], ...report.parts.map((part) => [String(part.number), part.title] as [string, string]), ["A", "Appendix: your answers"]];
  for (const [number, title] of entries) {
    const y = doc.y;
    doc.font(SANS_700).fontSize(9).fillColor(C["highlight-ink"]).text(number, M.left, y, { width: 20, lineBreak: false });
    doc.font(SANS).fontSize(9.5).fillColor(C.ink).text(title, M.left + 24, y, { width: W - 24 });
    doc.y = y + 15;
  }
}

function onePage(doc: Doc, report: FullReport) {
  const summary = report.onePage;
  doc.addPage();
  partHeading(doc, "Executive summary", "Where you stand", summary.position);
  takeaways(doc, "Key takeaways", summary.takeaways);
  soWhat(doc, "What this means for you", summary.implications);
  metrics(doc, summary.keyNumbers);

  doc.addPage();
  partHeading(doc, "Executive summary", "Scorecard and first moves", `Fix this first: ${summary.fixFirst.area.toLowerCase()}.`);
  scorecard(doc, summary.scorecard, true);
  if (summary.benchmarks.length) benchmarks(doc, summary.benchmarks, "Your numbers against what good looks like");
  timeline(doc, summary.moves, "Your 90-day plan");
  callout(doc, "The one number to watch", summary.watch, C.highlight);
}

function appendix(doc: Doc, report: FullReport) {
  doc.addPage();
  partHeading(doc, "Appendix", "Your answers", "Everything you told us, so you can check our reading.");
  for (const group of report.appendix) {
    doc.font(SANS_700).fontSize(11.5).fillColor(C.ink).text(group.title, M.left, doc.y, { width: W });
    doc.moveDown(0.5);
    table(doc, { kind: "table", columns: ["Question", "Your answer"], widths: [0.5, 0.5], rows: group.rows.map((row) => [row.question, row.answer]) });
  }
  ensure(doc, 80);
  callout(doc, "How this report was made", report.method, C.brand);
}

function footers(doc: Doc, report: FullReport) {
  const range = doc.bufferedPageRange();
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE.height - 40;
    doc.moveTo(M.left, y - 8).lineTo(M.left + W, y - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font(SANS).fontSize(7.5).fillColor(C["ink-muted"])
      .text(`${BRAND.productEndorsement} · Full business check report · ${report.businessName} · ${report.reference}`, M.left, y, { width: W - 60, lineBreak: false });
    doc.text(`${index + 1} / ${range.count}`, M.left + W - 60, y, { width: 60, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

/** Renders the report to a PDF. The document's dates come from the report, so nothing depends on when it is drawn. */
export function renderFullReportPdf(report: FullReport, generatedAt: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: M,
      bufferPages: true,
      info: {
        Title: `${report.businessName}: full business check report`,
        Author: BRAND.organisationName,
        Subject: BRAND.productEndorsement,
        Creator: BRAND.productEndorsement,
        CreationDate: generatedAt,
        ModDate: generatedAt,
      },
    });
    doc.registerFont(SANS, Buffer.from(PLUS_JAKARTA_SANS_400, "base64"));
    doc.registerFont(SANS_600, Buffer.from(PLUS_JAKARTA_SANS_600, "base64"));
    doc.registerFont(SANS_700, Buffer.from(PLUS_JAKARTA_SANS_700, "base64"));
    doc.registerFont(DISPLAY, Buffer.from(PLAYFAIR_DISPLAY_700, "base64"));
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    cover(doc, report);
    onePage(doc, report);
    for (const part of report.parts) {
      doc.addPage();
      partHeading(doc, `Part ${part.number} · ${part.method}`, part.title, part.finding, part.health);
      blocks(doc, part.blocks);
    }
    appendix(doc, report);
    footers(doc, report);
    doc.end();
  });
}
