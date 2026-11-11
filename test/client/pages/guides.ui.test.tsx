/** @vitest-environment jsdom */

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVOIDED_WORDS, renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: GuidePage, GuidesIndex } = await import("@/pages/GuidesPage");
const { GUIDES } = await import("@shared/guides");

afterEach(cleanup);

describe("Guides", () => {
  it("lists every guide by the owner's question, each linking to its page", () => {
    renderAt("/guides", GuidesIndex);
    for (const guide of GUIDES) expect(screen.getByRole("link", { name: new RegExp(guide.h1.replace(/[?.]/g, "\\$&")) }).getAttribute("href")).toBe(`/guides/${guide.slug}`);
  });

  it("answers the question, then puts the fix here: the free check and the services, with their prices", () => {
    const { container } = renderAt("/guides/how-much-does-a-business-plan-cost-in-nigeria", GuidePage, "/guides/:slug");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("How much does a business plan cost in Nigeria?");
    const fix = within(screen.getByRole("region", { name: "The fix, here" }));
    expect(fix.getByRole("link", { name: /Business Plan/ }).getAttribute("href")).toBe("/services/business-plan");
    expect(fix.getByText("₦1,250,000")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Questions owners ask" }).textContent).toContain("Can I write my own business plan?");
    expect(document.title).toContain("How much does it cost to write a business plan in Nigeria?");
    expect(container.textContent).not.toMatch(AVOIDED_WORDS);
  });

  it("starts the free check from the top of a guide", () => {
    renderAt("/guides/my-business-is-struggling", GuidePage, "/guides/:slug");
    expect(screen.getByRole("button", { name: /Start your free Business Health Check/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Start your free Business Health Check/ }));
  });

  it("shows the not-found page for a guide that does not exist", () => {
    renderAt("/guides/nothing-here", GuidePage, "/guides/:slug");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Guide not found.");
    expect(screen.getByRole("link", { name: /See all guides/ }).getAttribute("href")).toBe("/guides");
  });
});
