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
const { MENU_PRODUCTS } = await import("@shared/products");

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
    const link = screen.getByRole("link", { name: "Client sign in" });
    expect(link.getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still opens the JUMP participant sign-in for participants sent from their portal", () => {
    renderHome("/?participant_signin=1");
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("JUMP participant sign in");
    expect(dialog.querySelector('a[href="/login"]')).toBeTruthy();
  });
});

describe("home page: what we sell (Operational Business Plan, 22 October 2026)", () => {
  it("shows the four ways to buy, each product with its price linking to its page, and the way to the full menu", () => {
    renderHome();
    const ways = within(screen.getByRole("list", { name: "Ways to buy" }));
    expect(ways.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Assessment", "Done for You", "Six-Week Fix", "Monthly Service"]);
    for (const product of MENU_PRODUCTS) {
      const link = ways.getByRole("link", { name: new RegExp(`^${product.name.replace(/[()]/g, "\\$&")}`) });
      expect(link.getAttribute("href")).toBe(`/services/${product.slug}`);
    }
    expect(ways.getByRole("link", { name: /Free Business Health Check/ }).getAttribute("href")).toBe("/check");
    expect(ways.getByRole("link", { name: /Six-Week Fix₦1,500,000/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /See every service/ }).getAttribute("href")).toBe("/services");
  });

  it("answers the questions owners ask about the new menu, without promising consent it does not record", () => {
    const { container } = renderHome();
    const questions = container.querySelector("#questions")!.textContent!;
    expect(questions).toContain("What if you miss the delivery date?");
    expect(questions).toContain("How do I pay?");
    expect(questions).not.toMatch(/only with your consent|stays between you and your/);
  });

  it("tells smaller and larger owners where to start with products that exist", () => {
    const { container } = renderHome();
    const forWhom = container.querySelector("#for")!.textContent!;
    expect(forWhom).toContain("a Done for You product, from ₦300,000");
    expect(forWhom).toContain("Start with a Business Review");
    expect(forWhom).not.toMatch(/training timetable|Advisory\./);
  });
});

describe("home page track record", () => {
  it("states the track record from the brand settings, under the hero", () => {
    renderHome();
    const record = screen.getByRole("region", { name: "Our track record" });
    for (const text of ["250+", "clients advised", "50+", "years of partner experience", "Since 2011", `${BRAND.trackRecord.sectors.length}`, "sectors of the economy"]) expect(record.textContent).toContain(text);
  });

  it("names the parent firm and the sectors, links the firm when its address is set, and never names a partner", () => {
    const { container } = renderHome();
    expect(screen.getByRole("link", { name: "What we sell" }).getAttribute("href")).toBe("#services");
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

  it("backs the problem with sourced figures, in the site's words", () => {
    const { container } = renderHome();
    const problem = container.querySelector("#problem")!;
    expect(problem.textContent).toContain("They fail between knowing and doing.");
    for (const source of ["PwC MSME Survey, 2024", "World Bank, Nigeria, 2022", "Field trial of 852 owners, 2018"]) expect(problem.textContent).toContain(source);
    const added = `${problem.textContent} ${container.querySelector("#experience")!.textContent}`;
    expect(added).not.toMatch(/\b(framework|strategic|solutions?|leverage|holistic|playbook|sprint|retainer|door)\b/i);
  });
});

describe("home page on touch screens", () => {
  it("shows the \"That's me\" prompt on every owner quote where there is no hover, not only on mouse hover", () => {
    const { container } = renderHome();
    const prompts = Array.from(container.querySelectorAll("#problem button span")).filter((span) => span.textContent?.includes("That's me"));
    expect(prompts.length).toBe(4);
    for (const prompt of prompts) expect(prompt.className).toContain("[@media(hover:none)]:opacity-100");
  });

  it("links the Terms & Conditions and Privacy Policy in the footer", () => {
    const { container } = render(<Router hook={memoryLocation({ path: "/" }).hook}><Home /></Router>);
    const footer = container.querySelector("footer")!;
    expect(within(footer).getByRole("link", { name: "Terms & Conditions" }).getAttribute("href")).toBe("/terms");
    expect(within(footer).getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });
});
