/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";

MotionGlobalConfig.skipAnimations = true;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;
window.scrollTo = () => undefined;

vi.mock("@/lib/trpc", () => ({
  trpc: { businessCheck: { prices: { useQuery: () => ({ data: { fullReport: 100_000, currentState: 600_000 } }) } } },
}));

const { default: ServicesPage } = await import("@/pages/ServicesPage");
const { default: ProductPage } = await import("@/pages/ProductPage");
const { BRAND } = await import("@shared/brand");
const { DELIVERY_PROMISE, MENU_PRODUCTS, WAY_DETAILS } = await import("@shared/products");
const { storyOf } = await import("@shared/productStories");

const at = (path: string) => render(
  <Router hook={memoryLocation({ path }).hook}>
    <Switch>
      <Route path="/services" component={ServicesPage} />
      <Route path="/services/:slug" component={ProductPage} />
    </Switch>
  </Router>,
);

afterEach(cleanup);

describe("the services page (/services), laid out as a store", () => {
  it("shows one tile per service with its promise, its price and its page, and the parent firm for larger work", () => {
    at("/services");
    const shelf = within(screen.getByRole("region", { name: "Products" }));
    expect(shelf.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Funding Readiness Assessment", "Business Model", "Pitch Deck", "Bookkeeping Catch-Up", "13-Week Cash Flow Forecast", "Hiring Toolkit", "Financial Model", "Strategy and 90-Day Plan",
      "Monthly Adviser Review", "Business Review", "Monthly Accounts and Cash Report", "Business Plan", "Pricing and Unit Cost Review", "Funding Application Pack", "Six-Week Fix",
    ]);
    for (const product of MENU_PRODUCTS) {
      expect(shelf.getByRole("link", { name: `Learn more about ${product.name}` }).getAttribute("href")).toBe(`/services/${product.slug}`);
      expect(shelf.getByText(storyOf(product.id)!.promise)).toBeTruthy();
    }
    expect(shelf.getAllByText("₦750,000")).toHaveLength(2); // the Business Plan and the Pricing and Unit Cost Review
    expect(shelf.getAllByText(/^₦600,000$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: BRAND.trackRecord.groupName })).toBeTruthy();
  });

  it("filters the shelf by way to buy, and says how that way is paid", () => {
    at("/services");
    fireEvent.click(screen.getByRole("button", { name: "Six-Week Fix" }));
    const shelf = within(screen.getByRole("region", { name: "Products" }));
    expect(shelf.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Six-Week Fix"]);
    expect(screen.getByText(WAY_DETAILS.six_week_fix.charge)).toBeTruthy();
    // One way to buy keeps the menu's own order.
    fireEvent.click(screen.getByRole("button", { name: "Done for You" }));
    expect(within(screen.getByRole("region", { name: "Products" })).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(MENU_PRODUCTS.filter((product) => product.way === "done_for_you").map((product) => product.name));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(within(screen.getByRole("region", { name: "Products" })).getAllByRole("heading", { level: 3 }).length).toBe(MENU_PRODUCTS.length);
  });

  it("never uses the words the site avoids", () => {
    const { container } = at("/services");
    expect(container.textContent).not.toMatch(/what we sell|\b(door|sprint|playbook|retainer)\b/i);
  });
});

describe("a service page (/services/:slug), told as a story", () => {
  it("leads with the story, then shows what you get, what we need, the price, the delivery promise, and starts with the call while online ordering is closed", () => {
    at("/services/13-week-cash-flow-forecast");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(storyOf("cash_flow_forecast")!.headline.join(""));
    expect(screen.getByRole("region", { name: "What you get" })).toBeTruthy();
    expect(screen.getByText("Business bank statements for the last three months")).toBeTruthy();
    expect(screen.getAllByText("₦300,000").length).toBeGreaterThan(0);
    expect(screen.getByText(DELIVERY_PROMISE)).toBeTruthy();
    // The button on the coloured refund band is light with dark text, never white on white.
    const band = within(screen.getByText(DELIVERY_PROMISE).parentElement!.parentElement!).getByRole("link", { name: /book a free call/i });
    expect(band.className).toContain("bg-paper-raised");
    expect(band.className).toContain("text-brand-deep");
    expect(band.className).not.toMatch(/\btext-paper\b|\bbg-brand\b/);
    const call = screen.getAllByRole("link", { name: /book a free call/i });
    expect(call.length).toBeGreaterThan(0);
    for (const link of call) expect(link.getAttribute("href")).toBe(BRAND.discoveryCallUrl);
    expect(screen.queryByRole("link", { name: /^buy/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Six-Week Fix: Cash and Pricing/ }).getAttribute("href")).toBe("/services/six-week-fix");
  });

  it("names an optional record once, with \"(if you have it)\" added by the page", () => {
    at("/services/funding-readiness-assessment");
    const label = screen.getByText((_, element) => element?.tagName === "P" && element.textContent?.startsWith("The lender's application form or checklist") === true);
    expect(label.textContent).toBe("The lender's application form or checklist (if you have it)");
  });

  it("shows the Six-Week Fix's four problems and its three payments", () => {
    at("/services/six-week-fix");
    for (const name of ["Margin", "Sales", "Cash and Pricing", "Delegation and Structure"]) expect(screen.getByText(`Six-Week Fix: ${name}`)).toBeTruthy();
    expect(screen.getAllByText(/₦750,000 at the start, ₦375,000 at the mid-point, ₦375,000 at the result\. Or ₦1,425,000 in full/).length).toBeGreaterThan(0);
  });

  it("labels a service that answers several needs by its way to buy only, and lets keyboards reach wide sample charts", () => {
    at("/services/six-week-fix");
    expect(screen.getByRole("heading", { level: 1 }).previousElementSibling!.textContent).toBe("Six-Week Fix");
    cleanup();
    at("/services/13-week-cash-flow-forecast");
    expect(screen.getByRole("heading", { level: 1 }).previousElementSibling!.textContent).toBe("Done for You · Finance and accounts");
    const charts = screen.getAllByRole("region", { name: /scrolls sideways/ });
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) expect(chart.getAttribute("tabindex")).toBe("0");
  });

  it("sends the Full Report to the free check, at the server's price", () => {
    at("/services/full-report");
    const starts = screen.getAllByRole("link", { name: /take the free check/i });
    for (const link of starts) expect(link.getAttribute("href")).toBe("/check");
    expect(screen.getAllByText("₦100,000").length).toBeGreaterThan(0);
  });

  it("says so, and links the services page, for a page that is not on it", () => {
    at("/services/not-a-product");
    expect(screen.getByRole("heading", { name: "We could not find that service." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all services" }).getAttribute("href")).toBe("/services");
  });
});
