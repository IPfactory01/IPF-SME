/**
 * After `vite build` and the build-time render (vite.ssr.config.ts): writes a ready-made page for each public address
 * (shared/seo.ts). Each holds the page itself, rendered as a visitor first sees it (R70), with its own title,
 * description, share card and structured data, and preloads the code that page needs, so its words show before any
 * code runs and the code arrives in one round. The untouched build is kept as app.html, the shell every other address
 * (sign-in, the room, admin) is served from.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pageModuleFor, startupFiles, type Manifest } from "../shared/performance";
import { pageHtml, publicPages } from "../shared/seo";

const out = resolve(import.meta.dirname, "../dist/public");
const template = readFileSync(join(out, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(out, ".vite/manifest.json"), "utf8")) as Manifest;
const { render } = (await import(pathToFileURL(resolve(import.meta.dirname, "../dist/ssr/entry-server.js")).href)) as { render: (path: string) => Promise<string> };

writeFileSync(join(out, "app.html"), template);
for (const page of publicPages()) {
  const file = page.path === "/" ? join(out, "index.html") : join(out, page.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  const html = await render(page.path);
  writeFileSync(file, pageHtml(template, page, { html, preload: startupFiles(manifest, pageModuleFor(page.path)) }));
}
console.log(`prerender: ${publicPages().length} public pages rendered, app.html kept for the rest`);
