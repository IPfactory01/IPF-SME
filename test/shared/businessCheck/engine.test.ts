import { describe, expect, it } from "vitest";
import { OFFERING_IDS } from "@shared/businessCheck/catalogue";
import {
  areasNotAssessed,
  cleanAnswers,
  evaluate,
  exampleFor,
  exampleHeading,
  businessDetails,
  founderRead,
  isComplete,
  optionsFor,
  promptFor,
  nextStep,
  questionPath,
  sectionPath,
} from "@shared/businessCheck/engine";
import { SECTIONS, type Answers } from "@shared/businessCheck/questions";
import { SECTOR_EXAMPLES, SECTOR_IDS } from "@shared/businessCheck/sectorExamples";

const founderAnswers: Answers = {
  f_instinct: "S",
  f_seen: "S",
  f_team: "solo",
  f_tough: "me_avoid",
  f_education: "short",
  f_finance: ["cash"],
  f_hours: "2to4",
};

const operating = (age: string, extra: Answers = {}): Answers => ({
  p_stage: "operating",
  p_type: "maker",
  p_sector: "food and drink",
  p_age: age,
  p_staff: "6to10",
  p_revenue: "3to5m",
  p_trend: "flat",
  ...founderAnswers,
  ...extra,
});

/** Answers every remaining question with its first option, to walk a whole path. */
function completeWith(answers: Answers, pickIndex = 0): Answers {
  const filled = { ...answers };
  for (let guard = 0; guard < 100; guard++) {
    const step = nextStep(filled);
    if (!step) return filled;
    // Typed answers (the business's name and description) are required: give fictional ones.
    if (step.question.kind === "text") {
      filled[step.question.id] = step.question.id === "p_name" ? "Example Business" : "A fictional business used to test the business check";
      continue;
    }
    const options = step.question.options;
    const option = options[Math.min(pickIndex, options.length - 1)];
    filled[step.question.id] = step.question.kind === "multi" ? [option.value] : option.value;
  }
  throw new Error("path did not finish");
}

describe("business check path", () => {
  it("starts with the business profile and asks the stage first", () => {
    expect(sectionPath({})).toEqual(["profile"]);
    expect(nextStep({})?.question.id).toBe("p_stage");
  });

  it("keeps idea-stage founders away from offering, sales and operations questions", () => {
    const answers: Answers = { p_stage: "idea", p_type: "expert", p_sector: "services" };
    expect(sectionPath(answers)).toEqual(["profile", "founder", "idea"]);
    const ids = questionPath(answers).map((step) => step.question.id);
    expect(ids).not.toContain("p_revenue");
    expect(ids).not.toContain("s3_status");
    expect(ids).not.toContain("s5_status");
    expect(ids).toContain("i_customer");
  });

  it("asks a business that trades how long it has traded", () => {
    const ids = questionPath({ p_stage: "operating" }).map((step) => step.question.id);
    expect(ids).toContain("p_age");
  });

  it("chooses problem areas by stage", () => {
    expect(sectionPath(operating("under2")).slice(2)).toEqual(["intent", "market", "offer", "model", "sales", "operations", "finance", "risk"]);
    expect(sectionPath(operating("5to10")).slice(2)).toContain("exit");
    expect(sectionPath(operating("2to5")).slice(2)).not.toContain("exit");
    const mature = sectionPath(operating("over10")).slice(2);
    expect(mature[0]).toBe("model");
    expect(mature).toEqual(expect.arrayContaining(["exit", "transition"]));
  });

  it("asks a side business about operations only once there are staff", () => {
    const side = { p_stage: "side", p_type: "trader", p_age: "under2", p_revenue: "1to3m", p_trend: "growing" };
    expect(sectionPath({ ...side, p_staff: "1to2" })).not.toContain("operations");
    expect(sectionPath({ ...side, p_staff: "3to5" })).toContain("operations");
  });

  it("sends large businesses straight to a conversation and stops very small ones after founder readiness", () => {
    expect(sectionPath(operating("over10", { p_revenue: "over25m" }))).toEqual(["profile"]);
    expect(sectionPath(operating("2to5", { p_staff: "over50" }))).toEqual(["profile"]);
    expect(sectionPath(operating("under2", { p_staff: "0", p_revenue: "under1m" }))).toEqual(["profile", "founder"]);
  });

  it("opens follow-ups only when an area is not clear", () => {
    const base = operating("2to5");
    const clearIds = questionPath({ ...base, s1_status: "clear" }).map((step) => step.question.id);
    expect(clearIds).not.toContain("s1_detail");
    const stuckIds = questionPath({ ...base, s1_status: "busy" }).map((step) => step.question.id);
    expect(stuckIds).toContain("s1_detail");
  });

  it("limits follow-ups for very young businesses to offer, sales and financials", () => {
    const answers = operating("under2", { s1_status: "busy", s3_status: "too_many", s7_status: "tight_guess" });
    const ids = questionPath(answers).map((step) => step.question.id);
    expect(ids).not.toContain("s1_detail");
    expect(ids).toContain("s3_detail");
    expect(ids).toContain("s7_detail");
  });

  it("asks who makes the hard call only when the founder works alone or with family", () => {
    const ids = (team: string) => questionPath({ p_stage: "idea", f_team: team }).map((step) => step.question.id);
    expect(ids("solo")).toContain("f_tough");
    expect(ids("cofounder")).not.toContain("f_tough");
  });

  it("finishes every branch", () => {
    for (const start of [{ p_stage: "idea" }, { p_stage: "side" }, { p_stage: "operating" }]) {
      for (const pick of [0, 1, 2, 3]) {
        expect(isComplete(completeWith(start, pick))).toBe(true);
      }
    }
  });

  it("drops answers left over from a branch the owner backed out of", () => {
    const answers = { ...operating("2to5", { s1_status: "busy", s1_detail: "no_goals" }), p_stage: "idea", i_customer: "named", s3_status: "rubbish" };
    const clean = cleanAnswers(answers);
    expect(clean.s1_status).toBeUndefined();
    expect(clean.p_revenue).toBeUndefined();
    expect(clean.i_customer).toBe("named");
  });

  it("keeps an exclusive choice on its own", () => {
    const clean = cleanAnswers({ p_stage: "idea", ...founderAnswers, f_finance: ["pl", "none"] });
    expect(clean.f_finance).toEqual(["none"]);
  });
});

describe("stage first", () => {
  it("asks the stage first, with full-time owners listed first, then years trading for anyone who trades", () => {
    const stage = nextStep({})!.question;
    expect(stage.id).toBe("p_stage");
    expect(stage.options.map((option) => option.value)).toEqual(["operating", "side", "idea"]);
    // The business's name comes straight after the stage (required), then years trading for anyone who trades.
    expect(nextStep({ p_stage: "operating" })?.question.id).toBe("p_name");
    expect(nextStep({ p_stage: "operating", p_name: "Ada Foods" })?.question.id).toBe("p_age");
    expect(nextStep({ p_stage: "side", p_name: "Ada Foods" })?.question.id).toBe("p_age");
    expect(nextStep({ p_stage: "idea", p_name: "Zobo Express" })?.question.id).toBe("p_type");
  });

  it("words questions for the owner's stage", () => {
    const type = SECTIONS.profile.questions.find((question) => question.id === "p_type")!;
    const hours = SECTIONS.founder.questions.find((question) => question.id === "f_hours")!;
    expect(promptFor(type, { p_stage: "operating" })).toBe("How does the business make money?");
    expect(promptFor(type, { p_stage: "side" })).toBe("How does the business make money?");
    expect(promptFor(type, { p_stage: "idea" })).toBe("How will the business make money?");
    expect(promptFor(hours, { p_stage: "side" })).toMatch(/^Alongside your job/);
    expect(exampleFor(SECTIONS.founder, { p_stage: "side", p_type: "maker" })).toMatch(/evenings and weekends/);
  });

  it("offers the go-full-time choice only to side businesses", () => {
    const intent = SECTIONS.intent.questions[0];
    expect(optionsFor(intent, { p_stage: "side" }).map((option) => option.value)).toContain("go_fulltime");
    expect(optionsFor(intent, { p_stage: "operating" }).map((option) => option.value)).not.toContain("go_fulltime");
    expect(cleanAnswers({ ...operating("2to5"), s1_status: "go_fulltime" }).s1_status).toBeUndefined();
  });

  it("points a business over ten years old that is flat or declining at the business model first", () => {
    const stuck = { s4_status: "no_money", s7_status: "tight_guess" };
    const flat = evaluate(completeWith(operating("over10", { p_trend: "flat", ...stuck })));
    expect(flat.primaryArea?.area).toBe(4);
    expect(flat.summary.think).toMatch(/ten years/);
    const growing = evaluate(completeWith(operating("over10", { p_trend: "growing", ...stuck })));
    expect(growing.primaryArea?.area).toBe(7);
  });
});

describe("section copy", () => {
  it("defines every section and gives an example for every kind of business", () => {
    for (const section of Object.values(SECTIONS)) {
      expect(section.means.length).toBeGreaterThan(20);
      if (section.id === "profile") continue;
      for (const type of ["maker", "trader", "expert", "mixed"]) {
        expect(exampleFor(section, { p_stage: "operating", p_type: type })).toBeTruthy();
      }
    }
  });

  it("matches the example to the business described", () => {
    expect(exampleFor(SECTIONS.model, { p_stage: "operating", p_type: "maker" })).toMatch(/bakery/i);
    expect(exampleFor(SECTIONS.model, { p_stage: "operating", p_type: "expert" })).toMatch(/studio/i);
    expect(exampleFor(SECTIONS.founder, { p_stage: "idea", p_type: "maker" })).toMatch(/job/i);
  });

  it("only points to offerings in the business plan", () => {
    for (const section of Object.values(SECTIONS)) {
      for (const question of section.questions) {
        for (const option of [...question.options, ...(question.ideaOptions ?? [])]) {
          for (const id of option.offerings ?? []) expect(OFFERING_IDS).toContain(id);
        }
      }
    }
  });
});

describe("sector examples", () => {
  it("words Services for any service business, so an adviser is not shown a salon", () => {
    const adviser = { p_stage: "operating", p_type: "expert", p_sector: "services" } as const;
    expect(exampleHeading(SECTIONS.founder, adviser)).toBe("For a service business like yours");
    expect(exampleFor(SECTIONS.founder, adviser)).toMatch(/adviser/);
    for (const section of Object.values(SECTIONS).filter((item) => item.id !== "profile")) {
      expect(exampleFor(section, adviser), section.id).not.toMatch(/salon|hairstylist|stylist/i);
    }
  });

  it("lists the twelve sectors the check has always offered", () => {
    const sector = SECTIONS.profile.questions.find((question) => question.id === "p_sector")!;
    expect(sector.options.map((option) => option.label)).toEqual(["Fashion", "Food and drink", "Retail", "Services", "Technology", "Real estate", "Health", "Education", "Manufacturing", "Agriculture", "Logistics", "Other"]);
    expect(sector.options.map((option) => option.value)).toEqual(["fashion", "food and drink", "retail", "services", "technology", "real estate", "health", "education", "manufacturing", "agriculture", "logistics", "other"]);
  });

  it("asks the sector again when a check in progress holds one no longer offered", () => {
    const inProgress = { p_stage: "operating", p_name: "Example Advisory", p_age: "2to5", p_type: "expert", p_sector: "professional services" };
    expect(cleanAnswers(inProgress)).not.toHaveProperty("p_sector");
    expect(nextStep(cleanAnswers(inProgress))?.question.id).toBe("p_sector");
    expect(exampleHeading(SECTIONS.founder, inProgress)).toBe("For a business like yours");
  });
});

describe("typed answers: the business's name and what it does", () => {
  const nameQuestion = SECTIONS.profile.questions.find((question) => question.id === "p_name")!;

  it("asks for the name and a one-line description inside the check, worded for the stage", () => {
    const ids = questionPath({ p_stage: "operating" }).map((step) => step.question.id);
    expect(ids.slice(0, 2)).toEqual(["p_stage", "p_name"]);
    expect(ids.indexOf("p_description")).toBe(ids.indexOf("p_sector") + 1);
    expect(promptFor(nameQuestion, { p_stage: "operating" })).toBe("What is the business called?");
    expect(promptFor(nameQuestion, { p_stage: "idea" })).toBe("What will the business be called?");
  });

  it("requires both: a blank or missing name or description is asked again, and the check is not complete without them", () => {
    const answered = completeWith(operating("2to5"));
    expect(isComplete(answered)).toBe(true);
    for (const id of ["p_name", "p_description"] as const) {
      const question = SECTIONS.profile.questions.find((item) => item.id === id)!;
      expect(question.optional, id).toBeFalsy();
      for (const blank of [undefined, "", "   "]) {
        const missing = { ...answered, [id]: blank };
        expect(isComplete(missing), `${id}=${JSON.stringify(blank)}`).toBe(false);
        expect(nextStep(missing)?.question.id).toBe(id);
      }
    }
  });

  it("tidies typed text and keeps it within its limit", () => {
    const clean = cleanAnswers({ p_stage: "operating", p_name: "  Ada   Foods  ", p_description: "x".repeat(400) });
    expect(clean.p_name).toBe("Ada Foods");
    expect((clean.p_description as string).length).toBe(300);
    expect(businessDetails(clean)).toEqual({ businessName: "Ada Foods", description: "x".repeat(300) });
    expect(cleanAnswers({ p_stage: "operating", p_name: ["not", "text"] }).p_name).toBeUndefined();
  });

  it("does not change the result: the outline and recommendations ignore the typed answers", () => {
    const base = completeWith(operating("2to5"));
    const named = { ...base, p_name: "Ada Foods", p_description: "We make and supply snacks in Lagos" };
    const { summary: _a, ...withoutName } = evaluate(base);
    const { summary: _b, ...withName } = evaluate(named);
    expect(withName).toEqual(withoutName);
  });
});

describe("examples for the owner's sector", () => {
  it("has an example for every area in every sector the owner can pick", () => {
    const sectorOptions = SECTIONS.profile.questions.find((question) => question.id === "p_sector")!.options.map((option) => option.value);
    expect([...SECTOR_IDS, "other"].sort()).toEqual([...sectorOptions].sort());
    for (const [area, bySector] of Object.entries(SECTOR_EXAMPLES)) {
      for (const sector of SECTOR_IDS) expect(bySector[sector], `${area} / ${sector}`).toMatch(/\w{4,}.*\.|"$/);
      expect(new Set(Object.values(bySector)).size).toBe(SECTOR_IDS.length);
    }
  });

  it("shows the owner's sector, and names it in the heading", () => {
    const fashion = { p_stage: "operating", p_type: "maker", p_sector: "fashion" };
    expect(exampleFor(SECTIONS.offer, fashion)).toMatch(/agbada/);
    expect(exampleHeading(SECTIONS.offer, fashion)).toBe("For a fashion business like yours");
    const food = { ...fashion, p_sector: "food and drink" };
    expect(exampleFor(SECTIONS.risk, food)).toMatch(/NAFDAC/);
    expect(exampleHeading(SECTIONS.sales, { ...fashion, p_sector: "services" })).toBe("For a service business like yours");
    expect(exampleFor(SECTIONS.founder, { ...fashion, p_stage: "side" })).toMatch(/designer/);
  });

  it("words the idea area for a business that hasn't started", () => {
    const idea = { p_stage: "idea", p_type: "maker", p_sector: "agriculture" };
    expect(exampleFor(SECTIONS.idea, idea)).toMatch(/^A planned/);
    expect(exampleHeading(SECTIONS.idea, idea)).toBe("For a farming idea like yours");
    expect(exampleFor(SECTIONS.founder, idea)).toMatch(/job/);
  });

  it("falls back to the kind of business when the sector is Other", () => {
    const other = { p_stage: "operating", p_type: "trader", p_sector: "other" };
    expect(exampleFor(SECTIONS.offer, other)).toBe(SECTIONS.offer.examples.trader);
    expect(exampleHeading(SECTIONS.offer, other)).toBe("For a business like yours");
  });
});

describe("founder readiness", () => {
  it("scores capacity, competence and exposure", () => {
    expect(founderRead(founderAnswers)).toMatchObject({ competence: 1, exposure: 1, capacity: 1, level: "intermediate" });
    expect(founderRead({ ...founderAnswers, f_finance: ["pl", "cash", "unit", "margin"], f_education: "corporate", f_hours: "5plus" }).level).toBe("advanced");
    expect(founderRead({ ...founderAnswers, f_finance: ["none"], f_education: "none", f_hours: "lt2", f_tough: "nobody" }).level).toBe("nascent");
  });

  it("counts years of trading as exposure", () => {
    expect(founderRead({ ...founderAnswers, f_education: "none", p_age: "over10" }).exposure).toBe(2);
  });

  it("flags when nobody plays the driving role", () => {
    expect(founderRead(founderAnswers).needsDriver).toBe(true);
    expect(founderRead({ ...founderAnswers, f_seen: "D" }).needsDriver).toBe(false);
    expect(founderRead({ ...founderAnswers, f_tough: "me_easy" }).needsDriver).toBe(false);
  });
});

describe("result", () => {
  it("names financials first when cash and pricing are stuck", () => {
    const answers = completeWith(operating("2to5", { s1_status: "busy", s1_detail: "no_goals", s3_status: "too_many", s7_status: "tight_guess" }));
    const result = evaluate(answers);
    expect(result.route).toBe("programme");
    expect(result.primaryArea?.area).toBe(7);
    expect(result.primaryGap).toBe("clarity");
    expect(result.offerings.map((offering) => offering.id)).toContain("financial-performance");
    expect(result.offerings.length).toBeLessThanOrEqual(3);
    expect(result.outline.find((row) => row.area === 0)?.health).toBe("watch");
  });

  it("recommends embedded support when four or more areas are stuck", () => {
    const answers = completeWith(operating("2to5", { p_trend: "declining", s1_status: "busy", s2_status: "anyone", s3_status: "like_not_buy", s4_status: "no_money", s7_status: "tight_guess" }));
    const ids = evaluate(answers).offerings.map((offering) => offering.id);
    expect(ids.slice(0, 2)).toEqual(["business-transformation", "embedded-support"]);
  });

  it("routes large businesses to advisory without matching offerings", () => {
    const result = evaluate(operating("over10", { p_revenue: "over25m" }));
    expect(result.route).toBe("advisory");
    expect(result.offerings).toEqual([]);
  });

  it("gives idea-stage founders a go or no-go next step", () => {
    const result = evaluate(completeWith({ p_stage: "idea", p_type: "expert", p_sector: "services" }, 2));
    expect(result.route).toBe("idea");
    expect(result.outline.map((row) => row.area)).toEqual([0, 1]);
    expect(result.summary.next).toMatch(/go or no-go/);
  });

  it("is deterministic", () => {
    const answers = completeWith(operating("5to10"), 1);
    expect(evaluate(answers)).toEqual(evaluate(answers));
  });
});

describe("rules summary wording", () => {
  it("uses 'an' before a style that starts with a vowel and 'a' before one that does not", () => {
    const summaryFor = (instinct: string) => {
      const { found, think, next } = evaluate(completeWith({ ...operating("2to5"), f_instinct: instinct })).summary;
      return [found, think, next].join(" ");
    };
    expect(summaryFor("I")).toContain("you lead as an influencer");
    expect(summaryFor("C")).toContain("you lead as an analyst");
    expect(summaryFor("D")).toContain("you lead as a driver");
    expect(summaryFor("S")).toContain("you lead as a steady hand");
  });
});

describe("areas not assessed", () => {
  const areas = (answers: Answers) => areasNotAssessed(completeWith(answers)).map((row) => row.area);

  it("names the areas a side business is not asked about, and why", () => {
    const side = areasNotAssessed(completeWith({ p_stage: "side", p_type: "expert", p_staff: "3to5", p_revenue: "1to3m" }));
    expect(side.map((row) => `${row.area}. ${row.name}`)).toEqual(["2. Market and industry", "4. Business model", "8. Risk and compliance", "9. Exit and value", "10. Owner transition"]);
    expect(new Set(side.map((row) => row.reason))).toEqual(new Set(["Not asked while you run the business alongside a job."]));
    const small = areasNotAssessed(completeWith({ p_stage: "side", p_type: "expert", p_staff: "1to2", p_revenue: "1to3m" }));
    expect(small.find((row) => row.area === 6)?.reason).toBe("Not asked while the business has fewer than three people.");
  });

  it("names exit and owner transition for a younger full-time business, by years traded", () => {
    const young = areasNotAssessed(completeWith({ p_stage: "operating", p_type: "trader", p_age: "2to5", p_staff: "3to5", p_revenue: "3to5m" }));
    expect(young).toEqual([
      { area: 9, name: "Exit and value", reason: "Asked once the business has traded for five years." },
      { area: 10, name: "Owner transition", reason: "Asked once the business has traded for ten years." },
    ]);
    expect(areas({ p_stage: "operating", p_type: "trader", p_age: "5to10", p_staff: "3to5", p_revenue: "3to5m" })).toEqual([10]);
    expect(areas({ p_stage: "operating", p_type: "trader", p_age: "over10", p_staff: "3to5", p_revenue: "3to5m" })).toEqual([]);
  });

  it("lists nothing for an idea, a very small business or one sent to an adviser", () => {
    expect(areas({ p_stage: "idea", p_type: "maker" })).toEqual([]);
    expect(areas({ p_stage: "operating", p_type: "trader", p_age: "under2", p_staff: "0", p_revenue: "under1m" })).toEqual([]);
    expect(areas({ p_stage: "operating", p_type: "maker", p_age: "over10", p_staff: "over50", p_revenue: "over25m" })).toEqual([]);
  });

  it("never lists an area the owner was asked about", () => {
    for (const answers of [
      { p_stage: "side", p_type: "expert", p_staff: "1to2", p_revenue: "1to3m" },
      { p_stage: "operating", p_type: "trader", p_age: "under2", p_staff: "3to5", p_revenue: "3to5m" },
    ]) {
      const result = evaluate(completeWith(answers));
      const asked = result.outline.map((row) => row.area);
      expect(areasNotAssessed(completeWith(answers)).filter((row) => asked.includes(row.area))).toEqual([]);
      expect([...asked, ...areasNotAssessed(completeWith(answers)).map((row) => row.area)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });
});
