import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "@shared/brand";
import { MENU_PRODUCTS, productById, servicePath } from "@shared/products";
import { faqJsonLd, organisationJsonLd, pageHtml, PAGE_META, publicPages, serviceJsonLd, SITE_ORIGIN, structuredDataFor } from "@shared/seo";

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
    expect(html).toContain("<title>13-Week Cash Flow Forecast: fix cash flow problems before they land | The Shift, by IP Factory</title>");
    expect(html).toMatch(/<meta name="description" content="[^"]*₦800,000[^"]*" \/>/);
    expect(html).toContain(`<link rel="canonical" href="${url}" />`);
    expect(html).toContain(`<meta property="og:url" content="${url}" />`);
    expect(html).toContain('<meta property="og:title" content="13-Week Cash Flow Forecast: fix cash flow problems before they land | The Shift, by IP Factory" />');
    expect(html).toMatch(/<div id="root"><div class="sr-only"><h1>See the cash crunch before it comes\.<\/h1>/);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("keeps the home page's own title and the address of the site", () => {
    const html = pageHtml(template, publicPages()[0]);
    expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/" />`);
    // The home page's title is the search owners make: a small business consultant, in Lagos, Nigeria.
    expect(html).toContain(`<title>Small Business Consultant in Lagos, Nigeria | ${BRAND.productEndorsement}</title>`);
    expect(template).toContain(`<title>Small Business Consultant in Lagos, Nigeria | ${BRAND.productEndorsement}</title>`);
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
    expect(serviceJsonLd(productById("six_week_fix")!).offers.price).toBe(2_000_000);
    const questions = scripts(pageHtml(template, publicPages().find((page) => page.path === "/questions")!)).find((data) => data["@type"] === "FAQPage")!;
    const names = (questions.mainEntity as { name: string }[]).map((item) => item.name);
    expect(names).toContain("How do I pay?");
    expect(new Set(names).size).toBe(names.length);
    expect(faqJsonLd([{ q: "A?", a: "One." }, { q: "A?", a: "Two." }]).mainEntity).toHaveLength(1);
  });

  it("carries the page itself when it was rendered at build time, and fetches that page's own code at once (R70)", () => {
    const page = publicPages().find((item) => item.path === "/about")!;
    const entry = template.match(/src="\/(assets\/[^"]+\.js)"/)?.[1] ?? "assets/index.js";
    const html = pageHtml(template, page, { html: "<main><h1>Consulting experience</h1></main>", preload: [entry, "assets/AboutPage-x.js"] });
    expect(html).toContain('<div id="root" data-prerendered><main><h1>Consulting experience</h1></main></div>');
    expect(html).not.toContain('class="sr-only"');
    expect(html).toContain('<link rel="modulepreload" crossorigin href="/assets/AboutPage-x.js" />');
    expect(html.match(/modulepreload" crossorigin href="\/assets\/AboutPage-x\.js"/g)).toHaveLength(1);
  });

  it("cannot be broken out of by the words it carries", () => {
    const card = { image: "/share/x.jpg", eyebrow: "", lines: ['"><script>alert(2)</script>'], line: "", badge: "" };
    const html = pageHtml(template, { path: "/x", title: 'A "quoted" <title>', description: "</script><script>alert(1)</script>", heading: "<b>", body: [], jsonLd: [{ text: "</script><!--" }], card });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<script>alert(2)");
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
    // The pages are rendered at build time (vite.ssr.config.ts) and written once the speed budget passes.
    expect(pkg.scripts.build).toMatch(/^vite build && vite build --config vite\.ssr\.config\.ts && tsx scripts\/jsBudget\.ts && tsx scripts\/prerender\.ts && /);
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { rewrites: { source: string; destination: string }[] };
    expect(vercel.rewrites.at(-1)).toEqual({ source: "/(.*)", destination: "/app.html" });
    // Each public address is sent to its ready-made page by name, before the catch-all, so the host never has to guess.
    const pages = vercel.rewrites.filter((rule) => rule.destination.endsWith("/index.html"));
    expect(pages).toEqual(publicPages().filter((page) => page.path !== "/").map((page) => ({ source: page.path, destination: `${page.path}/index.html` })));
    expect(vercel.rewrites.indexOf(pages.at(-1)!)).toBe(vercel.rewrites.length - 2);
  });

  it("tells the host to run the whole build and serve dist/public, so app.html and the ready-made pages exist there", () => {
    // Without this the host can fall back to its framework default (vite build alone): no prerender, no app.html, and
    // every address that is not a public page (/admin, /login, the room) answers with the host's own 404.
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { buildCommand?: string; outputDirectory?: string };
    expect(vercel.buildCommand).toBe("pnpm build");
    expect(vercel.outputDirectory).toBe("dist/public");
  });

  it("visits /api/health once a day, so the database is used and a free Supabase project is not paused for inactivity, and runs the reminders each morning at 07:31 Lagos (R12, R16)", () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { crons?: { path: string; schedule: string }[] };
    expect(vercel.crons).toEqual([{ path: "/api/health", schedule: "17 6 * * *" }, { path: "/api/scheduled/reminders", schedule: "31 6 * * *" }]);
  });

  it("adds breadcrumbs Google can show: Home › Services › the service, and Home › the page", () => {
    const crumbs = (path: string) => (structuredDataFor(path).find((data) => (data as { "@type": string })["@type"] === "BreadcrumbList") as { itemListElement: { name: string; item: string }[] } | undefined)?.itemListElement.map((step) => step.name);
    expect(crumbs("/services/six-week-fix")).toEqual(["Home", "Services", "Six-Week Fix"]);
    expect(crumbs("/services/six-week-fix/")).toEqual(["Home", "Services", "Six-Week Fix"]);
    expect(crumbs("/about")).toEqual(["Home", "About"]);
    expect(crumbs("/")).toBeUndefined();
    expect(structuredDataFor("/dashboard")).toEqual([]);
  });
});
