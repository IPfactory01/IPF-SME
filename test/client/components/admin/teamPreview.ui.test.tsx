/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ ended: 0, reloaded: 0 }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/reload", () => ({ reloadPage: () => { api.reloaded += 1; } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    adminAccess: {
      endPreview: { useMutation: (options: { onSuccess?: () => void }) => ({ isPending: false, mutate: () => { api.ended += 1; options.onSuccess?.(); } }) },
      previewAs: { useMutation: () => ({ isPending: false, mutate: () => undefined }) },
    },
  },
}));

const { TeamPreviewBanner } = await import("@/components/admin/TeamPreview");
const { formatTime } = await import("@/components/admin/format");

/** Preview as a team member (R76): the banner on Admin while the Super Admin sees someone else's view. */
describe("the team preview banner", () => {
  afterEach(cleanup);

  it("says whose view it is and until when, that actions are off, and closes back to the Super Admin's own view", () => {
    const until = new Date("2026-11-10T13:30:00Z");
    render(<TeamPreviewBanner preview={{ name: "Kemi Contractor", email: "kemi@example.test", until }} />);
    const banner = screen.getByRole("status", { name: "Team preview" });
    // The time as Admin shows every time: in the viewer's own zone.
    expect(banner.textContent).toContain(`As Kemi Contractor sees it, until ${formatTime(until)}. Actions are off.`);
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(api.ended).toBe(1);
    expect(api.reloaded).toBe(1);
  });
});
