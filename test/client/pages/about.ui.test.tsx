/** @vitest-environment jsdom */

import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVOIDED_WORDS, renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: AboutPage } = await import("@/pages/AboutPage");
const { BRAND } = await import("@shared/brand");

afterEach(cleanup);

describe("About (/about)", () => {
  it("names the parent firm and the sectors, links the firm when its address is set, and never names a partner", () => {
    const { container } = renderAt("/about", AboutPage);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    const section = container.querySelector("#experience")!;
    expect(section.textContent).toContain(`the delivery and method arm of ${BRAND.trackRecord.groupName}, an established Nigerian management consulting firm`);
    expect(section.textContent).toContain("The same method we use with larger clients. Run at the size and the price that fits your business.");
    const sectors = within(screen.getByRole("list", { name: "Sectors we have worked in" })).getAllByRole("listitem").map((item) => item.textContent);
    expect(sectors).toEqual(BRAND.trackRecord.sectors);
    const link = screen.queryByRole("link", { name: BRAND.trackRecord.groupName });
    if (BRAND.trackRecord.groupUrl) {
      expect(link?.getAttribute("href")).toBe(BRAND.trackRecord.groupUrl);
      expect(link?.getAttribute("rel")).toContain("noopener");
    } else expect(link).toBeNull();
    expect(container.textContent).not.toMatch(/Tarfa|Anago|Kurumi/i);
  });

  it("shows the track record and the client logos", () => {
    renderAt("/about", AboutPage);
    expect(screen.getByRole("region", { name: "Our track record" }).textContent).toContain("clients advised");
    expect(within(screen.getByRole("list", { name: "Client logos" })).getAllByRole("img").length).toBe(BRAND.trackRecord.clientLogos.length);
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

  it("backs the method with sourced research, in the site's words", () => {
    const { container } = renderAt("/about", AboutPage);
    const research = container.querySelector("#research")!.textContent!;
    for (const source of ["PwC MSME Survey, 2024", "World Bank, Nigeria, 2022", "Field trial of 852 owners, 2018"]) expect(research).toContain(source);
    expect(container.textContent).not.toMatch(AVOIDED_WORDS);
    expect(`${research} ${container.querySelector("#experience")!.textContent}`).not.toMatch(/\b(framework|strategic|solutions?|leverage|holistic)\b/i);
  });
});
