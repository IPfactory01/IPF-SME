import { describe, expect, it } from "vitest";
import { GUIDES, guideBySlug, guidePath } from "@shared/guides";
import { PRODUCTS, priceLabel, productById } from "@shared/products";
import { publicPages } from "@shared/seo";

describe("guides: answers to what Nigerian owners search for", () => {
  it("answers each search it targets with a title Google can show in full, and a description under 160 characters", () => {
    expect(GUIDES.length).toBe(5);
    expect(new Set(GUIDES.map((guide) => guide.slug)).size).toBe(GUIDES.length);
    for (const guide of GUIDES) {
      expect(guide.slug).toMatch(/^[a-z0-9-]+$/);
      expect(guide.searches.length, guide.slug).toBeGreaterThanOrEqual(3);
      expect(`${guide.title} | The Shift, by IP Factory`.length, guide.slug).toBeLessThanOrEqual(100);
      expect(guide.description.length, guide.slug).toBeLessThanOrEqual(160);
      expect(guide.faq.length, guide.slug).toBeGreaterThanOrEqual(3);
      expect(guideBySlug(guide.slug)).toBe(guide);
    }
  });

  it("speaks the owner's language: Nigeria, naira, their own question", () => {
    const struggling = guideBySlug("my-business-is-struggling")!;
    expect(struggling.h1).toBe("My business is struggling. What can I do?");
    expect(struggling.searches).toContain("my business is struggling what can i do");
    const loan = guideBySlug("how-to-get-a-business-loan-in-nigeria")!;
    expect(loan.title).toContain("business loan in Nigeria");
    for (const term of ["Bank of Industry", "SMEDAN", "CAC", "BVN"]) expect(JSON.stringify(loan), term).toContain(term);
    const words = JSON.stringify(GUIDES);
    expect(words).not.toMatch(/\b(door|sprint|playbook|retainer|leverage|holistic|synergy)\b/i);
    expect(words).not.toMatch(/N\d|NGN \d/);
  });

  it("names only services that exist, and quotes their prices from the one price list", () => {
    for (const guide of GUIDES) for (const id of guide.services) expect(productById(id), `${guide.slug}: ${id}`).toBeTruthy();
    const plan = guideBySlug("how-much-does-a-business-plan-cost-in-nigeria")!;
    const price = priceLabel(PRODUCTS.find((product) => product.id === "business_plan")!.price);
    expect(plan.lede).toContain(price);
    expect(plan.description).toContain(price);
  });

  it("gives each guide a ready-made page with its questions as structured data", () => {
    for (const guide of GUIDES) {
      const page = publicPages().find((entry) => entry.path === guidePath(guide))!;
      expect(page.title).toBe(guide.title);
      expect(page.heading).toBe(guide.h1);
      expect(JSON.stringify(page.jsonLd)).toContain('"@type":"FAQPage"');
      expect(JSON.stringify(page.jsonLd)).toContain('"name":"Guides"');
    }
    expect(publicPages().some((entry) => entry.path === "/guides")).toBe(true);
  });
});
