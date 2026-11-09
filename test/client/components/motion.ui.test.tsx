/** @vitest-environment jsdom */
/**
 * The public site's motion in CSS (design brief §8; R70): what starts below the first screen fades up when it scrolls
 * into view; what is in the first screen never waits; with "reduce motion" on nothing waits; and no public page loads
 * an animation library.
 */
import React from "react";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal, ScrollProgress, Stagger } from "@/components/motion";

let seen: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
let reduced = false;
beforeEach(() => {
  seen = null;
  reduced = false;
  globalThis.IntersectionObserver = class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { seen = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
  window.matchMedia = ((query: string) => ({ matches: reduced && /reduce/.test(query), media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const below = () => vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 2000, toJSON: () => ({}) });

describe("a reveal", () => {
  it("leaves what is in the first screen as it is: nothing there waits on an animation", () => {
    render(<Reveal><p>Seen at once</p></Reveal>);
    expect(screen.getByText("Seen at once").parentElement!.dataset.reveal).toBeUndefined();
    expect(seen).toBeNull();
  });

  it("holds what starts below the first screen until it scrolls into view, then shows it", () => {
    below();
    render(<Reveal><p>Further down</p></Reveal>);
    const box = screen.getByText("Further down").parentElement!;
    expect(box.dataset.reveal).toBe("waiting");
    act(() => seen!([{ isIntersecting: true }]));
    expect(box.dataset.reveal).toBe("shown");
  });

  it("brings a list's items in one after another, 0.07 s apart", () => {
    below();
    render(<Stagger as="ul"><li>One</li><li>Two</li><li>Three</li></Stagger>);
    expect(screen.getAllByRole("listitem").map(item => item.style.getPropertyValue("--reveal-delay"))).toEqual(["0.05s", "0.12s", "0.19s"]);
    expect(screen.getByRole("list").dataset.reveal).toBe("waiting");
  });

  it("holds nothing back for a visitor who asks for less motion", () => {
    reduced = true;
    below();
    render(<Reveal><p>Further down</p></Reveal>);
    expect(screen.getByText("Further down").parentElement!.dataset.reveal).toBeUndefined();
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\[data-reveal\], \[data-reveal\]\[data-stagger\] > \* \{ opacity: 1 !important; transform: none !important; transition: none !important; \}/);
  });
});

describe("the reading bar", () => {
  it("fills with how far down the page the visitor has read", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1000 });
    const { container } = render(<ScrollProgress />);
    expect((container.firstChild as HTMLElement).style.transform).toBe("scaleX(0.5)");
  });
});

describe("the public pages' code", () => {
  const files = (dir: string): string[] => readdirSync(resolve(process.cwd(), dir), { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
  it("loads no animation library: the check and the client room bring Framer Motion with their own code", () => {
    const publicCode = [
      ...["Home", "ServicesPage", "ProductPage", "HowWeWorkPage", "ExperiencePage", "GuidesPage", "AboutPage", "QuestionsPage", "ContactPage", "LegalPage", "CheckPage", "NotFound"].map(name => `client/src/pages/${name}.tsx`),
      ...files("client/src/components/home"), ...files("client/src/components/store"), ...files("client/src/components/check"),
      "client/src/components/motion.tsx", "client/src/components/SiteShell.tsx", "client/src/components/PageHero.tsx", "client/src/App.tsx", "client/src/Root.tsx", "client/src/main.tsx",
    ];
    for (const file of publicCode) {
      expect(existsSync(resolve(process.cwd(), file)), file).toBe(true);
      expect(readFileSync(resolve(process.cwd(), file), "utf8"), file).not.toMatch(/from "framer-motion"/);
    }
  });
});
