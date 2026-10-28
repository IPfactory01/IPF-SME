/** @vitest-environment jsdom */

import React from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderAt } from "./publicPageHarness";

const mutation = () => ({ isPending: false, mutate: () => undefined });
vi.mock("@/lib/trpc", () => ({
  trpc: {
    businessCheck: { prices: { useQuery: () => ({ data: { fullReport: 100_000, currentState: 600_000 } }) } },
    registration: { requestPortalLink: { useMutation: mutation } },
    participant: { signIn: { useMutation: mutation } },
  },
}));
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { default: Home } = await import("@/pages/Home");
const { default: ServicesPage } = await import("@/pages/ServicesPage");
const { default: HowWeWorkPage } = await import("@/pages/HowWeWorkPage");
const { default: QuestionsPage } = await import("@/pages/QuestionsPage");
const { default: ProductPage } = await import("@/pages/ProductPage");
const { BRAND } = await import("@shared/brand");
const { DELIVERY_REMEDY, JOURNEY } = await import("@shared/businessSupport");
const { DELIVERY_PROMISE, PRODUCTS } = await import("@shared/products");

afterEach(cleanup);

/** What the site used to promise: a refund as of right, which the Terms (§8) do not give. */
const OLD_PROMISE = /full refund|ask for a refund|money back/i;

const DATED = PRODUCTS.filter((product) => product.workingDays !== undefined);

const at = (path: string) => render(
  <Router hook={memoryLocation({ path }).hook}>
    <Switch>
      <Route path="/services/:slug" component={ProductPage} />
    </Switch>
  </Router>,
);

/** The paragraph that carries the delivery promise: its text is exactly DELIVERY_PROMISE, whatever links sit inside it. */
const promiseParagraph = () => screen.getByText((_, element) => element?.tagName === "P" && element.textContent === DELIVERY_PROMISE);

describe("the delivery promise says what the Terms say", () => {
  it("is the Terms' remedy, not an automatic refund, and ends with the word the pages link", () => {
    expect(DELIVERY_REMEDY).toBe("If we cannot deliver the service as agreed, contact us and we’ll make it right in line with our Terms.");
    expect(DELIVERY_PROMISE).toBe(`We confirm your delivery date once your records are complete. ${DELIVERY_REMEDY}`);
    expect(DELIVERY_PROMISE).not.toMatch(OLD_PROMISE);
    expect(DELIVERY_PROMISE).toMatch(/Terms\.$/);
    expect(JOURNEY.find((step) => step.id === "deliver")!.body).toContain(DELIVERY_REMEDY);
  });

  // The four services added on 28 October 2026 (Business Model, Financial Model, Business Plan, Pitch Deck) are dated too.
  it("covers the eleven dated products, and no others", () => {
    expect(DATED.map((product) => product.id)).toEqual([
      "funding_readiness_assessment", "strategy_90_day_plan", "business_model", "financial_model", "business_plan", "pitch_deck",
      "pricing_unit_cost_review", "bookkeeping_catch_up", "cash_flow_forecast", "funding_application_pack", "hiring_toolkit",
    ]);
  });

  for (const product of DATED) {
    it(`${product.name}: the page uses the new wording, links Terms to /terms, and keeps its call button`, () => {
      at(`/services/${product.slug}`);
      expect(document.body.textContent).not.toMatch(OLD_PROMISE);
      const promise = promiseParagraph();
      expect(within(promise).getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
      expect(screen.getByRole("heading", { level: 2, name: "Delivered on the date we give you. Or we make it right." })).toBeTruthy();
      expect(screen.getByText(/A date we stand behind\./)).toBeTruthy();
      // Only the words changed: the button in the promise band is still the free call.
      const band = within(promise.parentElement!.parentElement!).getByRole("link", { name: /book a free call/i });
      expect(band.getAttribute("href")).toBe(BRAND.discoveryCallUrl);
    });
  }

  it("a product without a delivery date makes no delivery promise", () => {
    const undated = PRODUCTS.find((product) => product.workingDays === undefined && product.buy !== "check")!;
    at(`/services/${undated.slug}`);
    expect(screen.queryByText(DELIVERY_REMEDY, { exact: false })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Delivered on the date we give you. Or we make it right." })).toBeNull();
  });

  it("the home page says it once, with Terms linked to /terms, and not the old promise", () => {
    window.history.replaceState({}, "", "/");
    render(<Router hook={memoryLocation({ path: "/" }).hook}><Home /></Router>);
    expect(document.body.textContent).not.toMatch(OLD_PROMISE);
    expect(within(promiseParagraph()).getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  });

  it("the services page and How we work show the same remedy under the promise heading", () => {
    for (const [path, Page] of [["/services", ServicesPage], ["/how-we-work", HowWeWorkPage]] as const) {
      renderAt(path, Page);
      expect(document.body.textContent).not.toMatch(OLD_PROMISE);
      expect(screen.getByRole("heading", { name: "A date we stand behind." })).toBeTruthy();
      expect(screen.getAllByText(new RegExp(DELIVERY_REMEDY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("the Questions page answers 'What if you miss the delivery date?' with the same sentence", () => {
    renderAt("/questions", QuestionsPage);
    expect(document.body.textContent).not.toMatch(OLD_PROMISE);
    expect(screen.getByText("What if you miss the delivery date?")).toBeTruthy();
  });
});

describe("no page source promises a refund the Terms do not", () => {
  const roots = ["client/src", "shared", "server"].map((dir) => resolve(process.cwd(), dir));
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

  it("has no 'ask for a full refund', 'full refund and you have it' or 'money back' in the app, shared or server code", () => {
    const hits = roots.flatMap(files).filter((path) => /ask for a full refund|full refund and you have it|money back/i.test(readFileSync(path, "utf8")));
    expect(hits).toEqual([]);
  });
});
