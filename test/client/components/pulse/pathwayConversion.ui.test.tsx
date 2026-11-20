/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PathwayResult } from "@shared/pulse/pathwayEngine";

const api = vi.hoisted(() => ({ scope: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    pulse: {
      requestScope: { useMutation: () => ({ isPending: false, mutate: (input: unknown, options: { onSuccess?: () => void }) => { api.scope.push(input); options.onSuccess?.(); } }) },
      requestEmailedReport: { useMutation: () => ({ isPending: false, mutate: () => undefined }) },
    },
  },
}));

const { PathwayConversionSection } = await import("@/components/pulse/PathwayConversionSection");
const { BRAND } = await import("@shared/brand");

const pathway = {
  primary: { pathwayId: "R-01", label: "Process automation", reasonText: "Repeated manual steps.", meaningText: "" },
  supporting: [],
  prerequisites: [],
  paidNextStep: {
    productId: "P-01", productName: "Workflow Readiness Review", productTagline: "", examine: ["Your order process"], receive: ["A prioritised plan"],
    indicativeDelivery: "Two weeks", feeNaira: 500000, termsVersion: "v1",
  },
} as unknown as PathwayResult;

/** The Pulse's recommended next step (R107): a Discovery Call or the scope and fee; no checkout until the Pulse admin follows. */
describe("the Pulse's recommended next step", () => {
  afterEach(() => { cleanup(); api.scope = []; });

  it("offers a Discovery Call and the scope and fee, and no invoice or payment", () => {
    render(<PathwayConversionSection sessionId={"A".repeat(32)} pathway={pathway} />);
    expect(screen.getByRole("heading", { name: "Workflow Readiness Review" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Book a Discovery Call/ }).getAttribute("href")).toBe(BRAND.discoveryCallUrl);
    expect(screen.queryByText(/invoice/i)).toBeNull();
    expect(screen.getByText(/₦500,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask for the scope and fee" }));
    expect(api.scope).toEqual([{ sessionId: "A".repeat(32) }]);
    expect(screen.getByText(/The team will reply to the email you gave at the start/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Ask for the scope and fee" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
