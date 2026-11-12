/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_ROLE_PERMISSIONS } from "@shared/platformPermissions";

const calls = vi.hoisted(() => ({ logout: 0 }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ logout: async () => { calls.logout += 1; } }) }));
vi.mock("@/components/admin/DatabaseBehind", () => ({ default: () => null }));
vi.mock("@/components/admin/EngagementsView", () => ({ default: ({ home, header }: { home?: boolean; header?: React.ReactNode }) => <div>{header}<p>{home ? "Projects at home" : "Console engagements"}</p></div> }));
vi.mock("@/components/admin/FinanceView", () => ({ default: () => <p>Finance view</p> }));

const { default: TeamHome, greetingAt } = await import("@/components/admin/TeamHome");
afterEach(cleanup);

const morning = new Date("2026-11-12T07:30:00Z"); // 08:30 in Lagos

describe("the team's home (R83)", () => {
  it("greets by the time in Lagos", () => {
    expect(greetingAt(new Date("2026-11-12T10:59:00Z"))).toBe("Good morning");
    expect(greetingAt(new Date("2026-11-12T11:00:00Z"))).toBe("Good afternoon");
    expect(greetingAt(new Date("2026-11-12T16:00:00Z"))).toBe("Good evening");
  });

  it("opens on the person's own projects with their name and level, in the room's top bar, with Sign out", async () => {
    render(<TeamHome access={{ permissions: [], platformPermissions: PLATFORM_ROLE_PERMISSIONS.subject_matter_expert, name: "Kemi Producer", level: "Specialist" }} now={morning} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good morning, Kemi");
    expect(screen.getByText("Specialist")).toBeTruthy();
    expect(screen.getByText("Projects at home")).toBeTruthy();
    // No Finance for a Specialist.
    expect(screen.queryByRole("tab", { name: "Finance" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await Promise.resolve();
    expect(calls.logout).toBe(1);
  });

  it("gives a Partner Finance as a second tab", () => {
    render(<TeamHome access={{ permissions: [], platformPermissions: PLATFORM_ROLE_PERMISSIONS.partner, name: "Pat Partner", level: "Partner" }} now={morning} />);
    expect(screen.getByRole("tab", { name: "My work" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Finance" }));
    expect(screen.getByText("Finance view")).toBeTruthy();
    expect(screen.queryByText("Projects at home")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "My work" }));
    expect(screen.getByText("Projects at home")).toBeTruthy();
  });
});
