import { describe, expect, it } from "vitest";
import { contentTargetsOf, ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_TYPES, engagementTitle, engagementTypeOf, servicesFor, TYPE_PRODUCT } from "@shared/engagementTypes";
import { MENU_PRODUCTS, productById } from "@shared/products";

describe("engagement types and the products they deliver", () => {
  it("delivers each product as its own type where it has one, otherwise as its way to buy", () => {
    expect(engagementTypeOf(productById("digital_marketing")!)).toBe("digital_marketing");
    expect(engagementTypeOf(productById("business_review")!)).toBe("business_review");
    expect(engagementTypeOf(productById("six_week_fix")!)).toBe("six_week_fix");
    expect(engagementTypeOf(productById("monthly_accounts")!)).toBe("monthly_service");
    expect(engagementTypeOf(productById("business_plan")!)).toBe("done_for_you");
    expect(engagementTypeOf(productById("funding_readiness_assessment")!)).toBe("assessment");
    for (const id of Object.values(TYPE_PRODUCT)) expect(MENU_PRODUCTS.some((product) => product.id === id), id).toBe(true);
  });

  it("offers a Monthly Service engagement only the quarterly services: Digital Marketing opens its own programme (R35)", () => {
    expect(servicesFor("monthly_service").map((product) => product.id)).toEqual(["monthly_accounts", "monthly_adviser_review"]);
    expect(servicesFor("digital_marketing")).toEqual([]);
    expect(servicesFor("assessment").map((product) => product.id)).not.toContain("business_review");
    expect(servicesFor("six_week_fix").map((product) => product.id)).toEqual(["six_week_fix"]);
  });

  it("names every type in Title Case, as the website names its services", () => {
    for (const type of ENGAGEMENT_TYPES) expect(ENGAGEMENT_TYPE_LABELS[type].split(" ").filter((word) => !["for", "and"].includes(word)).every((word) => /^[A-Z0-9]/.test(word)), type).toBe(true);
    expect(engagementTitle("digital_marketing", null)).toBe("Digital Marketing");
  });
});

describe("an engagement's own monthly content targets (0029, ET 17 November 2026)", () => {
  it("uses its own count where set and sensible, the type's otherwise, and never adds a kind", () => {
    expect(contentTargetsOf("digital_marketing", null)).toEqual([{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }]);
    expect(contentTargetsOf("digital_marketing", [{ label: "Stories", count: 26 }, { label: "Podcasts", count: 4 }, { label: "Reels", count: -1 }]))
      .toEqual([{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 26 }]);
    expect(contentTargetsOf("business_review", [{ label: "Stories", count: 26 }])).toEqual([]);
  });
});
