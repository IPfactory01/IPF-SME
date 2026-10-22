import { describe, expect, it, vi } from "vitest";
import { businessOutline, cleanAnswers, evaluate, founderRead, isComplete, matchedOfferings, primaryArea, primaryGap, questionPath, routeFor } from "@shared/businessCheck/engine";
import { businessCheckProfiles } from "../fixtures/businessCheckProfiles";

// The language model is unavailable, so the deterministic rules summary (the fallback) is pinned too.
vi.mock("@server/_core/llm", () => ({ invokeLLM: () => Promise.reject(new Error("offline")) }));
vi.mock("@server/_core/env", () => ({ ENV: { forgeApiKey: "test-key" } }));

const { summariseCheck } = await import("@server/businessCheck");

describe("Free Business Health Check golden profiles", () => {
  it.each(Object.entries(businessCheckProfiles))("%s keeps its pinned question flow, route, readiness and recommendations", async (name, rawAnswers) => {
    const answers = cleanAnswers(rawAnswers);
    expect(isComplete(answers)).toBe(true);
    const outline = businessOutline(answers);
    const main = primaryArea(outline, answers);
    const result = evaluate(answers);
    const { summary, source } = await summariseCheck({
      answers,
      result,
      contact: { fullName: "Golden Profile", email: "golden@example.test" },
    });

    expect({
      questionFlow: questionPath(answers).map(step => `${step.section.id}:${step.question.id}`),
      cleanedAnswers: answers,
      route: routeFor(answers),
      readiness: founderRead(answers).level,
      outline,
      primaryArea: main?.area ?? null,
      primaryGap: primaryGap(outline, main) ?? null,
      candidateOfferings: matchedOfferings(answers, outline).map(offering => offering.id),
      result,
      ruleFallback: { source, summary },
    }).toMatchSnapshot(name);
  });

  it("covers the five required profile shapes", () => {
    expect(Object.keys(businessCheckProfiles)).toEqual(["ideaStageFounder", "smallOperatingTrader", "growingMaker", "advisoryRouteBusiness", "weakFounderReadiness"]);
    const routes = Object.values(businessCheckProfiles).map(answers => routeFor(cleanAnswers(answers)));
    expect(routes).toContain("idea");
    expect(routes).toContain("advisory");
    expect(routes).toContain("programme");
    expect(founderRead(cleanAnswers(businessCheckProfiles.weakFounderReadiness)).level).toBe("nascent");
  });
});
