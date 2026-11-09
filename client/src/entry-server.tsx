/**
 * Renders a public page to HTML at build time (scripts/prerender.ts, R70): the page as a visitor first sees it, so its
 * words and layout show before the site's code has downloaded. Nothing is fetched: anything that waits on the server
 * (prices, for example) renders as it does in the browser's first moment, from the defaults.
 */
import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { renderToString } from "react-dom/server";
import superjson from "superjson";
import { preloadPage } from "./App";
import { trpc } from "./lib/trpc";
import { Root } from "./Root";

export async function render(path: string): Promise<string> {
  await preloadPage(path);
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: "http://prerender.invalid/api/trpc", transformer: superjson })] });
  const html = renderToString(<Root queryClient={queryClient} trpcClient={trpcClient} ssrPath={path} />);
  // A page that waited on code or data at build time would arrive as its loading state; the build stops instead.
  if (html.includes("<!--$?-->") || html.includes("<!--$!-->") || html.includes('aria-busy="true"')) throw new Error(`${path} rendered a loading state at build time`);
  return html;
}
