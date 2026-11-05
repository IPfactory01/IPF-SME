/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  calls: [] as unknown[],
  reply: null as unknown,
  error: null as string | null,
}));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,QR" } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    account: {
      verifyTwoStep: {
        useMutation: (options: { onSuccess?: (value: never) => void; onError?: (error: Error) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.calls.push(input);
            if (api.error) options.onError?.(new Error(api.error));
            else options.onSuccess?.(api.reply as never);
          },
        }),
      },
    },
  },
}));

const { default: TwoStepStep, groupKey } = await import("@/components/TwoStepStep");

const view = { user: { id: 1, fullName: "Ada", email: "ada@example.com", status: "active" }, platformRoles: ["analyst"], permissions: [], memberships: [], activeBusiness: null, landingPath: "/admin" };
const setup = { twoStepRequired: true as const, challenge: "c".repeat(43), setup: { secret: "ABCDEFGHIJKLMNOP", uri: "otpauth://totp/x?secret=ABCDEFGHIJKLMNOP" } };
const later = { twoStepRequired: true as const, challenge: "d".repeat(43), setup: null };

describe("two-step sign-in step", () => {
  beforeEach(() => { api.calls = []; api.error = null; api.reply = { ...view, recoveryCodes: null }; });
  afterEach(cleanup);

  it("the first time, shows the QR code and the key in groups, then the recovery codes once before signing in", async () => {
    const signedIn = vi.fn();
    api.reply = { ...view, recoveryCodes: ["aaaa-bbbb", "cccc-dddd"] };
    render(<TwoStepStep id="t" challenge={setup} onSignedIn={signedIn} onCancel={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Set up two-step sign-in" })).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText(/QR code/).getAttribute("src")).toBe("data:image/png;base64,QR"));
    expect(screen.getByTestId("t-setup-key").textContent).toBe("ABCD EFGH IJKL MNOP");
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on and sign in" }));
    expect(api.calls).toEqual([{ challenge: setup.challenge, code: "123456" }]);
    expect(signedIn).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "Recovery codes" }).textContent).toContain("aaaa-bbbb");
    fireEvent.click(screen.getByRole("button", { name: "I have saved them. Continue" }));
    expect(signedIn).toHaveBeenCalledWith(view);
  });

  it("afterwards, asks for the code only and signs in straight away", () => {
    const signedIn = vi.fn();
    render(<TwoStepStep id="t" challenge={later} onSignedIn={signedIn} onCancel={() => undefined} />);
    expect(screen.queryByAltText(/QR code/)).toBeNull();
    expect(screen.getByText(/recovery codes instead/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(signedIn).toHaveBeenCalledWith(view);
  });

  it("explains a short or wrong code, and starts again on request", () => {
    const cancel = vi.fn();
    render(<TwoStepStep id="t" challenge={later} onSignedIn={() => undefined} onCancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert").textContent).toContain("six-digit code");
    expect(api.calls).toEqual([]);
    api.error = "That code is not right. Check your authenticator app and try again.";
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert").textContent).toContain("not right");
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(cancel).toHaveBeenCalled();
  });

  it("groups a setup key in fours", () => {
    expect(groupKey("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
  });
});
