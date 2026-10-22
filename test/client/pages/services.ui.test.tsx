/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
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
const { DELIVERY_PROMISE, menuEntry, MENU_PRODUCTS, NEEDS, productsForNeed } = await import("@shared/products");

const at = (path: string) => render(
  <Router hook={memoryLocation({ path }).hook}>
    <Switch>
      <Route path="/services" component={ServicesPage} />
      <Route path="/services/:slug" component={ProductPage} />
    </Switch>
  </Router>,
);

afterEach(cleanup);

describe("the menu (/services)", () => {
  it("shows the four ways to buy and every product under each need it answers, with its price and page", () => {
    at("/services");
    expect(within(screen.getByRole("list", { name: "Ways to buy" })).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Assessment", "Done for You", "Six-Week Fix", "Monthly Service"]);
    let rows = 0;
    for (const need of NEEDS) {
      for (const product of productsForNeed(need)) {
        const link = screen.getByRole("link", { name: new RegExp(menuEntry(product, need).name.replace(/[()]/g, "\\$&")) });
        expect(link.getAttribute("href")).toBe(`/services/${product.slug}`);
        rows += 1;
      }
    }
    expect(rows).toBeGreaterThanOrEqual(MENU_PRODUCTS.length);
    expect(screen.getByText("₦750,000")).toBeTruthy();
    expect(screen.getAllByText(/^₦600,000$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: BRAND.trackRecord.groupName })).toBeTruthy();
  });
});

describe("a product page (/services/:slug)", () => {
  it("shows what the owner gets, what we need, the price, the delivery promise, and starts with the call while online ordering is closed", () => {
    at("/services/13-week-cash-flow-forecast");
    expect(screen.getByRole("heading", { level: 1, name: "13-Week Cash Flow Forecast" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What you get" })).toBeTruthy();
    expect(screen.getByText("Business bank statements for the last three months")).toBeTruthy();
    expect(screen.getAllByText("₦300,000").length).toBeGreaterThan(0);
    expect(screen.getByText(DELIVERY_PROMISE)).toBeTruthy();
    const call = screen.getAllByRole("link", { name: /book a free call/i });
    for (const link of call) expect(link.getAttribute("href")).toBe(BRAND.discoveryCallUrl);
    expect(screen.queryByRole("link", { name: /buy now/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Six-Week Fix: Cash and Pricing/ }).getAttribute("href")).toBe("/services/six-week-fix");
  });

  it("shows the Six-Week Fix's four problems and its three payments", () => {
    at("/services/six-week-fix");
    for (const name of ["Margin", "Sales", "Cash and Pricing", "Delegation and Structure"]) expect(screen.getByText(`Six-Week Fix: ${name}`)).toBeTruthy();
    expect(screen.getAllByText(/₦750,000 at the start, ₦375,000 at the mid-point, ₦375,000 at the result\. Or ₦1,425,000 in full/).length).toBeGreaterThan(0);
  });

  it("sends the Full Report to the free check, at the server's price", () => {
    at("/services/full-report");
    expect(screen.getAllByRole("link", { name: /take the free business health check/i })[0].getAttribute("href")).toBe("/check");
    expect(screen.getAllByText("₦100,000").length).toBeGreaterThan(0);
  });

  it("says so, and links the menu, for a page that is not on it", () => {
    at("/services/not-a-product");
    expect(screen.getByRole("heading", { name: "We could not find that service." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all services" }).getAttribute("href")).toBe("/services");
  });
});
