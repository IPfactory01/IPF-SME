/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ engagement: { staff: { detail: { invalidate: () => undefined } } } }),
    engagement: { staff: { bookMeeting: { useMutation: (options: { onSuccess?: (result: unknown) => void }) => ({ isPending: false, mutate: (input: unknown) => { api.calls.push(input); options.onSuccess?.({ booked: 1, filled: 1, cancelled: 0 }); } }) } } },
  },
}));

const { default: BookMeeting } = await import("@/components/admin/BookMeeting");

const invitation = `Topic: Kick-off: Ada Foods
Time: Nov 18, 2026 10:00 AM West Central Africa

Join Zoom Meeting
https://us06web.zoom.us/j/81234567890?pwd=AbC

Meeting ID: 812 3456 7890`;

/** Book a meeting from Zoom (R81): the kind, Zoom's scheduler, the pasted invitation checked, then booked. */
describe("Book a meeting", () => {
  beforeEach(() => { api.calls = []; });
  afterEach(cleanup);

  it("opens Zoom's scheduler, reads the pasted invitation, shows it in Lagos time, and books it", () => {
    render(<BookMeeting engagementId={4} businessName="Ada Foods" />);
    fireEvent.click(screen.getByRole("button", { name: "Book a meeting" }));
    const panel = within(screen.getByRole("group", { name: "Book a meeting" }));
    expect(panel.getByRole("link", { name: /Open Zoom to schedule it/ }).getAttribute("href")).toBe("https://zoom.us/meeting/schedule");
    expect((panel.getByRole("button", { name: "Book and send to everyone" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(panel.getByLabelText("The Zoom invitation"), { target: { value: invitation } });
    const read = within(panel.getByLabelText("What the invitation says"));
    expect(read.getByText("Wed, 18 Nov 2026, 10:00 am (Lagos)")).toBeTruthy();
    expect(read.getByText("Join link: https://us06web.zoom.us/j/81234567890?pwd=AbC")).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Book and send to everyone" }));
    expect(api.calls).toEqual([{ engagementId: 4, type: "kickoff", title: "Kick-off", starts: [new Date("2026-11-18T09:00:00Z")], durationMinutes: 45, meetingLink: "https://us06web.zoom.us/j/81234567890?pwd=AbC", agenda: null }]);
  });

  it("asks for the time in Lagos when Zoom's time zone cannot be placed, and needs a name for Other", () => {
    render(<BookMeeting engagementId={4} businessName="Ada Foods" />);
    fireEvent.click(screen.getByRole("button", { name: "Book a meeting" }));
    const panel = within(screen.getByRole("group", { name: "Book a meeting" }));
    fireEvent.change(panel.getByLabelText("Kind of meeting"), { target: { value: "other" } });
    fireEvent.change(panel.getByLabelText("The Zoom invitation"), { target: { value: invitation.replace("West Central Africa", "London") } });
    expect(panel.getByText(/Zoom wrote the time in "London"/)).toBeTruthy();
    fireEvent.change(panel.getByLabelText("Date"), { target: { value: "2026-11-18" } });
    fireEvent.change(panel.getByLabelText("Time (Lagos)"), { target: { value: "15:00" } });
    expect((panel.getByRole("button", { name: "Book and send to everyone" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(panel.getByLabelText("Name"), { target: { value: "Pricing workshop" } });
    fireEvent.click(panel.getByRole("button", { name: "Book and send to everyone" }));
    expect(api.calls).toEqual([expect.objectContaining({ type: "other", title: "Pricing workshop", starts: [new Date("2026-11-18T14:00:00Z")], durationMinutes: 30 })]);
  });
});
