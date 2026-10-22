/** @vitest-environment jsdom */

import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVOIDED_WORDS, renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: HowWeWorkPage } = await import("@/pages/HowWeWorkPage");
const { PRODUCTS, WAY_DETAILS, WAYS_TO_BUY } = await import("@shared/products");
const { PROBLEM_AREAS } = await import("@shared/businessSupport");

afterEach(cleanup);

describe("How we work (/how-we-work)", () => {
  it("names the page and walks through the steps from the free check", () => {
    renderAt("/how-we-work", HowWeWorkPage);
    expect(screen.getByRole("heading", { level: 1, name: "Find it. Fix it. See the results." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The steps" })).toBeTruthy();
  });

  it("shows the four ways to work with us, every product under its way with its price and page, and how each way is paid", () => {
    renderAt("/how-we-work", HowWeWorkPage);
    const ways = within(screen.getByRole("list", { name: "Ways to buy" }));
    expect(ways.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(WAYS_TO_BUY.map((way) => WAY_DETAILS[way].name));
    for (const product of PRODUCTS) {
      const link = ways.getByRole("link", { name: new RegExp(`^${product.name.replace(/[()]/g, "\\$&")}`) });
      expect(link.getAttribute("href")).toBe(product.buy === "check" ? "/check" : `/services/${product.slug}`);
    }
    expect(ways.getByRole("link", { name: /^Six-Week Fix₦1,500,000/ })).toBeTruthy();
    for (const way of WAYS_TO_BUY) expect(ways.getByText(WAY_DETAILS[way].charge)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See every service" }).getAttribute("href")).toBe("/services");
  });

  it("states the three promises and lists every place a business gets stuck", () => {
    renderAt("/how-we-work", HowWeWorkPage);
    for (const promise of ["A date, or your money back.", "Checked before you see it.", "Your records stay private."]) expect(screen.getByRole("heading", { name: promise })).toBeTruthy();
    for (const area of PROBLEM_AREAS.filter((item) => item.siteSentence)) expect(screen.getByText(`“${area.siteSentence}”`)).toBeTruthy();
  });

  it("never uses the words the site avoids", () => {
    const { container } = renderAt("/how-we-work", HowWeWorkPage);
    expect(container.textContent).not.toMatch(AVOIDED_WORDS);
  });
});
