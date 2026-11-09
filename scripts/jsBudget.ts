/**
 * After `vite build`: fails the build when a public page's JavaScript passes the budget (R70, shared/performance.ts),
 * and prints each page's size so the next change can be compared.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { JS_BUDGET_BYTES, pageModuleFor, startupFiles, type Manifest } from "../shared/performance";
import { publicPages } from "../shared/seo";

const out = resolve(import.meta.dirname, "../dist/public");
const manifest = JSON.parse(readFileSync(join(out, ".vite/manifest.json"), "utf8")) as Manifest;
const gzipped = new Map<string, number>();
const sizeOf = (file: string) => {
  if (!gzipped.has(file)) gzipped.set(file, gzipSync(readFileSync(join(out, file)), { level: 9 }).length);
  return gzipped.get(file)!;
};
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

const byModule = new Map<string, string[]>();
for (const page of publicPages()) {
  const module = pageModuleFor(page.path);
  byModule.set(module, [...(byModule.get(module) ?? []), page.path]);
}
const over: string[] = [];
for (const [module, paths] of byModule) {
  const total = startupFiles(manifest, module).reduce((sum, file) => sum + sizeOf(file), 0);
  const label = paths.length > 1 ? `${paths[0]} and ${paths.length - 1} more` : paths[0];
  console.log(`js budget: ${label.padEnd(34)} ${kb(total).padStart(9)} of ${kb(JS_BUDGET_BYTES)}`);
  if (total > JS_BUDGET_BYTES) over.push(`${label} (${kb(total)})`);
}
if (over.length) {
  console.error(`js budget: over ${kb(JS_BUDGET_BYTES)} compressed: ${over.join(", ")}. Load less on these pages (R70).`);
  process.exit(1);
}
