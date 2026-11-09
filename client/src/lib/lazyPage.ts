/**
 * A page whose code loads only when someone opens it (R70: each public page loads its own code). Unlike React.lazy on
 * its own, a page that has already been loaded renders straight away, so the browser can take over a page rendered at
 * build time (scripts/prerender.ts) without a loading state in between: main.tsx preloads the current address's page,
 * then hydrates.
 */
import { createElement, lazy, type ComponentType } from "react";

// A page takes its own props (often none, sometimes the route's parameters), so the loader accepts any component.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = ComponentType<any>;
export type LazyPage = AnyPage & { preload: () => Promise<unknown> };

export function lazyPage(load: () => Promise<{ default: AnyPage }>): LazyPage {
  let loaded: AnyPage | null = null;
  let pending: Promise<{ default: AnyPage }> | null = null;
  const preload = () => {
    pending ??= load().then(module => {
      loaded = module.default;
      return module;
    });
    return pending;
  };
  const Lazy = lazy(preload);
  const Page = (props: object) => createElement(loaded ?? Lazy, props);
  return Object.assign(Page, { preload });
}

/** The first route whose pattern matches the address, as wouter's Switch picks it: "/guides/:slug" matches "/guides/x". */
export function matchesPath(pattern: string, path: string) {
  const want = pattern.split("/").filter(Boolean);
  const have = path.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
  return want.length === have.length && want.every((part, index) => part.startsWith(":") || part === have[index]);
}
