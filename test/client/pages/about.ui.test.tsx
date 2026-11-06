/** @vitest-environment jsdom */

import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVOIDED_WORDS, renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: AboutPage } = await import("@/pages/AboutPage");

afterEach(cleanup);

describe("About (/about)", () => {
  it("points to Experience for the track record, the clients and the research, which moved there", () => {
    const { container } = renderAt("/about", AboutPage);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Our experience" })).getByRole("link", { name: "Experience" }).getAttribute("href")).toBe("/experience");
    expect(screen.queryByRole("list", { name: "Client logos" })).toBeNull();
    expect(container.querySelector("#research")).toBeNull();
    expect(container.textContent).not.toMatch(/Tarfa|Anago|Kurumi/i);
    expect(container.textContent).not.toMatch(AVOIDED_WORDS);
  });

  it("tells smaller and larger owners where to start with products that exist, and who they work with", () => {
    const { container } = renderAt("/about", AboutPage);
    const forWhom = container.querySelector("#for")!.textContent!;
    expect(forWhom).toContain("a Done for You product, from ₦300,000");
    expect(forWhom).toContain("Start with a Business Review");
    expect(forWhom).toContain("We use AI for analysis and say so.");
    expect(forWhom).not.toMatch(/training timetable|Advisory\./);
    expect(container.querySelector("#what")!.textContent).toContain("We are not a course.");
  });

});
