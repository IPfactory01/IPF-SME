/** @vitest-environment jsdom */

import React from "react";
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
    registration: { requestPortalLink: { useMutation: mutation } },
    participant: { signIn: { useMutation: mutation } },
  },
}));

const { default: Home } = await import("@/pages/Home");
const { BRAND } = await import("@shared/brand");

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

describe("home page track record", () => {
  it("states the track record from the brand settings, under the hero", () => {
    renderHome();
    const record = screen.getByRole("region", { name: "Our track record" });
    for (const text of ["250+", "clients advised", "50+", "years of partner experience", "Since 2011", `${BRAND.trackRecord.sectors.length}`, "sectors of the economy"]) expect(record.textContent).toContain(text);
  });

  it("names the parent firm and the sectors, links the firm when its address is set, and never names a partner", () => {
    const { container } = renderHome();
    expect(screen.getByRole("link", { name: "Our experience" }).getAttribute("href")).toBe("#experience");
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

  it("lists the clients named with their agreement, each with its sector and the work, and no client figures", () => {
    renderHome();
    const items = within(screen.getByRole("list", { name: "Clients we have worked with" })).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")!.textContent)).toEqual(BRAND.trackRecord.namedClients.map((client) => client.name));
    expect(items.map((item) => item.textContent)).toEqual(BRAND.trackRecord.namedClients.map((client) => `${client.name}${client.sector}${client.work}`));
    for (const item of items) expect(item.textContent).not.toMatch(/₦|\$|\d+%/);
    expect(screen.getByText(/Named with their agreement\./).textContent).toBe(`And more than 250 businesses since ${BRAND.trackRecord.since}. Named with their agreement.`);
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
});
