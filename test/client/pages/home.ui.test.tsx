/** @vitest-environment jsdom */

import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
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
    const problems = within(screen.getByRole("region", { name: /Tell us what it feels like/ }));
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
    const how = within(screen.getByRole("region", { name: "Find it. Fix it. See the results." }));
    expect(how.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Find it", "Fix it", "See the results"]);
    expect(how.getByRole("link", { name: /How we work/ }).getAttribute("href")).toBe("/how-we-work");
  });

  it("backs the promise with sourced figures, in the site's words, and links to About", () => {
    const { container } = renderHome();
    const evidence = container.querySelector("#evidence")!;
    expect(evidence.textContent).toContain("They fail between knowing and doing.");
    for (const source of ["PwC MSME Survey, 2024", "World Bank, Nigeria, 2022", "Field trial of 852 owners, 2018"]) expect(evidence.textContent).toContain(source);
    expect(within(evidence as HTMLElement).getByRole("link", { name: /About/ }).getAttribute("href")).toBe("/about");
    expect(container.textContent).not.toMatch(/\b(framework|strategic|solutions?|leverage|holistic|playbook|sprint|retainer|door)\b/i);
  });
});

describe("home page track record", () => {
  it("states the track record from the brand settings, under the hero", () => {
    renderHome();
    const record = screen.getByRole("region", { name: "Our track record" });
    for (const text of ["250+", "clients advised", "50+", "years of partner experience", "Since 2011", `${BRAND.trackRecord.sectors.length}`, "sectors of the economy"]) expect(record.textContent).toContain(text);
    expect(document.body.textContent).not.toMatch(/Tarfa|Anago|Kurumi/i);
  });

  it("names clients once, in the logo strip, not again as cards further down the page", () => {
    renderHome();
    expect(screen.queryByRole("list", { name: "Clients we have worked with" })).toBeNull();
    expect(screen.queryByText(/Named with their agreement/)).toBeNull();
  });

  it("shows the client logos, each file on the site and named for screen readers, as work done rather than an endorsement", () => {
    renderHome();
    const logos = within(screen.getByRole("list", { name: "Client logos" })).getAllByRole("img");
    expect(logos.map((logo) => logo.getAttribute("aria-label"))).toEqual(BRAND.trackRecord.clientLogos.map((client) => client.name));
    // The colour version only cross-fades in under a mouse; screen readers hear each name once.
    for (const tile of within(screen.getByRole("list", { name: "Client logos" })).getAllByRole("listitem")) {
      expect(tile.querySelector("img")!.getAttribute("aria-hidden")).toBe("true");
    }
    expect(screen.getByText(`The team behind ${BRAND.productName} has worked with`)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Client logos" }).parentElement!.textContent).not.toMatch(/trusted|partner|endorse/i);
    expect(new Set(BRAND.trackRecord.clientLogos.map((client) => client.name)).size).toBe(BRAND.trackRecord.clientLogos.length);
    for (const client of BRAND.trackRecord.clientLogos) {
      for (const file of [client.src, client.mono]) {
        const path = resolve(process.cwd(), "client/public", file.slice(1));
        expect(existsSync(path)).toBe(true);
        // width and height must be the file's real pixel size, or the optical sizing is wrong (PNG header, IHDR).
        const header = readFileSync(path);
        expect([header.readUInt32BE(16), header.readUInt32BE(20)]).toEqual([client.width, client.height]);
      }
    }
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
