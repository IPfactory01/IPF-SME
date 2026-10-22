import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_PAGES } from "@/components/SiteShell";
import { MENU_PRODUCTS, servicePath } from "@shared/products";

const read = (file: string) => readFileSync(resolve(process.cwd(), "client", file), "utf8");
const ORIGIN = "https://www.ipfactory.co";

/** Every page a visitor can reach from the menu: the site's pages, the free check, each service and the legal pages. */
const PUBLIC_PATHS = ["/", ...SITE_PAGES.map((page) => page.href), "/check", ...MENU_PRODUCTS.map(servicePath), "/terms", "/privacy"];

describe("search engines and shared links", () => {
  it("lists every public page in the sitemap, and nothing else", () => {
    const listed = Array.from(read("public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
    expect(listed.sort()).toEqual(PUBLIC_PATHS.map((path) => `${ORIGIN}${path === "/" ? "/" : path}`).sort());
  });

  it("keeps signed-in, payment and staff pages out of search, and points to the sitemap", () => {
    const robots = read("public/robots.txt");
    for (const path of ["/admin", "/dashboard", "/settings", "/pay", "/report", "/portal"]) expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("gives shared links a title, a description and the 1200×630 card, and lets phones zoom", () => {
    const html = read("index.html");
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/brand/share-card.png" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toMatch(/<meta property="og:title" content="[^"]+" \/>/);
    const png = readFileSync(resolve(process.cwd(), "client/public/brand/share-card.png"));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    for (const page of ["index.html", "preview.html"]) expect(read(page)).not.toMatch(/maximum-scale|user-scalable=no/);
  });

  it("loads the heaviest font weight the headings use, so browsers never fake the bold", () => {
    expect(read("index.html")).toMatch(/Plus\+Jakarta\+Sans:wght@[\d;]*800/);
  });
});
