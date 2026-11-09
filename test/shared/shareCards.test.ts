import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pageHtml, publicPages, SITE_ORIGIN } from "@shared/seo";

/** Width and height of a PNG or a JPEG, read from the file itself. */
function size(file: Buffer): [number, number] {
  if (file.readUInt32BE(0) === 0x89504e47) return [file.readUInt32BE(16), file.readUInt32BE(20)];
  for (let at = 2; at < file.length;) {
    const marker = file.readUInt16BE(at);
    if (marker === 0xffc0 || marker === 0xffc2) return [file.readUInt16BE(at + 7), file.readUInt16BE(at + 5)];
    at += 2 + file.readUInt16BE(at + 2);
  }
  throw new Error("not a JPEG or PNG");
}

const template = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

/** A share card for every page (R73, plan D4), made by scripts/shareCards.ts. */
describe("each public page's share card", () => {
  it("is its own: one 1200×630 card per page, none shared, each in the site's public files", () => {
    const pages = publicPages();
    expect(new Set(pages.map((page) => page.card.image)).size).toBe(pages.length);
    for (const page of pages) {
      const file = resolve(process.cwd(), "client/public", page.card.image.slice(1));
      expect(existsSync(file), `${page.path}: run pnpm share-cards`).toBe(true);
      expect(size(readFileSync(file)), page.path).toEqual([1200, 630]);
    }
  });

  it("is what a shared link to the page shows on WhatsApp, LinkedIn and X", () => {
    for (const page of publicPages()) {
      const html = pageHtml(template, page);
      expect(html, page.path).toContain(`<meta property="og:image" content="${SITE_ORIGIN}${page.card.image}" />`);
      expect(html, page.path).toContain(`<meta name="twitter:image" content="${SITE_ORIGIN}${page.card.image}" />`);
      expect(html.match(/property="og:image"/g), page.path).toHaveLength(1);
    }
  });

  it("carries the page's own main heading and a line that fits on two lines of the card", () => {
    for (const page of publicPages()) {
      expect(page.card.lines.join("").replace(/\s+/g, ""), page.path).toBe(page.heading.replace(/\s+/g, ""));
      expect(page.card.line.length, page.path).toBeLessThanOrEqual(120);
      expect(page.card.line, page.path).toMatch(/[.?!]$/);
    }
    // A service's card shows its price; the check's does not repeat its own name.
    expect(publicPages().find((page) => page.path === "/services/13-week-cash-flow-forecast")!.card.badge).toBe("₦300,000");
    const check = publicPages().find((page) => page.path === "/check")!.card;
    expect([check.eyebrow, check.badge]).not.toContain("Free Business Health Check");
  });

  it("takes its colours from the brand settings, not from the script", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/shareCards.ts"), "utf8");
    expect(script).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(script).toContain("BRAND.palette");
  });
});
