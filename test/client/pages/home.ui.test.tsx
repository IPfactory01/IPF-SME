/** @vitest-environment jsdom */

import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

MotionGlobalConfig.skipAnimations = true;
// jsdom has no IntersectionObserver or matchMedia; scroll-triggered motion just needs them to exist.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;

const mutation = () => ({ isPending: false, mutate: () => undefined });
vi.mock("@/lib/trpc", () => ({
  trpc: {
    businessCheck: { prices: { useQuery: () => ({ data: { fullReport: 100_000, currentState: 600_000 } }) } },
    registration: { requestPortalLink: { useMutation: mutation } },
    participant: { signIn: { useMutation: mutation } },
  },
}));

const { default: Home } = await import("@/pages/Home");
const { BRAND } = await import("@shared/brand");
const { NEED_DETAILS, NEED_LEAD, NEEDS, productById } = await import("@shared/products");
const { SITE_PAGES } = await import("@/components/SiteShell");

const renderHome = (path = "/") => {
  window.history.replaceState({}, "", path);
  const { hook } = memoryLocation({ path: "/", record: true });
  return render(<Router hook={hook}><Home /></Router>);
};

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("home page sign-in", () => {
  it("sends clients to the client sign-in page, not the JUMP participant sign-in", () => {
    renderHome();
    const links = screen.getAllByRole("link", { name: "Client sign in" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still opens the JUMP participant sign-in for participants sent from their portal", () => {
    renderHome("/?participant_signin=1");
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("JUMP participant sign in");
    expect(dialog.querySelector('a[href="/login"]')).toBeTruthy();
  });
});

describe("home page: a standard home page that leads to the site's other pages", () => {
  it("carries the site menu (Services, How we work, About, Questions, Contact), not anchors on one long page", () => {
    renderHome();
    const menu = within(screen.getByRole("navigation", { name: "Site" }));
    expect(menu.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual(SITE_PAGES.map((page) => [page.label, page.href]));
    expect(screen.queryByRole("link", { name: "What we sell" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/what we sell/i);
  });

  it("turns each owner's problem into a link to the service that answers it first", () => {
    renderHome();
    const problems = within(screen.getByRole("region", { name: /What problem are you facing right now/ }));
    for (const need of NEEDS) {
      const product = productById(NEED_LEAD[need])!;
      const link = problems.getByRole("link", { name: new RegExp(NEED_DETAILS[need].ownerWords.replace(/[?.()]/g, "\\$&")) });
      expect(link.getAttribute("href")).toBe(`/services/${product.slug}`);
      expect(link.textContent).toContain(product.name);
    }
    expect(problems.getByRole("link", { name: "Take the free Business Health Check" }).getAttribute("href")).toBe("/check");
  });

  it("features three services to start with, with their prices, and links to all of them", () => {
    renderHome();
    const featured = within(screen.getByRole("region", { name: "Where most owners start." }));
    expect(featured.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["13-Week Cash Flow Forecast", "Business Review", "Six-Week Fix"]);
    expect(featured.getByText("₦600,000")).toBeTruthy();
    expect(featured.getByRole("link", { name: /See all \d+ services/ }).getAttribute("href")).toBe("/services");
  });

  it("explains how we work in three steps and links to the full page", () => {
    renderHome();
    const how = within(screen.getByRole("region", { name: "Find it. Fix it. See the shift." }));
    expect(how.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Find it", "Fix it", "See the shift"]);
    expect(how.getByRole("link", { name: /How we work/ }).getAttribute("href")).toBe("/how-we-work");
  });

  it("leads with the problem we solve and why it matters, with sourced figures, in the site's words", () => {
    const { container } = renderHome();
    const problem = container.querySelector("#problem")!;
    expect(problem.querySelector("h2")!.textContent).toBe("You are working hard. The business is not moving.");
    for (const source of ["PwC MSME Survey, 2024", "World Bank, Nigeria, 2022", "Field trial of 852 owners, 2018"]) expect(problem.textContent).toContain(source);
    expect(container.textContent).not.toMatch(/\b(framework|strategic|solutions?|leverage|holistic|playbook|sprint|retainer|door)\b/i);
  });

  it("goes problem, the owners' words, how we fix it, why us, services, then the free check", () => {
    const { container } = renderHome();
    expect(Array.from(container.querySelectorAll("main h2")).map((heading) => heading.textContent)).toEqual([
      "You are working hard. The business is not moving.",
      "What problem are you facing right now?",
      "Find it. Fix it. See the shift.",
      "Consultants who have fixed this before, at the size of your business.",
      "Where most owners start.",
      "Start with the free Business Health Check.",
    ]);
  });
});

describe("the free check comes first", () => {
  it("puts the free check straight under the headline and one line of what it means for the owner", () => {
    const { container } = renderHome();
    const hero = container.querySelector("#top")!;
    const line = Array.from(hero.querySelectorAll("p")).find((p) => p.textContent!.startsWith("Today, your business is busy"))!;
    expect(line.textContent).toBe("Today, your business is busy but the money is not showing. We find the real problem, fix it with you on your own numbers, and stay until you see the shift.");
    // The button follows that line directly: no quote or second paragraph between them.
    expect(line.nextElementSibling!.querySelector("button")!.textContent).toBe("Start your free Business Health Check");
    expect(hero.textContent).toContain("Free. Ten minutes on your phone. Your result straight away.");
    expect(hero.textContent).not.toContain("Some owners know exactly what their business needs");
  });

  it("keeps a free check button in the header on a phone, on every page", () => {
    renderHome();
    expect(screen.getByRole("link", { name: "Free check" }).getAttribute("href")).toBe("/check");
  });
});

describe("the owners' words under the headline", () => {
  it("holds each one on screen for at least two seconds, so it can be read", async () => {
    vi.useFakeTimers();
    try {
      const { container } = renderHome();
      const quote = () => container.querySelector('[aria-label="Start the Business Health Check"]')!.textContent;
      const first = quote();
      await act(async () => { vi.advanceTimersByTime(2_500); });
      expect(quote()).toBe(first);
      await act(async () => { vi.advanceTimersByTime(3_000); });
      expect(quote()).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts the fix right under each problem, on this site", () => {
    renderHome();
    const problems = within(screen.getByRole("region", { name: "What problem are you facing right now?" }));
    const cards = problems.getAllByRole("link").filter((link) => link.getAttribute("href")!.startsWith("/services/"));
    expect(cards.length).toBe(NEEDS.length);
    for (const card of cards) expect(card.textContent).toContain("The fix");
  });
});

describe("why us, in one band", () => {
  it("states the record from the brand settings and leads to the Experience page, without the logo strip", () => {
    renderHome();
    const why = screen.getByRole("region", { name: "Consultants who have fixed this before, at the size of your business." });
    for (const text of ["250+", "clients advised", "50+", "years of partner experience", "Since 2011", "sectors of the economy"]) expect(why.textContent).toContain(text);
    expect(within(why).getByRole("link", { name: /See our experience/ }).getAttribute("href")).toBe("/experience");
    expect(screen.queryByRole("list", { name: "Client logos" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Tarfa|Anago|Kurumi/i);
  });
});

describe("home page for keyboard users", () => {
  it("offers a skip link to the page's content first", () => {
    const { container } = renderHome();
    const skip = container.querySelector("a")!;
    expect(skip.textContent).toBe("Skip to content");
    expect(skip.getAttribute("href")).toBe("#main");
    expect(container.querySelector("main#main")).toBeTruthy();
  });
});

describe("home page footer", () => {
  it("links the Terms & Conditions and Privacy Policy in the footer", () => {
    const { container } = render(<Router hook={memoryLocation({ path: "/" }).hook}><Home /></Router>);
    const footer = container.querySelector("footer")!;
    expect(within(footer).getByRole("link", { name: "Terms & Conditions" }).getAttribute("href")).toBe("/terms");
    expect(within(footer).getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    expect(footer.querySelector("address")!.textContent).toBe(`IP Factory · ${BRAND.officeAddress.oneLine}`);
  });
});
