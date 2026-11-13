/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ calls: {} as Record<string, unknown[]> }));
const mutation = (name: string, reply: unknown = { success: true }) => (options?: { onSuccess?: (result: unknown) => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.(reply); },
  mutateAsync: async (input: unknown) => { (api.calls[name] ??= []).push(input); return reply; },
});
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ engagement: { client: { room: { invalidate: () => undefined } } } }),
    engagement: {
      client: {
        taskComment: { useMutation: mutation("taskComment") },
        requestUpload: { useMutation: mutation("requestUpload", { storageKey: "engagements/4/tasks/70/photo.jpg", uploadUrl: "https://storage.example.test/up", headers: {} }) },
        confirmUpload: { useMutation: mutation("confirmUpload") },
      },
    },
  },
}));

const { ItemUpload, RequestFacts, TaskConversation } = await import("@/components/room/TaskConversation");
const { RoomPreviewContext } = await import("@/components/room/RoomPreview");

type Task = Parameters<typeof TaskConversation>[0]["task"];
const task = (over: Partial<Task> = {}) => ({
  id: 70, side: "client", title: "A video of the new menu", askedBy: "Kemi Producer", writeTo: "Kemi Producer",
  turnaround: "first_edit", receivedAt: null, followUpDueAt: null, followUpDoneAt: null, comments: [], ...over,
}) as unknown as Task;
const now = new Date("2026-11-12T10:00:00Z").getTime();

/** Asking the client (R78): in the room, who asked, when the First edit follows, and the conversation with them. */
describe("a request in the client's room", () => {
  beforeEach(() => { api.calls = {}; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("says who asked, and when the First edit follows: before it arrives, once it has, and once shared", () => {
    const { rerender } = render(<RequestFacts task={task()} now={now} />);
    expect(screen.getByText("Kemi at IP Factory")).toBeTruthy();
    expect(screen.getByText("Once it arrives, we send you the first edit within 48 hours.")).toBeTruthy();
    rerender(<RequestFacts task={task({ receivedAt: new Date(now), followUpDueAt: new Date("2026-11-14T14:05:00Z") })} now={now} />);
    expect(screen.getByText("We have it. Your first edit by Sat 14 Nov, 3:05 pm.")).toBeTruthy();
    rerender(<RequestFacts task={task({ followUpDoneAt: new Date("2026-11-13T09:00:00Z") })} now={now} />);
    expect(screen.getByText("Your first edit was shared on Fri 13 Nov, 10:00 am. It waits for your approval in Content.")).toBeTruthy();
    // An item of the plan with no clock says nothing extra.
    const { container } = render(<RequestFacts task={task({ askedBy: null, turnaround: null })} now={now} />);
    expect(container.textContent).toBe("");
  });

  it("shows the conversation both ways and writes to the person who asked", () => {
    const comments = [
      { id: 1, body: "Is landscape fine?", createdAt: new Date(now), authorName: "Ada Okafor", fromTeam: false, mine: true },
      { id: 2, body: "Upright, please.", createdAt: new Date(now + 3_600_000), authorName: "Kemi Producer", fromTeam: true, mine: false },
    ];
    render(<TaskConversation task={task({ comments })} />);
    expect(screen.getByRole("region", { name: "Messages about A video of the new menu" }).textContent).toContain("Messages (2)");
    expect(screen.getByText(/^You ·/)).toBeTruthy();
    expect(screen.getByText(/^Kemi at IP Factory ·/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Write to Kemi about A video of the new menu"), { target: { value: "Sending it tonight." } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Kemi" }));
    expect(api.calls.taskComment).toEqual([{ taskId: 70, body: "Sending it tonight." }]);
  });

  it("writes nothing in Preview as client, and has no conversation on the team's own items", () => {
    render(<RoomPreviewContext.Provider value><TaskConversation task={task()} /></RoomPreviewContext.Provider>);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("The client writes to Kemi here. Switched off in the preview.")).toBeTruthy();
    cleanup();
    const { container } = render(<TaskConversation task={task({ side: "ipf" } as Partial<Task>)} />);
    expect(container.textContent).toBe("");
  });

  it("uploads a file straight onto the request: to the bucket first, then recorded", async () => {
    const put = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", put);
    render(<ItemUpload task={task()} />);
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Upload files for A video of the new menu"), { target: { files: [file] } });
    await waitFor(() => expect(api.calls.confirmUpload).toHaveLength(1));
    expect(api.calls.requestUpload).toEqual([{ taskId: 70, fileName: "photo.jpg", contentType: "image/jpeg", sizeBytes: 5 }]);
    expect(put).toHaveBeenCalledWith("https://storage.example.test/up", expect.objectContaining({ method: "PUT" }));
    expect(api.calls.confirmUpload).toEqual([{ taskId: 70, storageKey: "engagements/4/tasks/70/photo.jpg", note: null, fileName: "photo.jpg", contentType: "image/jpeg", sizeBytes: 5 }]);
  });

  it("sends every file chosen at once, one after another, not only the first (ET, 13 November 2026)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    render(<ItemUpload task={task()} />);
    const picked = ["IMG_1264.jpeg", "IMG_1265.jpeg", "IMG_1266.jpeg"].map(name => new File(["photo"], name, { type: "image/jpeg" }));
    const input = screen.getByLabelText("Upload files for A video of the new menu") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files: picked } });
    await waitFor(() => expect(api.calls.confirmUpload).toHaveLength(3));
    expect((api.calls.requestUpload as { fileName: string }[]).map(call => call.fileName)).toEqual(["IMG_1264.jpeg", "IMG_1265.jpeg", "IMG_1266.jpeg"]);
  });
});
