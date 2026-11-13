import { describe, expect, it } from "vitest";
import { mentionedIn } from "@shared/mentions";

/** Tagging a colleague (R86): by full name, or first name when no one else shares it. Fictional people. */
describe("who a message names", () => {
  const team = [{ userId: 1, name: "Kemi Producer" }, { userId: 2, name: "Lola Lead" }, { userId: 3, name: "Lola Analyst" }, { userId: 4, name: "Mira Marketer" }];
  const ids = (body: string) => mentionedIn(body, team).map(person => person.userId);

  it("finds a full name or an unshared first name, in any case, and each person once", () => {
    expect(ids("@Kemi the plan is ready")).toEqual([1]);
    expect(ids("Thanks @kemi producer and @Mira.")).toEqual([1, 4]);
    expect(ids("@Lola Lead please review, @Lola Lead")).toEqual([2]);
  });

  it("ignores a shared first name alone, an email address, and a name inside a word", () => {
    expect(ids("@Lola can you look?")).toEqual([]);
    expect(ids("write to kemi@example.test")).toEqual([]);
    expect(ids("@Kemiyo said so")).toEqual([]);
  });
});
