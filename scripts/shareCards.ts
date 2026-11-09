/**
 * Makes each public page's share card (R73, implementation plan D4): 1200×630, the page's own title on the brand card,
 * for WhatsApp, LinkedIn and X. The cards are kept in client/public (shared/seo.ts names each page's file), so the
 * build only copies them. Run it after changing a page's heading, a service's price or the brand:
 *
 *   pnpm share-cards
 *
 * It renders in Chromium (Playwright, as installed for the browser tests) with the site's own fonts.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { BRAND } from "../shared/brand";
import { publicPages, type ShareCard } from "../shared/seo";

const colour = BRAND.palette;
const publicDir = resolve(import.meta.dirname, "../client/public");
const logo = `data:image/webp;base64,${readFileSync(join(publicDir, BRAND.logoUrl)).toString("base64")}`;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The brand card, with the page's lines in the display face; the last line in italic, as on the home page. */
export function cardHtml(card: ShareCard) {
  const long = card.lines.join(" ").length > 46;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=Plus+Jakarta+Sans:wght@500;600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: "Plus Jakarta Sans", Arial, sans-serif; color: ${colour.ink};
    background: radial-gradient(circle at 8% 10%, ${colour["brand-plum"]}22, transparent 42%), radial-gradient(circle at 95% 92%, ${colour.highlight}33, transparent 40%), ${colour.paper}; }
  .rule { position: absolute; inset: 0 0 auto; height: 10px; background: linear-gradient(90deg, ${colour["brand-plum"]}, ${colour["highlight-ink"]}, ${colour.highlight}); }
  .card { position: absolute; inset: 64px 84px 56px; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; gap: 22px; }
  .top img { height: 76px; }
  .top span { border-left: 2px solid ${colour.line}; padding-left: 22px; font-size: 22px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${colour["ink-muted"]}; }
  .eyebrow { margin-top: 34px; font-size: 24px; font-weight: 700; color: ${colour["highlight-ink"]}; }
  h1 { margin-top: 10px; font-family: "Playfair Display", Georgia, serif; font-weight: 700; font-size: ${long ? 58 : 72}px; line-height: 1.04; letter-spacing: -0.01em; color: ${colour["brand-deep"]}; }
  h1 em { font-weight: 400; }
  h1 .last { display: inline; background: linear-gradient(${colour["highlight-ink"]}, ${colour["highlight-ink"]}) left bottom / 100% 6px no-repeat; padding-bottom: 4px; }
  .line { margin-top: 22px; max-width: 900px; font-size: 26px; line-height: 1.35; font-weight: 500; color: ${colour["ink-soft"]}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; }
  .site { font-size: 24px; font-weight: 700; color: ${colour["brand-deep"]}; }
  .badge { background: ${colour["brand-deep"]}; color: #fff; padding: 14px 26px; font-size: 22px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
</style></head><body>
<div class="rule"></div>
<div class="card">
  <div class="top"><img src="${logo}" alt=""><span>${escape(BRAND.productEndorsement)}</span></div>
  <p class="eyebrow">${escape(card.eyebrow)}</p>
  <h1>${card.lines.map((line, index) => (index === card.lines.length - 1 && card.lines.length > 1 ? `<em class="last">${escape(line)}</em>` : `${escape(line)}`)).join("<br>")}</h1>
  <p class="line">${escape(card.line)}</p>
  <div class="foot"><span class="site">www.ipfactory.co</span><span class="badge">${escape(card.badge)}</span></div>
</div>
</body></html>`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const site of publicPages()) {
    await page.setContent(cardHtml(site.card), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const file = join(publicDir, site.card.image);
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot(file.endsWith(".png") ? { path: file, type: "png" } : { path: file, type: "jpeg", quality: 84 });
  }
  await browser.close();
  console.log(`share cards: ${publicPages().length} written to client/public`);
}
