/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lagosDay } from "@shared/agreement";
import { earliestRequestDue, requestDueOn } from "@shared/requests";

const api = vi.hoisted(() => ({ calls: {} as Record<string, unknown[]> }));
const mutation = (name: string, reply: unknown = { success: true }) => (options?: { onSuccess?: (result: unknown) => void; onError?: (error: Error) => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.(reply); },
  mutateAsync: async (input: unknown) => { (api.calls[name] ??= []).push(input); return reply; },
});
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ engagement: { staff: { detail: { invalidate: () => undefined }, list: { invalidate: () => undefined }, today: { invalidate: () => undefined } } } }),
    engagement: {
      staff: {
        askClient: { useMutation: mutation("askClient", { taskId: 70, emailed: 1 }) },
        requestUpload: { useMutation: mutation("requestUpload", { storageKey: "engagements/4/tasks/70/brief.pdf", uploadUrl: "https://storage.example.test/up", headers: {} }) },
        confirmUpload: { useMutation: mutation("confirmUpload") },
        taskComment: { useMutation: mutation("taskComment", { success: true, emailed: 1 }) },
        followUpShared: { useMutation: mutation("followUpShared", { success: true, late: false, emailed: 1 }) },
        handIn: { useMutation: mutation("handIn", { success: true, emailed: 1 }) },
      },
    },
  },
}));

const { AskClient, ItemConversation } = await import("@/components/admin/AskClient");

type Detail = Parameters<typeof AskClient>[0]["data"];
type Task = Detail["tasks"][number];
const detail = (over: Partial<{ type: string; unlimited: boolean; thisWeek: { id: number; title: string } | null; uploadsEnabled: boolean }> = {}) => ({
  businessName: "Ada Foods",
  uploadsEnabled: over.uploadsEnabled ?? false,
  engagement: { type: over.type ?? "digital_marketing" },
  ask: { allowed: true, unlimited: over.unlimited ?? false, thisWeek: over.thisWeek ?? null },
}) as unknown as Detail;
const task = (over: Partial<Task> = {}) => ({
  id: 70, side: "client", title: "A video of the new menu", turnaround: "first_edit", receivedAt: null, followUpDueAt: null, followUpDoneAt: null,
  askedByName: "Kemi Producer", goesTo: { userId: 8, name: "Kemi Producer" }, canAnswer: true, comments: [], ...over,
}) as unknown as Task;

/** Asking the client (R78): the Work Plan's Ask form, and the conversation and clock on each of the client's items. */
describe("Ask {business}", () => {
  beforeEach(() => { api.calls = {}; });
  afterEach(cleanup);

  it("dates a request the next Thursday at least two days away, never sooner, and sends it with its clock", async () => {
    const done = vi.fn();
    render(<AskClient data={detail()} engagementId={4} onDone={done} />);
    const due = screen.getByLabelText("Due") as HTMLInputElement;
    expect(due.value).toBe(requestDueOn(lagosDay()));
    expect(due.min).toBe(earliestRequestDue(lagosDay()));
    expect(screen.getByText("One request a week each: put everything you need this week into it.")).toBeTruthy();
    const send = screen.getByRole("button", { name: "Send to Ada Foods" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("What you need"), { target: { value: "A video of the new menu" } });
    fireEvent.change(screen.getByLabelText("The brief"), { target: { value: "Thirty seconds, upright." } });
    fireEvent.change(screen.getByLabelText("When it arrives"), { target: { value: "first_edit" } });
    fireEvent.click(send);
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(api.calls.askClient).toEqual([{ engagementId: 4, title: "A video of the new menu", brief: "Thirty seconds, upright.", dueOn: requestDueOn(lagosDay()), turnaround: "first_edit" }]);
  });

  it("says when this person has asked once this week already, and does not send", () => {
    render(<AskClient data={detail({ thisWeek: { id: 69, title: "Photos of the team" } })} engagementId={4} onDone={() => undefined} />);
    fireEvent.change(screen.getByLabelText("What you need"), { target: { value: "Another thing" } });
    expect(screen.getByText(/You have asked Ada Foods once this week already \("Photos of the team"\)/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send to Ada Foods" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers a clock only on a Digital Marketing engagement, and no weekly note to whoever leads it", () => {
    render(<AskClient data={detail({ type: "business_review", unlimited: true })} engagementId={4} onDone={() => undefined} />);
    expect(screen.queryByLabelText("When it arrives")).toBeNull();
    expect(screen.queryByText(/One request a week/)).toBeNull();
  });
});

describe("an item's conversation and clock on the team's side", () => {
  beforeEach(() => { api.calls = {}; });
  afterEach(cleanup);
  const now = new Date("2026-11-12T10:00:00Z").getTime();

  it("says who asked and whom it goes to, and waits for it to arrive", () => {
    render(<ItemConversation task={task()} engagementId={4} now={now} />);
    expect(screen.getByText(/Asked by Kemi Producer\. The client's messages and what they send go to Kemi\./)).toBeTruthy();
    expect(screen.getByText("First edit within 48 hours of it arriving")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "First edit shared" })).toBeNull();
  });

  it("counts down once it arrives, says when it is late, and records the First edit as shared", () => {
    const { unmount } = render(<ItemConversation task={task({ receivedAt: new Date(now), followUpDueAt: new Date(now + 31.5 * 3_600_000) })} engagementId={4} now={now} />);
    expect(screen.getByRole("status").textContent).toMatch(/^First edit due .* · 31 hours left$/);
    fireEvent.click(screen.getByRole("button", { name: "First edit shared" }));
    expect(api.calls.followUpShared).toEqual([{ taskId: 70 }]);
    unmount();
    render(<ItemConversation task={task({ receivedAt: new Date(now - 50 * 3_600_000), followUpDueAt: new Date(now - 2 * 3_600_000) })} engagementId={4} now={now} />);
    expect(screen.getByRole("status").textContent).toContain("2 hours late");
  });

  it("opens on the client's last message, and sends a reply the client is emailed", () => {
    const comments = [{ id: 1, body: "Is landscape fine?", createdAt: new Date(now), authorUserId: 3, authorName: "Ada Okafor", fromClient: true }];
    render(<ItemConversation task={task({ comments } as Partial<Task>)} engagementId={4} now={now} />);
    expect(screen.getByText("Is landscape fine?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Write to the client about A video of the new menu"), { target: { value: "Upright, please." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(api.calls.taskComment).toEqual([{ taskId: 70, body: "Upright, please." }]);
  });

  it("gives someone the item does not go to no reply box and no button", () => {
    const { unmount } = render(<ItemConversation task={task({ canAnswer: false, receivedAt: new Date(now), followUpDueAt: new Date(now + 3_600_000) })} engagementId={4} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Conversation with the client (0)" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "First edit shared" })).toBeNull();
    expect(screen.getByText("Kemi or the lead answers here.")).toBeTruthy();
    unmount();
  });

  it("gives a team item its own messages inside IP Factory, a link, @ to tag a colleague, and Ready for review for its owner (R86)", () => {
    const people = [{ name: "Miracle Marketer" }, { name: "Lola Lead" }];
    render(<ItemConversation task={task({ side: "ipf", canAnswer: true, canHandIn: true, comments: [] } as Partial<Task>)} engagementId={4} people={people} now={now} />);
    expect(screen.getByText(/the client never sees them/)).toBeTruthy();
    const box = screen.getByRole("textbox", { name: /^Write on/ });
    fireEvent.change(box, { target: { value: "Plan attached @lo" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Tag someone" })).getByRole("button", { name: "@Lola Lead" }));
    expect((box as HTMLTextAreaElement).value).toBe("Plan attached @Lola Lead ");
    fireEvent.click(screen.getByRole("button", { name: "Send a link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link to the work" }), { target: { value: "https://docs.example.test/plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(api.calls.taskComment.at(-1)).toEqual({ taskId: 70, body: "Link: https://docs.example.test/plan\nPlan attached @Lola Lead" });
    fireEvent.click(screen.getByRole("button", { name: "Ready for review" }));
    expect(api.calls.handIn).toEqual([{ taskId: 70 }]);
  });
});
