/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const api = vi.hoisted(() => ({
  user: null as unknown,
  loading: false,
  status: undefined as unknown,
  oauthConfigured: false,
  calls: [] as unknown[],
  error: undefined as string | undefined,
  invalidated: [] as string[],
  resets: [] as unknown[],
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: api.user, loading: api.loading }) }));
vi.mock("@/const", () => ({ isOAuthLoginConfigured: () => api.oauthConfigured, ADMIN_LOGIN_PATH: "/admin/login", startLogin: () => false }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: { me: { invalidate: async () => void api.invalidated.push("auth.me") } },
      adminAccess: { status: { invalidate: async () => void api.invalidated.push("status") } },
      account: { me: { invalidate: async () => void api.invalidated.push("account.me") } },
    }),
    adminAccess: { status: { useQuery: () => ({ data: api.status, isLoading: false }) } },
    account: {
      requestReset: {
        useMutation: (options: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { api.resets.push(input); options.onSuccess?.(); } }),
      },
      signInInternal: {
        useMutation: (options: { onSuccess?: () => Promise<void> | void; onError?: (error: Error) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.calls.push(input);
            if (api.error) options.onError?.(new Error(api.error));
            else void options.onSuccess?.();
          },
        }),
      },
    },
  },
}));

import AdminLoginPage from "@/pages/AdminLoginPage";
import { PASSWORD_RESET_REQUESTED } from "@shared/auth";

function renderPage() {
  const location = memoryLocation({ path: "/admin/login", record: true });
  render(<Router hook={location.hook}><AdminLoginPage /></Router>);
  return location;
}
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  api.user = null;
  api.loading = false;
  api.status = undefined;
  api.oauthConfigured = false;
  api.calls = [];
  api.error = undefined;
  api.invalidated = [];
  api.resets = [];
});
afterEach(cleanup);

describe("admin sign-in page", () => {
  it("asks for email and password with plain copy, and has no Google button", () => {
    renderPage();
    expect(screen.getByText("Admin sign in")).toBeTruthy();
    expect(screen.getByText("Sign in with your IPF administrator account.")).toBeTruthy();
    expect(Array.from(document.querySelectorAll("label")).map(label => label.textContent)).toEqual(["Email", "Password"]);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Continue with authori[sz]ed Gmail|Step 1 of 2|Google/i);
    expect(screen.queryByRole("button", { name: /gmail|google/i })).toBeNull();
  });

  it("links the Terms & Conditions and Privacy Policy", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Terms & Conditions" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });

  it("signs in with the universal account and opens the admin area", async () => {
    const location = renderPage();
    fill("Email", "staff@example.test");
    fill("Password", "correct horse 42");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(location.history.at(-1)).toBe("/admin"));
    expect(api.calls).toEqual([{ email: "staff@example.test", password: "correct horse 42" }]);
    expect(api.invalidated).toEqual(expect.arrayContaining(["auth.me", "status", "account.me"]));
  });

  it("shows the server's message, such as the generic not-authorised refusal, and stays on the page", () => {
    api.error = "This account is not authorised for the IPF administrator area.";
    const location = renderPage();
    fill("Email", "client@example.test");
    fill("Password", "correct horse 42");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert").textContent).toBe("This account is not authorised for the IPF administrator area.");
    expect(location.history.at(-1)).toBe("/admin/login");
  });

  it("does not call the server for an empty form", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert").textContent).toMatch(/email and password/);
    expect(api.calls).toEqual([]);
  });

  it("sends someone who is already signed in as staff straight to the admin area", async () => {
    api.user = { id: 1 };
    api.status = { passwordVerified: true };
    const location = renderPage();
    await waitFor(() => expect(location.history.at(-1)).toBe("/admin"));
  });

  it("offers the legacy Google sign-in only where it is configured, and only as a small secondary link", () => {
    renderPage();
    expect(screen.queryByText("Legacy Google sign-in")).toBeNull();
    cleanup();
    api.oauthConfigured = true;
    renderPage();
    expect(screen.getByText("Legacy Google sign-in").closest("a")?.getAttribute("href")).toBe("/admin/login/legacy");
  });
});

describe("legacy sign-in stays available, not deleted", () => {
  it("keeps the legacy page and its route", () => {
    expect(existsSync(resolve(process.cwd(), "client/src/pages/AdminLegacyLoginPage.tsx"))).toBe(true);
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(app).toMatch(/<Route path="\/admin\/login\/legacy" component=\{AdminLegacyLoginPage\} \/>/);
    expect(app).toMatch(/<Route path="\/admin\/login" component=\{AdminLoginPage\} \/>/);
  });
});

describe("the owner bootstrap script", () => {
  const script = readFileSync(resolve(process.cwd(), "scripts/bootstrapOwner.ts"), "utf8");
  const logic = readFileSync(resolve(process.cwd(), "server/ownerBootstrap.ts"), "utf8");

  it("takes the password only from a hidden interactive prompt, never from arguments, env or a fixed value", () => {
    expect(script).toMatch(/isTTY/);
    expect(script).toMatch(/setRawMode\(true\)/);
    expect(script).not.toMatch(/process\.argv\.(slice|at|\[)[^\n]*(password|PASSWORD)/);
    expect(script).not.toMatch(/process\.env\.[A-Z_]*PASSWORD/);
    expect(script).not.toMatch(/password\s*=\s*["'`]/i);
  });

  it("never prints or logs the password, its confirmation or a hash", () => {
    for (const source of [script, logic]) {
      const calls = [...source.matchAll(/console\.(?:log|error|warn|info)\(([^;]*)\);/g)].map(match => match[1]);
      for (const args of calls) {
        // Messages may mention the word, but no secret value may be interpolated or passed.
        expect(args).not.toMatch(/\$\{[^}]*(password|confirmation|hash)[^}]*\}/i);
        expect(args).not.toMatch(/(^|[\s,(])(password|confirmation|passwordHash|hash)\s*[,)]/i);
      }
    }
    expect(logic).not.toMatch(/\.set\([^)]*password:/);
  });

  it("is a command, not a web endpoint", () => {
    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routers).not.toMatch(/ownerBootstrap|bootstrapOwner/);
    expect(JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")).scripts["owner:bootstrap"]).toMatch(/scripts\/bootstrapOwner\.ts/);
  });
});

describe("forgot your password on the admin sign-in page", () => {
  it("asks for the email, sends the link request, and answers the same whoever asks", () => {
    renderPage();
    fill("Email", "info@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Forgot your password?" }));
    // The address typed for sign-in carries over, and the password field is gone.
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("info@example.test");
    expect(screen.queryByLabelText("Password")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send the reset link" }));
    expect(api.resets).toEqual([{ email: "info@example.test" }]);
    expect(screen.getByRole("status").textContent).toBe(PASSWORD_RESET_REQUESTED);
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("asks for an address before sending anything", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Forgot your password?" }));
    fireEvent.click(screen.getByRole("button", { name: "Send the reset link" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter the email address you sign in with.");
    expect(api.resets).toEqual([]);
  });
});
