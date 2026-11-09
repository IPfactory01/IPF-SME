/**
 * The speed budget for public pages (R70, implementation plan D1): the JavaScript a public page loads before it can be
 * used, compressed, must stay within JS_BUDGET_BYTES. `pnpm build` checks every public address (scripts/jsBudget.ts)
 * and fails over it. A page's JavaScript is the site's entry with everything it imports, plus the page's own code with
 * everything that imports; code loaded once the page is up (the notices, the check's questions) does not count.
 */
export const JS_BUDGET_BYTES = 170 * 1024;

/** The source file of each public address's page, as App.tsx loads it. */
export function pageModuleFor(path: string): string {
  if (path === "/") return "src/pages/Home.tsx";
  if (path === "/check") return "src/pages/CheckPage.tsx";
  if (path === "/services") return "src/pages/ServicesPage.tsx";
  if (path.startsWith("/services/")) return "src/pages/ProductPage.tsx";
  if (path === "/how-we-work") return "src/pages/HowWeWorkPage.tsx";
  if (path === "/experience") return "src/pages/ExperiencePage.tsx";
  if (path === "/guides" || path.startsWith("/guides/")) return "src/pages/GuidesPage.tsx";
  if (path === "/about") return "src/pages/AboutPage.tsx";
  if (path === "/questions") return "src/pages/QuestionsPage.tsx";
  if (path === "/contact") return "src/pages/ContactPage.tsx";
  if (path === "/terms" || path === "/privacy") return "src/pages/LegalPage.tsx";
  throw new Error(`No page module is listed for the public address ${path}`);
}

export type ManifestChunk = { file: string; name?: string; src?: string; imports?: string[]; isEntry?: boolean; isDynamicEntry?: boolean; css?: string[] };
export type Manifest = Record<string, ManifestChunk>;

/** The JavaScript files a page loads at the start: the entry's and the page's static imports, each once. */
export function startupFiles(manifest: Manifest, pageModule: string): string[] {
  const entry = Object.keys(manifest).find(key => manifest[key]!.isEntry);
  if (!entry) throw new Error("The build manifest has no entry");
  // A page's chunk is keyed by its source file, unless other code shares the chunk: then it is keyed by its own name.
  const name = pageModule.split("/").pop()!.replace(/\.tsx?$/, "");
  const page = manifest[pageModule] ? pageModule : Object.keys(manifest).find(key => manifest[key]!.isDynamicEntry && manifest[key]!.name === name);
  if (!page) throw new Error(`The build manifest has no chunk for ${pageModule}`);
  const seen = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const next of manifest[key]?.imports ?? []) visit(next);
  };
  visit(entry);
  visit(page);
  return Array.from(seen, key => manifest[key]!.file).filter(file => file.endsWith(".js"));
}
