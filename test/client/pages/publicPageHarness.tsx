/** Shared set-up for the public pages' UI tests: jsdom stand-ins for scroll motion, and rendering a page at a path. */
import React from "react";
import { render } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

MotionGlobalConfig.skipAnimations = true;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;
window.scrollTo = () => undefined;

export const PRICES_MOCK = { trpc: { businessCheck: { prices: { useQuery: () => ({ data: { fullReport: 100_000, currentState: 600_000 } }) } } } };

export function renderAt(path: string, Page: React.ComponentType) {
  return render(<Router hook={memoryLocation({ path }).hook}><Page /></Router>);
}

/** Words the site never uses (AGENTS.md conventions). */
export const AVOIDED_WORDS = /what we sell|\b(door|sprint|playbook|retainer)\b/i;
