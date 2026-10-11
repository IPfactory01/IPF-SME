/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { PASSWORD_RESET_ERRORS } from "@shared/auth";

const api = vi.hoisted(() => ({
  preview: undefined as unknown,
  calls: [] as unknown[],
  failure: undefined as Error | undefined,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    account: {
      resetPreview: { useQuery: () => ({ data: api.preview, isLoading: false }) },
      resetPassword: {
        useMutation: (options: { onSuccess?: (value: unknown) => void; onError?: (error: Error) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.calls.push(input);
            if (api.failure) options.onError?.(api.failure);
            else options.onSuccess?.({ success: true, email: "ada@example.test" });
          },
        }),
      },
    },
  },
}));

const { default: ResetPasswordPage } = await import("@/pages/ResetPasswordPage");

const renderPage = () => {
  const { hook } = memoryLocation({ path: "/reset/TOKEN123" });
  return render(<Router hook={hook}><Route path="/reset/:token" component={ResetPasswordPage} /></Router>);
};
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the password reset page", () => {
  beforeEach(() => {
    api.preview = { available: true, email: "ada@example.test" };
    api.calls = [];
    api.failure = undefined;
  });
  afterEach(cleanup);

  it("tells the person when the link cannot be used, and points them to sign in", () => {
    api.preview = { available: false };
    renderPage();
    expect(screen.getByText("Reset link unavailable")).toBeTruthy();
    expect(screen.getByText(PASSWORD_RESET_ERRORS.unavailable)).toBeTruthy();
    expect((screen.getByRole("link", { name: "Go to sign in" }) as HTMLAnchorElement).getAttribute("href")).toBe("/login");
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("shows whose link it is, checks the password before sending it, and sends the link with the new password", () => {
    renderPage();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ada@example.test");
    expect(screen.getByText(/The link works once and expires 20 minutes after it was issued/)).toBeTruthy();
    type("New password", "short");
    type("Confirm new password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least/);
    expect(api.calls).toEqual([]);

    type("New password", "new battery staple 9");
    type("Confirm new password", "different staple 9");
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    expect(screen.getByRole("alert").textContent).toBe("The password confirmation does not match.");

    type("Confirm new password", "new battery staple 9");
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    expect(api.calls).toEqual([{ token: "TOKEN123", password: "new battery staple 9", confirmPassword: "new battery staple 9" }]);
    expect(screen.getByText("Password changed")).toBeTruthy();
    expect(screen.getByText(/Sign in with your new password/)).toBeTruthy();
  });

  it("shows the server's answer when the link was used in the meantime", () => {
    api.failure = new Error(PASSWORD_RESET_ERRORS.unavailable);
    renderPage();
    type("New password", "new battery staple 9");
    type("Confirm new password", "new battery staple 9");
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    expect(screen.getByRole("alert").textContent).toBe(PASSWORD_RESET_ERRORS.unavailable);
  });
});
