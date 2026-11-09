/** @vitest-environment jsdom */
/**
 * /check opens with its first screen alone (R70): the questions, the scoring and the screens' motion load in the
 * background, then take over; pressing the button before they arrive starts the check as soon as they do.
 */
import React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "./publicPageHarness";

vi.mock("@/pages/BusinessCheck", () => ({ default: ({ startNow }: { startNow?: boolean }) => <p>{startNow ? "The first question" : "The check, ready"}</p> }));

const { default: CheckPage } = await import("@/pages/CheckPage");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Business Health Check's first screen (/check)", () => {
  it("shows at once with its own main heading, the promise as a line, and the way in", () => {
    vi.stubGlobal("requestIdleCallback", () => 1);
    renderAt("/check", CheckPage);
    expect(screen.getByRole("heading", { level: 1, name: "Free Business Health Check" })).toBeTruthy();
    expect(screen.getByText("Find it. Fix it. See the shift.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Take the Business Health Check" })).toBeTruthy();
  });

  it("hands over to the check once its code has loaded in the background", async () => {
    let idle: (() => void) | null = null;
    vi.stubGlobal("requestIdleCallback", (run: () => void) => { idle = run; return 1; });
    renderAt("/check", CheckPage);
    expect(screen.queryByText("The check, ready")).toBeNull();
    await act(async () => idle!());
    expect(await screen.findByText("The check, ready")).toBeTruthy();
  });

  it("starts the check as soon as its code arrives when the owner presses the button first", async () => {
    vi.stubGlobal("requestIdleCallback", () => 1);
    renderAt("/check", CheckPage);
    fireEvent.click(screen.getByRole("button", { name: "Take the Business Health Check" }));
    expect(await screen.findByText("The first question")).toBeTruthy();
  });
});
