import { DISC_STYLES, READINESS_LABELS, type CheckResult } from "../businessCheck/engine";
import { AREA_NAMES, type Health } from "../businessCheck/questions";
import type { Benchmark, FullReport, ReportBlock, ReportHealth, ReportSection } from "./build";

/**
 * What the client room's Founder and Business tabs show, taken from the owner's Full Report when there is one (the
 * same deterministic report they were sent), otherwise from their Business Check. Nothing here is written afresh, so
 * the room never says something the report does not.
 */

type Reading = Extract<ReportBlock, { kind: "reading" }>;

export type InsightArea = {
  area: string;
  health: ReportHealth;
  finding: string;
  /** The report's reading of the area: what the answers show, what it means and the numbered Recommendation. */
  reading: Reading | null;
  benchmarks: Benchmark[];
};

export type RoomInsight = {
  source: "Full Report" | "Business Check";
  founder: {
    readiness: { label: string; health: ReportHealth };
    /** Sections One and Two of the report, as the report lays them out. Empty without a report. */
    sections: ReportSection[];
    /** Without a report: the behaviour reading from the check. */
    profile: { label: string; value: string }[];
    question: FullReport["background"]["question"] | null;
  };
  areas: InsightArea[];
};

/** Founder readiness and strategic intent belong to the Founder tab; every other area is the business. */
const FOUNDER_AREAS = new Set([AREA_NAMES[0], AREA_NAMES[1], "Your idea"]);

/** Which area each benchmark bar belongs to. */
const BENCHMARK_AREA: Record<string, string> = {
  "Gross margin": AREA_NAMES[4],
  "Enquiries that buy": AREA_NAMES[5],
  "Cash cover": AREA_NAMES[7],
  "Left after costs": AREA_NAMES[7],
  "Owed to you": AREA_NAMES[7],
};

function readingsOf(report: FullReport) {
  const readings = new Map<string, Reading>();
  for (const section of report.sections) for (const block of section.blocks) if (block.kind === "reading" && !readings.has(block.area)) readings.set(block.area, block);
  return readings;
}

export function roomInsight(input: { report: FullReport | null; result: CheckResult | null }): RoomInsight | null {
  const { report, result } = input;
  if (report) {
    const readings = readingsOf(report);
    const founderRow = report.onePage.scorecard.find((row) => row.area === AREA_NAMES[0]);
    return {
      source: "Full Report",
      founder: {
        readiness: { label: founderRow?.finding ?? report.sections[0].standfirst, health: report.sections[0].health ?? "not_assessed" },
        sections: report.sections.filter((section) => section.number <= 2),
        profile: [],
        question: report.background.question ?? null,
      },
      areas: report.onePage.scorecard.filter((row) => !FOUNDER_AREAS.has(row.area)).map((row) => ({
        area: row.area,
        health: row.health,
        finding: row.finding,
        reading: readings.get(row.area) ?? null,
        benchmarks: report.onePage.benchmarks.filter((item) => BENCHMARK_AREA[item.label] === row.area),
      })),
    };
  }
  if (!result) return null;
  const style = result.founder.instinct ? DISC_STYLES[result.founder.instinct] : undefined;
  const seen = result.founder.seen ? DISC_STYLES[result.founder.seen] : undefined;
  const founderHealth: Health | undefined = result.outline.find((row) => row.area === 0)?.health;
  return {
    source: "Business Check",
    founder: {
      readiness: { label: READINESS_LABELS[result.founder.level], health: founderHealth ?? "not_assessed" },
      sections: [],
      profile: [
        ...(style ? [{ label: "Under pressure", value: `${style.name}. ${style.strength}` }, { label: "Watch for", value: style.watch }] : []),
        ...(seen ? [{ label: "Others see you as", value: seen.name }] : []),
      ],
      question: null,
    },
    areas: result.outline.filter((row) => !FOUNDER_AREAS.has(row.name) && row.area > 1).map((row) => ({
      area: row.name,
      health: row.health,
      finding: row.answer ? `“${row.answer}”` : "From your Business Check answers.",
      reading: null,
      benchmarks: [],
    })),
  };
}
