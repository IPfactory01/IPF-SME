/** @vitest-environment jsdom */

import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVOIDED_WORDS, renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: AboutPage } = await import("@/pages/AboutPage");
const { ABOUT_FAQ, ABOUT_HEADING } = await import("@shared/about");

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
    expect(forWhom).not.toMatch(/training timetable|Advisory\./);
    expect(container.querySelector("#what")!.textContent).toContain("We are not a course");
    // How we work names the consultant behind the AI, without the defensive aside (ET, 10 November 2026).
    expect(container.querySelector("#how")!.textContent).toContain("Our analysts and AI do the heavy lifting, under that IP Factory consultant.");
    expect(container.textContent).not.toMatch(/say so/i);
  });

  it("answers the searches an About page gets: who IP Factory is, where, who is behind it, and what it does (ET, 10 November 2026)", () => {
    const { container } = renderAt("/about", AboutPage);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(ABOUT_HEADING);
    expect(document.title).toBe("About IP Factory: SME management consultants in Lekki, Lagos | The Shift, by IP Factory");
    expect(container.textContent).toContain("Lekki, Lagos");
    expect(container.textContent).toContain("Enzo Krypton & Co.");
    // Each service named links to its own page, so the page passes search engines on to them.
    const what = within(container.querySelector("#what") as HTMLElement);
    for (const [name, path] of [["Business Plan", "/services/business-plan"], ["13-Week Cash Flow Forecast", "/services/13-week-cash-flow-forecast"], ["Business Review", "/services/business-review"], ["Six-Week Fix", "/services/six-week-fix"], ["Digital Marketing", "/services/digital-marketing"]]) {
      expect(what.getByRole("link", { name }).getAttribute("href")).toBe(path);
    }
    for (const item of ABOUT_FAQ) expect(screen.getByText(item.q)).toBeTruthy();
  });

});
