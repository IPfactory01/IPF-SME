import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = ["client/src/pages/Home.tsx", "client/src/components/home/HomeSections.tsx"].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
const portalSource = readFileSync(resolve(process.cwd(), "client/src/pages/ParticipantDashboard.tsx"), "utf8");
const dialogSource = readFileSync(resolve(process.cwd(), "client/src/components/PricingRequestDialog.tsx"), "utf8");

describe("Request Programme Pricing entry points", () => {
  it("publishes the journey with its prices on the public page instead of a pricing request", () => {
    expect(homeSource).toContain("journey.map");
    expect(homeSource).not.toContain("PricingRequestDialog");
  });

  it("offers the authenticated portal request inside private payment guidance", () => {
    expect(portalSource).toContain("Request programme pricing");
    expect(portalSource).toContain('source="portal"');
  });

  it("uses typed public and authenticated submission procedures", () => {
    expect(dialogSource).toContain("trpc.pricingRequests.submitPublic.useMutation");
    expect(dialogSource).toContain("trpc.pricingRequests.submitPortal.useMutation");
  });
});
