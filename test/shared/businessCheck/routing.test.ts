import { describe, expect, it } from "vitest";
import { evaluate } from "@shared/businessCheck/engine";
import { firstStep, stepName } from "@shared/businessCheck/routing";
import { MENU_PRODUCTS, productById } from "@shared/products";

const trading = { p_stage: "trading", p_age: "1to3", p_staff: "3to5", p_revenue: "1to5m", p_trend: "flat" };
const route = (answers: Record<string, string | undefined>, stuckAreas: number[] = [], mainArea?: number, kind: "advisory" | "programme" | "foundation" | "idea" = "programme") =>
  firstStep({ answers: { ...trading, ...answers }, route: kind, stuckAreas, mainArea });

describe("the first product the check names (Operational Business Plan, page 18)", () => {
  it("sends no records or unclear numbers to the Bookkeeping Catch-Up, then Monthly Accounts", () => {
    const step = route({ s7_status: "records_unused" }, [], 7);
    expect(step.productId).toBe("bookkeeping_catch_up");
    expect(step.nextProductId).toBe("monthly_accounts");
    expect(route({ s7_status: "tight_guess", s7_detail: "mixed_money" }, [7], 7).productId).toBe("bookkeeping_catch_up");
  });

  it("sends tight cash to the 13-Week Cash Flow Forecast, then the Six-Week Fix: Cash and Pricing", () => {
    const step = route({ s7_status: "tight_guess", s7_detail: "late_payers" }, [7], 7);
    expect(step.productId).toBe("cash_flow_forecast");
    expect(stepName(step.nextProductId!, step.nextVariantId)).toBe("Six-Week Fix: Cash and Pricing");
  });

  it("sends guessed prices and unclear margins to the Pricing and Unit Cost Review, then the Fix: Margin", () => {
    const step = route({ s4_status: "suspect" }, [], 4);
    expect(step.productId).toBe("pricing_unit_cost_review");
    expect(step.nextVariantId).toBe("margin");
    expect(route({ s7_status: "tight_guess", s7_detail: "unit_cost" }, [7], 7).productId).toBe("pricing_unit_cost_review");
  });

  it("sends a funding need or an open lender window to the Funding Readiness Assessment, then the pack", () => {
    for (const answers of [{ s7_status: "funding" }, { s7_detail: "loan" }, { s1_status: "means" }]) {
      const step = route(answers, [], 1);
      expect(step.productId, JSON.stringify(answers)).toBe("funding_readiness_assessment");
      expect(step.nextProductId).toBe("funding_application_pack");
    }
  });

  it("sends no direction to the Strategy and 90-Day Plan, then the Monthly Adviser Review", () => {
    const step = route({ s1_status: "busy" }, [1], 1);
    expect(step.productId).toBe("strategy_90_day_plan");
    expect(step.nextProductId).toBe("monthly_adviser_review");
  });

  it("sends an owner about to hire to the Hiring Toolkit, and 'nothing moves without me' to the Fix: Delegation and Structure", () => {
    expect(route({ s6_status: "staff" }, [6], 6).productId).toBe("hiring_toolkit");
    expect(route({ s6_status: "only_me" }, [6], 6)).toMatchObject({ productId: "six_week_fix", variantId: "delegation_structure" });
  });

  it("sends flat sales to the Six-Week Fix: Sales", () => {
    expect(route({ s5_status: "inconsistent" }, [5], 5)).toMatchObject({ productId: "six_week_fix", variantId: "sales" });
  });

  it("sends several connected problems, and a large business, to the Business Review", () => {
    expect(route({}, [4, 5, 7], 4).productId).toBe("business_review");
    expect(route({}, [], undefined, "advisory").productId).toBe("business_review");
  });

  it("keeps an owner working alone at an early revenue level on a Done for You product", () => {
    for (const area of [3, 4, 5, 6, 8]) {
      const product = productById(route({}, [area], area, "foundation").productId)!;
      expect(product.way, `area ${area}`).toBe("done_for_you");
    }
  });

  it("names a product on the menu for every main area and route", () => {
    for (const kind of ["programme", "foundation", "idea", "advisory"] as const) {
      for (const area of [undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const step = route({}, [], area, kind);
        expect(MENU_PRODUCTS.map((product) => product.id), `${kind} ${area}`).toContain(step.productId);
        if (step.variantId) expect(productById(step.productId)!.variants!.map((variant) => variant.id)).toContain(step.variantId);
        expect(step.because.length).toBeGreaterThan(10);
      }
    }
  });

  it("is part of every evaluated check, and the rules summary names it", () => {
    const result = evaluate({ ...trading, s7_status: "tight_guess", s7_detail: "late_payers" });
    expect(result.firstStep.productId).toBeDefined();
    expect(result.summary.think).toContain(`The first step that fits is the ${stepName(result.firstStep.productId, result.firstStep.variantId)}.`);
  });
});
