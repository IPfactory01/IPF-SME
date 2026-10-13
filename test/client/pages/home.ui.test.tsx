/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
    for (const text of ["250+", "clients advised", "50+", "years of partner experience", "Since 2011", "major sector of the economy"]) expect(record.textContent).toContain(text);
  });

  it("explains the experience behind The Shift, linked from the navigation, without naming the group or its partners", () => {
    const { container } = renderHome();
    expect(screen.getByRole("link", { name: "Our experience" }).getAttribute("href")).toBe("#experience");
    const section = container.querySelector("#experience")!;
    expect(section.textContent).toContain("the delivery and method arm of an established Nigerian management consulting group");
    expect(section.textContent).toContain("The same method we use with larger clients. Run at the size and the price that fits your business.");
    expect(container.textContent).not.toMatch(/Enzo|Krypton|Tarfa|Anago|Kurumi/i);
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
