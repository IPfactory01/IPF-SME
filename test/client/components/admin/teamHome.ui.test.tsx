/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_ROLE_PERMISSIONS } from "@shared/platformPermissions";

const calls = vi.hoisted(() => ({ logout: 0, opened: [] as unknown[] }));
const data = vi.hoisted(() => ({ items: [] as unknown[], today: [] as unknown[] }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ logout: async () => { calls.logout += 1; } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { engagement: { staff: { list: { useQuery: () => ({ data: { setUp: true, items: data.items } }) }, today: { useQuery: () => ({ data: data.today }) } } } } }));
vi.mock("@/components/admin/DatabaseBehind", () => ({ default: () => null }));
vi.mock("@/components/admin/EngagementsView", () => ({ default: ({ home, header, onOpenProject }: { home?: boolean; header?: React.ReactNode; onOpenProject?: (id: number) => void }) => <div>{header}<p>{home ? "Projects at home" : "Console engagements"}</p><button type="button" onClick={() => onOpenProject?.(4)}>Open project 4</button></div> }));
vi.mock("@/components/admin/EngagementDetail", () => ({ EngagementWorkspace: ({ engagementId, myRole }: { engagementId: number; myRole: string | null }) => <p>Workspace {engagementId} as {myRole}</p> }));
vi.mock("@/components/admin/BusinessSupportConsole", () => ({ ConsoleSection: ({ id }: { id: string }) => <p>Section {id}</p> }));

const { default: TeamHome, greetingAt } = await import("@/components/admin/TeamHome");
afterEach(() => { cleanup(); data.items = []; data.today = []; });

const morning = new Date("2026-11-12T07:30:00Z"); // 08:30 in Lagos
const project = { id: 4, businessName: "Ada Foods", myRole: "Content Producer", stageLabel: "Month 1", typeLabel: "Digital Marketing" };

describe("the team's home (R83): everyone, in the client's room's frame", () => {
  it("greets by the time in Lagos", () => {
    expect(greetingAt(new Date("2026-11-12T10:59:00Z"))).toBe("Good morning");
    expect(greetingAt(new Date("2026-11-12T11:00:00Z"))).toBe("Good afternoon");
    expect(greetingAt(new Date("2026-11-12T16:00:00Z"))).toBe("Good evening");
  });

  it("gives a Specialist the room's rail: Home, My tasks with the count, their projects, and who is signed in", async () => {
    data.items = [project, { ...project, id: 5, businessName: "Bola Bakery", myRole: null }];
    data.today = [{ key: "a" }, { key: "b" }];
    render(<TeamHome access={{ permissions: [], platformPermissions: PLATFORM_ROLE_PERMISSIONS.subject_matter_expert, name: "Kemi Producer", level: "Specialist" }} now={morning} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good morning, Kemi");
    const rail = within(screen.getByRole("navigation", { name: "Your work" }));
    expect(rail.getByLabelText("2 for you today")).toBeTruthy();
    expect(within(rail.getByRole("list", { name: "Your projects" })).getAllByRole("button").map(button => button.textContent)).toEqual(["AAda Foods"]);
    expect(rail.queryByRole("list", { name: "The desk" })).toBeNull();
    // A project opens as its workspace, with its tabs in the rail.
    fireEvent.click(within(rail.getByRole("list", { name: "Your projects" })).getByRole("button"));
    expect(screen.getByText("Workspace 4 as Content Producer")).toBeTruthy();
    expect(rail.getByRole("list", { name: "Ada Foods tabs" })).toBeTruthy();
    fireEvent.click(rail.getByRole("button", { name: "Home" }));
    expect(screen.getByText("Projects at home")).toBeTruthy();
    fireEvent.click(rail.getAllByRole("button", { name: "Sign out" })[0]!);
    await Promise.resolve();
    expect(calls.logout).toBe(1);
  });

  it("opens a project from Today or My projects as its workspace", () => {
    data.items = [project];
    render(<TeamHome access={{ permissions: [], platformPermissions: PLATFORM_ROLE_PERMISSIONS.analyst, name: "Lola Lead", level: "Business Analyst" }} now={morning} />);
    fireEvent.click(screen.getByRole("button", { name: "Open project 4" }));
    expect(screen.getByText("Workspace 4 as Content Producer")).toBeTruthy();
  });

  it("puts the desk's places in the rail for those who have them: the Super Admin's Pipeline, Clients, Finance and Team", () => {
    render(<TeamHome access={{ isSuperAdmin: true, permissions: [], name: "Emma Owner", level: "Super Admin" }} now={morning} />);
    const desk = within(screen.getByRole("list", { name: "The desk" }));
    expect(desk.getAllByRole("button").map(button => button.textContent)).toEqual(["Pipeline", "Clients", "Finance", "Team"]);
    fireEvent.click(desk.getByRole("button", { name: "Team" }));
    expect(screen.getByText("Section team")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Team");
  });

  it("gives a Partner Finance beside their work, on a phone too", () => {
    render(<TeamHome access={{ permissions: [], platformPermissions: PLATFORM_ROLE_PERMISSIONS.partner, name: "Pat Partner", level: "Partner" }} now={morning} />);
    expect(screen.getByRole("tab", { name: "My work" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Finance" }));
    expect(screen.getByText("Section finance")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "My work" }));
    expect(screen.getByText("Projects at home")).toBeTruthy();
  });
});
