import { describe, expect, it } from "vitest";
import { PRICES } from "@shared/businessSupport";
import { describePayment, effectivePaymentStatus, PAYMENT_DISPLAY_LABELS, PAYMENT_ITEM_DETAILS, PAYMENT_STATUS_LABELS, PAYMENT_WINDOW_HOURS, paymentDeadline, paymentReference } from "@shared/payments";

describe("what an owner can pay for before Current State Assessment", () => {
  it("takes its prices from the one price list", () => {
    expect(PAYMENT_ITEM_DETAILS.full_report.amount).toBe(PRICES.fullReport);
    expect(PAYMENT_ITEM_DETAILS.current_state.amount).toBe(PRICES.currentState);
    expect(describePayment("full_report")).toBe("₦100,000 for your full business check report");
    expect(describePayment("current_state")).toBe("₦500,000 for your Current State Assessment");
  });

  it("gives each business check one short, distinct transfer reference per item", () => {
    expect(paymentReference("full_report", 123)).toBe("TS-R-000123");
    expect(paymentReference("current_state", 123)).toBe("TS-CS-000123");
    expect(paymentReference("current_state", 1234567)).toBe("TS-CS-1234567");
    expect(paymentReference("full_report", 1).length).toBeLessThanOrEqual(32);
  });

  it("names each status in plain words", () => {
    expect(PAYMENT_STATUS_LABELS).toEqual({ requested: "Awaiting payment", proof_received: "Proof received", confirmed: "Paid" });
  });
});

describe("the 48-hour payment window", () => {
  const sent = new Date("2026-10-09T14:05:00Z");
  const hours = (n: number) => new Date(sent.getTime() + n * 3_600_000);

  it("holds the details for 48 hours from when they were sent", () => {
    expect(PAYMENT_WINDOW_HOURS).toBe(48);
    expect(paymentDeadline(sent).toISOString()).toBe("2026-10-11T14:05:00.000Z");
    expect(paymentDeadline(sent.toISOString()).getTime()).toBe(hours(48).getTime());
  });

  it("shows an unpaid request as passed once the 48 hours are over, and nothing else", () => {
    expect(effectivePaymentStatus({ status: "requested", requestedAt: sent }, hours(47))).toBe("requested");
    expect(effectivePaymentStatus({ status: "requested", requestedAt: sent }, hours(48))).toBe("requested");
    expect(effectivePaymentStatus({ status: "requested", requestedAt: sent }, hours(49))).toBe("expired");
    // Proof or payment never expires: the money may still be on its way, or already in.
    expect(effectivePaymentStatus({ status: "proof_received", requestedAt: sent }, hours(200))).toBe("proof_received");
    expect(effectivePaymentStatus({ status: "confirmed", requestedAt: sent }, hours(200))).toBe("confirmed");
    expect(PAYMENT_DISPLAY_LABELS.expired).toBe("48 hours passed");
  });
});
