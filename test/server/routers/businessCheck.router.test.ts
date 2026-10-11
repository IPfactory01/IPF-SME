import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/businessCheck.ts"), "utf8");
const procedure = (name: string) => source.slice(source.indexOf(`  ${name}: publicProcedure`), source.indexOf("\n  }),", source.indexOf(`  ${name}: publicProcedure`)));

describe("business check routes", () => {
  it("rate-limits starting, saving, sending and asking for the next step through the shared counters, and refuses incomplete checks", () => {
    expect(procedure("start")).toContain("consumeLimit(LIMITS.checkStartIp, ip)");
    expect(procedure("start")).toContain("consumeLimit(LIMITS.checkStartEmail, `${ip}:${input.email}`)");
    expect(procedure("saveProgress")).toContain("consumeLimit(LIMITS.checkSave, input.token)");
    expect(procedure("submit")).toContain("consumeLimit(LIMITS.checkSubmit, input.token)");
    expect(procedure("requestNext")).toContain("consumeLimit(LIMITS.checkNext, input.token)");
    expect(source).toContain('code: "TOO_MANY_REQUESTS"');
    expect(procedure("submit")).toContain("if (!isComplete(answers))");
  });

  it("recomputes the result on the server from cleaned answers, never from browser input", () => {
    expect(procedure("submit")).toContain("const answers = cleanAnswers(input.answers)");
    expect(procedure("submit")).toContain("const result = evaluate(answers)");
    expect(source).not.toContain("input.result");
  });

  it("takes the owner's contact details from the saved lead, not from the finishing request", () => {
    expect(procedure("submit")).toContain("contactOf(check, answers)");
    expect(procedure("submit")).not.toContain("input.contact");
  });

  it("records each check when it starts and finds it again by an unguessable token", () => {
    expect(procedure("start")).toContain("await db.insert(businessChecks).values");
    expect(procedure("start")).toContain("randomBytes(24)");
    expect(source).toContain("eq(businessChecks.publicToken, token)");
  });

  it("moves the pipeline only through advancePipeline", () => {
    expect(procedure("start")).toContain('pipelineStage: "lead"');
    expect(procedure("submit")).toContain('advancePipeline(check.pipelineStage, "qualified_lead")');
    expect(procedure("requestNext")).toContain('advancePipeline(check.pipelineStage, "call_booked")');
    expect(source.match(/pipelineStage:/g)).toHaveLength(3);
  });

  it("sends every business check email as IP Factory Business Support, not as the JUMP programme", () => {
    const calls = source.match(/deliverEmail\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls.length).toBe(3);
    for (const call of calls) expect(call).toContain('sender: "business_support"');
  });

  it("notifies only the Business Support inbox and the owner who took the check", () => {
    const recipients = Array.from(source.matchAll(/to: ([\w.]+)/g)).map((match) => match[1]);
    expect(new Set(recipients)).toEqual(new Set(["BUSINESS_SUPPORT_MAILBOX", "check.email"]));
  });
});
