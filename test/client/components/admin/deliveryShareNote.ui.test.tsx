/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DeliveryShareNote from "@/components/admin/DeliveryShareNote";

afterEach(cleanup);

const NOTE = "Sharing this is the delivery. The second half falls due seven days from today, and the client is emailed its link.";

describe("Before a share that bills (R36)", () => {
  it("tells the team that sharing a Business Review's Findings dates its second half", () => {
    render(<DeliveryShareNote type="business_review" kind="findings" balanceWaiting />);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it("says nothing for a piece that is not the delivery, or when no second half waits", () => {
    const { container, rerender } = render(<DeliveryShareNote type="business_review" kind="prescription" balanceWaiting />);
    expect(container.textContent).toBe("");
    rerender(<DeliveryShareNote type="business_review" kind="findings" balanceWaiting={false} />);
    expect(container.textContent).toBe("");
    rerender(<DeliveryShareNote type="digital_marketing" kind="tools" balanceWaiting />);
    expect(container.textContent).toBe("");
  });

  it("treats a Six-Week Fix's Plan, and any piece of Done for You work, as the delivery", () => {
    const { rerender } = render(<DeliveryShareNote type="six_week_fix" kind="plan" balanceWaiting />);
    expect(screen.getByText(NOTE)).toBeTruthy();
    rerender(<DeliveryShareNote type="done_for_you" kind="other" balanceWaiting />);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });
});
