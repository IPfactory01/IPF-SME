import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "@shared/brand";
import { MENU_PRODUCTS, productById, servicePath } from "@shared/products";
import { faqJsonLd, organisationJsonLd, pageHtml, PAGE_META, publicPages, serviceJsonLd, SITE_ORIGIN } from "@shared/seo";

const template = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
const scripts = (html: string) => Array.from(html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g), (match) => JSON.parse(match[1]) as Record<string, unknown>);

describe("what search engines and link previews read", () => {
  it("writes a page for every address in the sitemap, each with its own title and description", () => {
    const sitemap = Array.from(readFileSync(resolve(process.cwd(), "client/public/sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
    const pages = publicPages();
    expect(pages.map((page) => `${SITE_ORIGIN}${page.path}`).sort()).toEqual(sitemap.sort());
    expect(new Set(pages.map((page) => page.title)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.description)).size).toBe(pages.length);
    for (const page of pages) expect(page.description.length, page.path).toBeLessThanOrEqual(300);
  });

  it("gives a service page its own title, description, canonical address, share details and words", () => {
    const product = productById("cash_flow_forecast")!;
    const html = pageHtml(template, publicPages().find((page) => page.path === servicePath(product))!);
    const url = `${SITE_ORIGIN}${servicePath(product)}`;
    expect(html).toContain("<title>13-Week Cash Flow Forecast | The Shift, by IP Factory</title>");
    expect(html).toMatch(/<meta name="description" content="[^"]*₦300,000[^"]*" \/>/);
    expect(html).toContain(`<link rel="canonical" href="${url}" />`);
    expect(html).toContain(`<meta property="og:url" content="${url}" />`);
    expect(html).toContain('<meta property="og:title" content="13-Week Cash Flow Forecast | The Shift, by IP Factory" />');
    expect(html).toMatch(/<div id="root"><div class="sr-only"><h1>See the cash crunch before it comes\.<\/h1>/);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("keeps the home page's own title and the address of the site", () => {
    const html = pageHtml(template, publicPages()[0]);
    expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/" />`);
    expect(html).toContain(`<title>${BRAND.productEndorsement} · ${BRAND.productTagline}</title>`);
  });

  it("describes IP Factory as a business in Lekki serving all of Nigeria, on every page", () => {
    for (const page of publicPages()) {
      const org = scripts(pageHtml(template, page)).find((data) => data["@type"] === "ProfessionalService");
      expect(org, page.path).toBeTruthy();
    }
    const org = organisationJsonLd();
    expect(org.address).toEqual({ "@type": "PostalAddress", streetAddress: "5 C&I Leasing Drive", addressLocality: "Lekki Phase 1", addressRegion: "Lagos State", addressCountry: "NG" });
    expect(org.email).toBe(BRAND.businessSupportMailbox);
    expect(org.areaServed).toEqual({ "@type": "Country", name: "Nigeria" });
  });

  it("gives each service its price in naira, and the Questions page every question once", () => {
    for (const product of MENU_PRODUCTS) {
      const service = serviceJsonLd(product);
      expect(service.offers.priceCurrency).toBe("NGN");
      expect(service.offers.price, product.id).toBeGreaterThan(0);
    }
    expect(serviceJsonLd(productById("six_week_fix")!).offers.price).toBe(1_500_000);
    const questions = scripts(pageHtml(template, publicPages().find((page) => page.path === "/questions")!)).find((data) => data["@type"] === "FAQPage")!;
    const names = (questions.mainEntity as { name: string }[]).map((item) => item.name);
    expect(names).toContain("How do I pay?");
    expect(new Set(names).size).toBe(names.length);
    expect(faqJsonLd([{ q: "A?", a: "One." }, { q: "A?", a: "Two." }]).mainEntity).toHaveLength(1);
  });

  it("cannot be broken out of by the words it carries", () => {
    const html = pageHtml(template, { path: "/x", title: 'A "quoted" <title>', description: "</script><script>alert(1)</script>", heading: "<b>", body: [], jsonLd: [{ text: "</script><!--" }] });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("\\u003c/script>\\u003c!--");
    expect(html).toContain('content="A &quot;quoted&quot; &lt;title&gt; | The Shift, by IP Factory"');
  });

  it("uses the same titles on the pages as in the ready-made HTML", () => {
    const sources: Record<string, keyof typeof PAGE_META> = { ServicesPage: "services", HowWeWorkPage: "howWeWork", AboutPage: "about", QuestionsPage: "questions", ContactPage: "contact", BusinessCheck: "check", LoginPage: "login" };
    for (const [file, key] of Object.entries(sources)) {
      expect(readFileSync(resolve(process.cwd(), `client/src/pages/${file}.tsx`), "utf8"), file).toContain(`usePageMeta(PAGE_META.${key}.title, PAGE_META.${key}.description)`);
    }
  });
});

describe("how the build and the host serve those pages", () => {
  it("writes the ready-made pages after the client build, and serves every other address from the untouched app shell", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toMatch(/^vite build && tsx scripts\/prerender\.ts && /);
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { rewrites: { source: string; destination: string }[] };
    expect(vercel.rewrites.at(-1)).toEqual({ source: "/(.*)", destination: "/app.html" });
  });
});
