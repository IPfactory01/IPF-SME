/** @vitest-environment jsdom */

import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

window.scrollTo = () => undefined;
const api = vi.hoisted(() => ({ started: [] as Array<Record<string, unknown>> }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    pulse: {
      getActiveVersion: { useQuery: () => ({ isLoading: false, data: { controlled_lists: [] } }) },
      resolveInviteCode: { useQuery: () => ({ data: undefined, isLoading: false }) },
      createSession: { useMutation: () => ({ isPending: false, mutate: (input: Record<string, unknown>) => { api.started.push(input); } }) },
    },
  },
}));

const { default: PulseStart } = await import("@/pages/PulseStart");

/** The Pulse's first screen (R107). */
describe("starting the Pulse", () => {
  afterEach(() => { cleanup(); api.started = []; });

  it("accepts a personal mailbox such as Gmail: any working email will do (ET, 20 November 2026)", () => {
    render(<Router hook={memoryLocation({ path: "/pulse" }).hook}><PulseStart /></Router>);
    fireEvent.change(screen.getByLabelText(/Name of respondent/), { target: { value: "Ngozi Fictional" } });
    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: "Fictional Foods" } });
    const email = screen.getByLabelText(/^Email/);
    fireEvent.change(email, { target: { value: "ngozi.fictional@gmail.com" } });
    fireEvent.blur(email);
    expect(screen.queryByText(/corporate/i)).toBeNull();
    fireEvent.click(screen.getByLabelText("I acknowledge the privacy notice"));
    const start = screen.getByRole("button", { name: /Start the Pulse/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(api.started).toEqual([expect.objectContaining({ email: "ngozi.fictional@gmail.com", companyName: "Fictional Foods" })]);
  });

  it("still refuses an address that is not an email", () => {
    render(<Router hook={memoryLocation({ path: "/pulse" }).hook}><PulseStart /></Router>);
    const email = screen.getByLabelText(/^Email/);
    fireEvent.change(email, { target: { value: "ngozi at gmail" } });
    fireEvent.blur(email);
    expect(screen.getByText("Please enter a valid email address.")).toBeTruthy();
  });

  it("gives every Pulse dropdown and dialog a solid background: The Shift has no template popover colour, so without one the list shows through the form", () => {
    const files = [
      ...["PulseStart.tsx", "PulseAssessment.tsx", "PulseResults.tsx"].map((name) => join("client/src/pages", name)),
      ...readdirSync("client/src/components/pulse").map((name) => join("client/src/components/pulse", name)),
    ];
    const bare = files.flatMap((file) =>
      Array.from(readFileSync(file, "utf8").matchAll(/<(SelectContent|AlertDialogContent|DialogContent|PopoverContent)\b[^>]*>/g))
        .filter((match) => !/className="[^"]*\bbg-/.test(match[0]))
        .map((match) => `${file}: ${match[0]}`));
    expect(bare).toEqual([]);
  });
});
