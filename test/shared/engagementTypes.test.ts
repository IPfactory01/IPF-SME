import { describe, expect, it } from "vitest";
import { ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_TYPES, engagementTitle, engagementTypeOf, servicesFor, TYPE_PRODUCT } from "@shared/engagementTypes";
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
