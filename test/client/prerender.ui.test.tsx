/** @vitest-environment jsdom */
/**
 * The public pages as the build writes them (client/src/entry-server.tsx, scripts/prerender.ts; R70, R73): every page
 * renders whole at build time, with nothing hidden or loading, one main heading of its own, and the browser's code
 * takes the HTML over as it stands (hydration) instead of drawing it again.
 */
import React from "react";
import { act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import superjson from "superjson";
import { describe, expect, it } from "vitest";

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
window.scrollTo = () => undefined;

const { preloadPage } = await import("@/App");
const { Root } = await import("@/Root");
const { trpc } = await import("@/lib/trpc");
const { publicPages } = await import("@shared/seo");

// Nothing answers: a read stays loading, as it is in the browser's first moment and at build time.
const clients = () => ({
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  trpcClient: trpc.createClient({ links: [httpBatchLink({ url: "http://test.invalid/api/trpc", transformer: superjson, fetch: () => new Promise<Response>(() => undefined) })] }),
});

async function built(path: string) {
  await preloadPage(path);
  const { queryClient, trpcClient } = clients();
  return renderToString(<Root queryClient={queryClient} trpcClient={trpcClient} ssrPath={path} />);
}

const squash = (text: string) => text.replace(/\s+/g, "");
const headingsOf = (html: string) => {
  const doc = document.createElement("div");
  doc.innerHTML = html;
  return Array.from(doc.querySelectorAll("h1"), (heading) => heading.textContent ?? "");
};

describe("the public pages as the build writes them", () => {
  it("renders every page whole: nothing waits on code or data, and nothing in the first screen is hidden for an animation (R70)", async () => {
    for (const page of publicPages()) {
      const html = await built(page.path);
      expect(html, page.path).not.toMatch(/<!--\$[?!]-->|aria-busy="true"/);
      // Hidden-until-animated content (opacity 0 in the HTML) would make the page look empty until the code arrives.
      expect(html, page.path).not.toMatch(/opacity:\s*0[;"]/);
      expect(html, page.path).not.toContain("data-reveal");
    }
  });

  it("gives every page one main heading, its own, the one search engines are told about (R73)", async () => {
    const seen = new Map<string, string>();
    for (const page of publicPages()) {
      const headings = headingsOf(await built(page.path));
      expect(headings, page.path).toHaveLength(1);
      expect(squash(headings[0]!), page.path).toBe(squash(page.heading));
      expect(seen.get(headings[0]!), `${page.path} repeats the main heading of ${seen.get(headings[0]!)}`).toBeUndefined();
      seen.set(headings[0]!, page.path);
    }
    // The promise is the home page's heading, and only the home page's.
    expect(seen.get("Find it. Fix it. See the shift.")).toBe("/");
  });

  it("is taken over by the browser as it stands, with no page drawn again (R70)", async () => {
    for (const page of publicPages()) {
      const html = await built(page.path);
      window.history.replaceState(null, "", page.path);
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      const heading = container.querySelector("h1");
      const problems: unknown[] = [];
      const { queryClient, trpcClient } = clients();
      let root: ReturnType<typeof hydrateRoot> | undefined;
      await act(async () => {
        root = hydrateRoot(container, <Root queryClient={queryClient} trpcClient={trpcClient} />, { onRecoverableError: (error) => problems.push(error) });
      });
      expect(problems, page.path).toEqual([]);
      // The same heading element, not a new one: React kept the HTML instead of replacing it.
      if (page.path !== "/check") expect(container.querySelector("h1"), page.path).toBe(heading);
      await act(async () => root!.unmount());
      container.remove();
    }
  });
});
