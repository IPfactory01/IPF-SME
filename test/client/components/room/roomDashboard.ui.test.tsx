/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RoomDashboard, { dueBuckets, workSplit, type DashboardStep } from "@/components/room/RoomDashboard";

const NOW = new Date("2026-10-22T10:00:00Z").getTime();
const task = (id: number, over: Record<string, unknown>) => ({ id, kind: "action", side: "client", title: `Task ${id}`, detail: null, dueOn: null, status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: id, factor: "internal", files: [], ...over });
const tasks = [
  task(1, { kind: "data_request", title: "Your sales", dueOn: "2026-10-14" }),
  task(2, { kind: "data_request", title: "Your price list", dueOn: "2026-10-14", status: "needs_more" }),
  task(3, { kind: "data_request", title: "Who works here", status: "accepted", statusLabel: "Received" }),
  task(4, { kind: "data_request", title: "Your costs", status: "received", statusLabel: "Sent, we are checking", dueOn: "2026-10-20" }),
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const room = { tasks } as any;

afterEach(() => { cleanup(); window.location.hash = ""; });

describe("the room's dashboard numbers", () => {
  it("splits every task by who holds it, as the List groups them", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(workSplit(tasks as any).map(group => [group.name, group.value])).toEqual([["Waiting on you", 4], ["With IP Factory", 2], ["We are checking", 1], ["Done", 1]]);
  });

  it("buckets open work by its due day in Lagos, yours and ours apart, and counts what has no date", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { buckets, undated } = dueBuckets(tasks as any, NOW);
    expect(buckets.map(bucket => [bucket.name, bucket.you, bucket.us])).toEqual([["Overdue", 2, 1], ["This week", 0, 1], ["Next week", 1, 0], ["Later", 0, 0]]);
    expect(undated).toBe(1);
  });
});

describe("the room's dashboard", () => {
  it("shows progress, the Work Plan split, Data Requests received and what comes due, each with its numbers in words", () => {
    render(<RoomDashboard room={room} steps={steps} now={NOW} />);
    const board = within(screen.getByRole("region", { name: "Dashboard" }));
    expect(board.getByRole("img", { name: "3 of 7 stages done" })).toBeTruthy();
    expect(board.getByText("43")).toBeTruthy();
    expect(board.getByRole("button", { name: "Work Plan: 4 waiting on you, 2 with ip factory, 1 we are checking, 1 done. Open the list" })).toBeTruthy();
    expect(board.getByRole("button", { name: "2 of 4 received. Open the Data Requests" })).toBeTruthy();
    expect(board.getByText("2 overdue")).toBeTruthy();
    expect(board.getByRole("button", { name: "Overdue: 2 yours, 1 ours" })).toBeTruthy();
    expect(board.getByText("1 with no date yet")).toBeTruthy();
    // The stage band marks the current stage.
    const stages = board.getByRole("list", { name: "Stages" });
    expect(stages.querySelector('[aria-current="step"]')!.textContent).toContain("Business Review");
  });

  it("opens the tab behind a chart when it is clicked, and names a bar on hover", () => {
    render(<RoomDashboard room={room} steps={steps} now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: /Open the Data Requests/ }));
    expect(window.location.hash).toBe("#data");
    fireEvent.click(screen.getByRole("button", { name: /Open the list/ }));
    expect(window.location.hash).toBe("#plan");
    fireEvent.pointerEnter(screen.getByRole("button", { name: "This week: 0 yours, 1 ours" }));
    expect(screen.getAllByText("This week: 0 yours, 1 ours").length).toBeGreaterThan(0);
  });

  it("says what will appear when there is no Work Plan or Data Request yet", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<RoomDashboard room={{ tasks: [] } as any} steps={steps} now={NOW} />);
    expect(screen.getByText("The split appears once your team sets the Work Plan.")).toBeTruthy();
    expect(screen.getByText("Nothing requested yet.")).toBeTruthy();
  });
});
