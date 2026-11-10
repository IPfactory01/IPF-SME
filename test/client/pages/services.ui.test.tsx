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
      "Funding Readiness Assessment", "Business Model", "Pitch Deck", "Bookkeeping Catch-Up", "13-Week Cash Flow Forecast", "Hiring Toolkit", "Financial Model", "Pricing and Unit Cost Review",
      "Strategy and 90-Day Plan", "Monthly Adviser Review", "Digital Marketing", "Business Review", "Monthly Accounts and Cash Report", "Business Plan", "Funding Application Pack", "Six-Week Fix",
    ]);
    for (const product of MENU_PRODUCTS) {
      expect(shelf.getByRole("link", { name: `Learn more about ${product.name}` }).getAttribute("href")).toBe(`/services/${product.slug}`);
      expect(shelf.getByText(storyOf(product.id)!.promise)).toBeTruthy();
    }
    expect(shelf.getByText("₦750,000")).toBeTruthy(); // the Business Plan
    // A Monthly Service shows the quarter it is paid in, with its month beside it.
    expect(shelf.getByText("₦600,000 a quarter")).toBeTruthy();
    expect(shelf.getByText("₦200,000 a month")).toBeTruthy();
    expect(shelf.getByText("₦450,000 a quarter")).toBeTruthy();
    // Digital Marketing is paid month by month, for three months (R36); the Six-Week Fix in its two halves.
    expect(shelf.getByText("₦470,000 a month")).toBeTruthy();
    expect(shelf.getByText("for three months")).toBeTruthy();
    expect(shelf.getByText("or in two payments")).toBeTruthy();
    expect(shelf.queryByText("or in three payments")).toBeNull();
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
    // Digital Marketing is a Monthly Service, paid month by month; only a quarterly price holds for twelve months.
    fireEvent.click(screen.getByRole("button", { name: "Monthly Service" }));
    expect(within(screen.getByRole("region", { name: "Products" })).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Monthly Accounts and Cash Report", "Monthly Adviser Review", "Digital Marketing"]);
    expect(screen.getByText("Paid before it starts: a quarter at a time, or month by month for Digital Marketing. A quarterly price holds for twelve months. Stop at the end of any quarter.")).toBeTruthy();
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
    const promise = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === DELIVERY_PROMISE);
    // The button on the coloured promise band is light with dark text, never white on white.
    const band = within(promise.parentElement!.parentElement!).getByRole("link", { name: /book a free call/i });
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

  it("shows the Six-Week Fix's four problems and its two payments, half at the start and half at the result (R36)", () => {
    at("/services/six-week-fix");
    for (const name of ["Margin", "Sales", "Cash and Pricing", "Delegation and Structure"]) expect(screen.getByText(`Six-Week Fix: ${name}`)).toBeTruthy();
    expect(screen.getAllByText(/₦750,000 at the start, ₦750,000 at the result\. Or ₦1,425,000 in full/).length).toBeGreaterThan(0);
  });

  it("says a service agreed on a call is paid half to start and half on delivery, and a product bought online before we start (R36)", () => {
    at("/services/business-plan");
    expect(screen.getByText("₦375,000 to start and ₦375,000 on delivery, by transfer or card.")).toBeTruthy();
    expect(screen.getByText("Twenty minutes, by phone or video. We send the link for the first half after the call.")).toBeTruthy();
    expect(screen.getByText("A free 20-minute call. If it fits, we send the link for the first half after it.")).toBeTruthy();
    cleanup();
    // While online ordering is closed a product starts with the call too, and is still paid in full before we start.
    at("/services/13-week-cash-flow-forecast");
    expect(screen.getByText("Paid before we start, by transfer or card.")).toBeTruthy();
    expect(screen.getByText("Twenty minutes, by phone or video. We send your payment link after the call.")).toBeTruthy();
    expect(screen.getByText("A free 20-minute call. If it fits, we send your payment link after it.")).toBeTruthy();
    expect(screen.queryByText(/first half/)).toBeNull();
  });

  it("tells Digital Marketing as its programme runs: month by month, the client's own clips, nothing out without their yes (R35)", () => {
    at("/services/digital-marketing");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Be where your customers look.Every week, without doing it yourself.");
    // The whole digital space (ET, 10 November 2026), each platform named.
    expect(screen.getByText("Every month, 15 reels, 5 posts and 20 stories across Instagram, TikTok, Facebook and your Google Business Profile. You film short clips on your phone; we plan, edit and publish.")).toBeTruthy();
    expect(screen.getByText("Which platforms do you cover?")).toBeTruthy();
    expect(screen.getByText("Monthly Service · Sales and marketing")).toBeTruthy();
    expect(screen.getByText("Twenty minutes, by phone or video. We send the link for the first month after the call.")).toBeTruthy();
    expect(screen.getByText("₦470,000 a month for three months, each paid before the month starts.")).toBeTruthy();
    for (const step of ["Talk to us first", "Week 1: the plan", "Every month"]) expect(screen.getByText(step)).toBeTruthy();
    expect(screen.getByText("A free 20-minute call about your customers and what you sell. If it fits, we send the link for the first month after it.")).toBeTruthy();
    expect(screen.getAllByText("Your 90 days").length).toBeGreaterThan(0);
    for (const question of ["Who films the videos?", "Will you post anything without asking me?", "What happens after three months?"]) expect(screen.getByText(question)).toBeTruthy();
    // What we need arrives on the Data Request in the room, so there is no upload form to describe.
    expect(screen.queryByRole("heading", { name: "What we need from you" })).toBeNull();
    expect(screen.queryByText(/first half/)).toBeNull();
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
