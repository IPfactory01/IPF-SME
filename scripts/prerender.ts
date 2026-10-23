/**
 * After `vite build`: writes a ready-made page for each public address (shared/seo.ts), so link previews and search
 * engines that do not run JavaScript see that page's own title, description, share card, structured data and words.
 * The untouched build is kept as app.html, the shell every other address (sign-in, the room, admin) is served from.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pageHtml, publicPages } from "../shared/seo";

const out = resolve(import.meta.dirname, "../dist/public");
const template = readFileSync(join(out, "index.html"), "utf8");
writeFileSync(join(out, "app.html"), template);
for (const page of publicPages()) {
  const file = page.path === "/" ? join(out, "index.html") : join(out, page.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, pageHtml(template, page));
}
console.log(`prerender: ${publicPages().length} public pages written, app.html kept for the rest`);
