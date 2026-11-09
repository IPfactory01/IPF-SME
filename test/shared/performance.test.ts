import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { JS_BUDGET_BYTES, pageModuleFor, startupFiles, type Manifest } from "@shared/performance";
import { publicPages } from "@shared/seo";

/** The speed budget for public pages (R70, plan D1). */
describe("the JavaScript a public page loads at the start", () => {
  const manifest: Manifest = {
    "index.html": { file: "assets/index.js", isEntry: true, imports: ["_react.js"], css: ["assets/index.css"] },
    "_react.js": { file: "assets/react.js" },
    "_shell.js": { file: "assets/shell.js", imports: ["_react.js"] },
    "src/pages/Home.tsx": { file: "assets/Home.js", isDynamicEntry: true, imports: ["index.html", "_shell.js"] },
    "src/pages/Admin.tsx": { file: "assets/Admin.js", isDynamicEntry: true, imports: ["_shell.js"] },
    // A page whose chunk other code shares is keyed by its name.
    "_CheckPage-x.js": { file: "assets/CheckPage.js", name: "CheckPage", isDynamicEntry: true, imports: ["index.html"] },
  };

  it("counts the entry, the page and everything they import, each once, and nothing the page loads later", () => {
    expect(startupFiles(manifest, "src/pages/Home.tsx").sort()).toEqual(["assets/Home.js", "assets/index.js", "assets/react.js", "assets/shell.js"]);
    expect(startupFiles(manifest, "src/pages/CheckPage.tsx").sort()).toEqual(["assets/CheckPage.js", "assets/index.js", "assets/react.js"]);
    expect(() => startupFiles(manifest, "src/pages/Missing.tsx")).toThrow(/no chunk/);
  });

  it("is 170 KB compressed, checked for every public address in the build", () => {
    expect(JS_BUDGET_BYTES).toBe(170 * 1024);
    for (const page of publicPages()) expect(pageModuleFor(page.path), page.path).toMatch(/^src\/pages\/\w+\.tsx$/);
    expect(() => pageModuleFor("/dashboard")).toThrow();
    const build = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")).scripts.build as string;
    expect(build).toMatch(/vite build && vite build --config vite\.ssr\.config\.ts && tsx scripts\/jsBudget\.ts && tsx scripts\/prerender\.ts/);
  });

  it("names each public page's file as App.tsx loads it, so the budget measures the code the site really sends", () => {
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    for (const page of publicPages()) {
      const module = pageModuleFor(page.path).replace(/^src\//, "./").replace(/\.tsx$/, "");
      expect(app, page.path).toContain(`import("${module}")`);
    }
  });
});
