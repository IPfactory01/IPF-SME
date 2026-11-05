/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RoomDashboard, { dueBuckets, type DashboardStep } from "@/components/room/RoomDashboard";

const NOW = new Date("2026-10-22T10:00:00Z").getTime();
const task = (id: number, over: Record<string, unknown>) => ({ id, kind: "action", side: "client", title: `Task ${id}`, detail: null, dueOn: null, status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: id, factor: "internal", files: [], ...over });
const tasks = [
  task(1, { kind: "data_request", title: "Your sales", dueOn: "2026-10-14" }),
  task(2, { kind: "data_request", title: "Your price list", dueOn: "2026-10-14", status: "needs_more" }),
  task(3, { kind: "data_request", title: "Who works here", status: "accepted", statusLabel: "Received" }),
  task(4, { kind: "data_request", title: "Your costs", status: "received", dueOn: "2026-10-20" }),
  task(5, { side: "ipf", title: "Send the cash template", dueOn: "2026-10-20" }),
  task(6, { side: "ipf", title: "Draft the Findings", dueOn: "2026-10-27" }),
  task(7, { title: "Book Session 2", dueOn: "2026-10-30" }),
  task(8, { title: "Choose a date" }),
];
const steps: DashboardStep[] = [
  { n: 1, title: "Business Health Check", state: "done" },
  { n: 2, title: "Discovery Call", state: "done" },
  { n: 3, title: "Full Report", state: "done" },
  { n: 4, title: "Business Review", state: "now" },
  { n: 5, title: "Findings", state: "next" },
  { n: 6, title: "Six-Week Fix", state: "next" },
  { n: 7, title: "Day-30 Review", state: "next" },
];
const nextSession = { id: 1, title: "Business Review Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const room = (over: Record<string, unknown> = {}) => ({ tasks, nextSession, ...over }) as any;

afterEach(cleanup);

describe("the room's dashboard numbers", () => {
  it("buckets open work by its due day in Lagos, yours and ours apart, and counts what has no date", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { buckets, undated } = dueBuckets(tasks as any, NOW);
    expect(buckets.map(bucket => [bucket.name, bucket.you, bucket.us])).toEqual([["Overdue", 2, 1], ["This week", 0, 1], ["Next week", 1, 0], ["Later", 0, 0]]);
    expect(undated).toBe(1);
  });
});

describe("the room's dashboard", () => {
  it("leads with the stage band, the current stage marked, then four figures that open the view behind them", () => {
    render(<RoomDashboard room={room()} steps={steps} now={NOW} />);
    const board = within(screen.getByRole("region", { name: "Dashboard" }));
    const stages = board.getByRole("list", { name: "Stages" });
    expect(within(stages).getAllByRole("listitem")).toHaveLength(7);
    expect(stages.querySelector('[aria-current="step"]')!.textContent).toContain("Business Review");
    const figure = (label: string) => board.getByText(label).closest("a")!;
    expect(figure("Stages complete").textContent).toContain("3 of 7");
    expect(figure("Outstanding with you").textContent).toContain("4");
    expect(figure("Outstanding with you").getAttribute("href")).toBe("#plan");
    expect(figure("Overdue").textContent).toContain("2");
    expect(figure("Next Session").textContent).toContain("Fri 23 Oct");
    expect(figure("Next Session").getAttribute("href")).toBe("#meetings");
  });

  it("says when no Session is booked and nothing is overdue", () => {
    render(<RoomDashboard room={room({ tasks: [], nextSession: null })} steps={steps} now={NOW} />);
    expect(screen.getByText("Not booked")).toBeTruthy();
    expect(screen.getByText("Overdue").closest("a")!.textContent).toContain("0");
  });
});
