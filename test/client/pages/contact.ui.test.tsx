/** @vitest-environment jsdom */

import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: ContactPage } = await import("@/pages/ContactPage");
const { BRAND } = await import("@shared/brand");

afterEach(cleanup);

describe("Contact (/contact)", () => {
  it("offers the free call, the mailbox and where we work", () => {
    renderAt("/contact", ContactPage);
    const ways = within(screen.getByRole("region", { name: "Ways to reach us" }));
    expect(ways.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Book a free call", "Write to us", "Where we work"]);
    const call = ways.getByRole("link", { name: /Book a free call/ });
    expect(call.getAttribute("href")).toBe(BRAND.discoveryCallUrl);
    expect(call.getAttribute("rel")).toContain("noopener");
    expect(ways.getByRole("link", { name: BRAND.businessSupportMailbox }).getAttribute("href")).toBe(`mailto:${BRAND.businessSupportMailbox}`);
    expect(ways.getByText(/Lagos and Abuja/)).toBeTruthy();
  });

  it("sends existing clients to sign in and the unsure to the free check", () => {
    renderAt("/contact", ContactPage);
    for (const link of screen.getAllByRole("link", { name: "Client sign in" })) expect(link.getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Take the free Business Health Check" }).getAttribute("href")).toBe("/check");
  });
});
