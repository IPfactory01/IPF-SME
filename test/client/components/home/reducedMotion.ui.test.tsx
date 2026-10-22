/** @vitest-environment jsdom */

import React from "react";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";

MotionGlobalConfig.skipAnimations = true;
// This file runs as a visitor who has turned on "reduce motion". Framer Motion reads the setting once, so the file stands alone.
window.matchMedia = ((query: string) => ({ matches: /reduced-motion/.test(query), media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;

const { Hero } = await import("@/components/home/HomeSections");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the home page with reduce motion on", () => {
  it("keeps the hero's sentence still instead of changing it every few seconds, and stops the pulsing dot", () => {
    vi.useFakeTimers();
    const { container } = render(<Hero onStart={() => undefined} />);
    const sentence = screen.getByRole("button", { name: "Start the Business Health Check" }).textContent;
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole("button", { name: "Start the Business Health Check" }).textContent).toBe(sentence);
    expect(container.querySelector(".animate-ping")).toBeNull();
    expect(container.querySelector('[class*="motion-safe:animate-ping"]')).toBeTruthy();
  });
});

describe("the site's glass headers and the client room's tab bar", () => {
  const css = readFileSync("client/src/index.css", "utf8");
  it("turn solid for people who ask for less transparency, and gain a firm edge for people who ask for more contrast", () => {
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{\s*header\[class\*="backdrop-blur"\],\s*\[data-room-tabs\]\s*\{[^}]*backdrop-filter: none;[^}]*background-color: var\(--color-paper\);/);
    expect(css).toMatch(/@media \(prefers-contrast: more\)\s*\{\s*header\[class\*="backdrop-blur"\],\s*\[data-room-tabs\]\s*\{[^}]*backdrop-filter: none;[^}]*border-bottom-color: var\(--color-ink-muted\);/);
  });
});
