/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { AccountSessionView } from "@shared/auth";

const RICHIE_TECH = { businessId: 7, businessName: "Richie Tech", role: "owner", status: "active", profileComplete: false, profilePercent: 60 } as const;
const SECOND_CO = { businessId: 8, businessName: "Second Co", role: "member", status: "active", profileComplete: false, profilePercent: 20 } as const;
const SESSION: AccountSessionView = {
  user: { id: 1, fullName: "Richie Okafor", email: "richie@example.com", status: "active" },
  platformRoles: [],
  permissions: [],
  memberships: [RICHIE_TECH],
  activeBusiness: RICHIE_TECH,
  landingPath: "/dashboard",
};
const STAFF: AccountSessionView = {
  user: { id: 2, fullName: "Lewis Staff", email: "lewis@example.com", status: "active" },
  platformRoles: ["desk_lead"],
  permissions: ["view_all_businesses"],
  memberships: [],
  activeBusiness: null,
  landingPath: "/admin",
};

const api = vi.hoisted(() => {
  const state = { switchCalls: [] as unknown[], updateBusinessCalls: [] as unknown[], updateProfileCalls: [] as unknown[], changePasswordCalls: [] as unknown[], businessProfile: undefined as unknown, me: null as unknown, loading: false, preview: undefined as unknown, previewLoading: false, acceptCalls: [] as unknown[], signInCalls: [] as unknown[], signOutCalls: 0, setData: [] as unknown[] };
  const replies: { switchTo?: unknown; businessError?: string; passwordError?: string; accept?: unknown; signIn?: unknown; acceptError?: string; signInError?: string } = {};
  return { state, replies };
});

const SESSION_FOR_MOCK = { user: { id: 1, fullName: "Richie Okafor", email: "richie@example.com", status: "active" } };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    onboarding: {
      preview: { useQuery: () => ({ data: api.state.preview, isLoading: api.state.previewLoading }) },
      accept: {
        useMutation: (options: { onSuccess?: (v: unknown) => void; onError?: (e: Error) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.state.acceptCalls.push(input);
            if (api.replies.acceptError) options.onError?.(new Error(api.replies.acceptError));
            else options.onSuccess?.(api.replies.accept);
          },
        }),
      },
    },
    useUtils: () => ({ account: { me: { setData: (_: unknown, value: unknown) => api.state.setData.push(value), invalidate: () => undefined }, business: { invalidate: () => undefined } } }),
    // No engagement yet: the dashboard shows the business card only (the room has its own tests).
    engagement: { client: { room: { useQuery: () => ({ data: null, isLoading: false }) } } },
    account: {
      me: { useQuery: () => ({ data: api.state.me, isLoading: api.state.loading, refetch: () => undefined }) },
      signIn: {
        useMutation: (options: { onSuccess?: (v: unknown) => void; onError?: (e: Error) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.state.signInCalls.push(input);
            if (api.replies.signInError) options.onError?.(new Error(api.replies.signInError));
            else options.onSuccess?.(api.replies.signIn);
          },
        }),
      },
      switchWorkspace: {
        useMutation: (options: { onSuccess?: (v: unknown) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.state.switchCalls.push(input);
            options.onSuccess?.(api.replies.switchTo);
          },
        }),
      },
      business: { useQuery: () => ({ data: api.state.businessProfile, isLoading: false, error: null }) },
      updateBusiness: {
        useMutation: (options: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.state.updateBusinessCalls.push(input);
            if (api.replies.businessError) options.onError?.(new Error(api.replies.businessError));
            else options.onSuccess?.();
          },
        }),
      },
      updateProfile: {
        useMutation: (options: { onSuccess?: (v: unknown) => void }) => ({
          isPending: false,
          mutate: (input: { fullName: string }) => {
            api.state.updateProfileCalls.push(input);
            options.onSuccess?.({ ...SESSION_FOR_MOCK, user: { ...SESSION_FOR_MOCK.user, fullName: input.fullName } });
          },
        }),
      },
      changePassword: {
        useMutation: (options: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.state.changePasswordCalls.push(input);
            if (api.replies.passwordError) options.onError?.(new Error(api.replies.passwordError));
            else options.onSuccess?.();
          },
        }),
      },
      signOut: {
        useMutation: (options: { onSuccess?: () => void }) => ({
          isPending: false,
          mutate: () => {
            api.state.signOutCalls += 1;
            options.onSuccess?.();
          },
        }),
      },
    },
  },
}));

import OnboardingPage from "@/pages/OnboardingPage";
import LoginPage from "@/pages/LoginPage";
import AccountDashboard from "@/pages/AccountDashboard";
import AccountSettingsPage from "@/pages/AccountSettingsPage";
import BusinessSettingsPage from "@/pages/BusinessSettingsPage";

function renderAt(path: string, element: React.ReactElement) {
  const location = memoryLocation({ path, record: true });
  render(<Router hook={location.hook}>{element}</Router>);
  return location;
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  api.state.me = null;
  api.state.loading = false;
  api.state.preview = undefined;
  api.state.previewLoading = false;
  api.state.acceptCalls = [];
  api.state.signInCalls = [];
  api.state.signOutCalls = 0;
  api.state.setData = [];
  api.state.switchCalls = [];
  api.state.updateBusinessCalls = [];
  api.state.updateProfileCalls = [];
  api.state.changePasswordCalls = [];
  api.state.businessProfile = undefined;
  delete api.replies.switchTo;
  delete api.replies.businessError;
  delete api.replies.passwordError;
  delete api.replies.accept;
  delete api.replies.signIn;
  delete api.replies.acceptError;
  delete api.replies.signInError;
});
afterEach(cleanup);

const INVITED = { available: true, email: "richie@example.com", fullName: "Richie Okafor", businessName: "Richie Tech" };
const renderOnboarding = () => renderAt("/onboarding/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG", <Route path="/onboarding/:token" component={OnboardingPage} />);

describe("onboarding screen (invitation only)", () => {
  it("shows the five account fields, pre-filled from the invitation, with the email locked", () => {
    api.state.preview = INVITED;
    renderOnboarding();
    expect(screen.getByText("Create your account")).toBeTruthy();
    expect(Array.from(document.querySelectorAll("label")).map(label => label.textContent)).toEqual(["Full name", "Email", "Password", "Confirm password", "Business name"]);
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Richie Okafor");
    expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("Richie Tech");
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("richie@example.com");
    expect(email.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("asks for nothing beyond the account and the business name", () => {
    api.state.preview = INVITED;
    renderOnboarding();
    for (const unwanted of [/sector/i, /website/i, /year founded/i, /revenue/i, /phone/i, /address/i, /logo/i]) expect(screen.queryByLabelText(unwanted)).toBeNull();
  });

  it("validates in the browser before calling the server", () => {
    api.state.preview = INVITED;
    renderOnboarding();
    fill("Password", "short1");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least 10/);
    fill("Password", "correct horse 42");
    fill("Confirm password", "different 12345");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert").textContent).toMatch(/does not match/);
    expect(api.state.acceptCalls).toEqual([]);
  });

  it("submits with the invitation token and the locked email, stores the session and lands on the dashboard", async () => {
    api.state.preview = INVITED;
    api.replies.accept = SESSION;
    const location = renderOnboarding();
    fill("Business name", "Richie Tech Ltd");
    fill("Password", "correct horse 42");
    fill("Confirm password", "correct horse 42");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(location.history.at(-1)).toBe("/dashboard"));
    expect(api.state.acceptCalls).toEqual([{ token: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG", email: "richie@example.com", fullName: "Richie Okafor", businessName: "Richie Tech Ltd", password: "correct horse 42", confirmPassword: "correct horse 42" }]);
    expect(api.state.setData).toEqual([SESSION]);
  });

  it("shows the server's message and stays put when the invitation cannot be used", () => {
    api.state.preview = INVITED;
    api.replies.acceptError = "This invitation is unavailable. It may have expired or already been used. Ask the IPF team for a new link.";
    const location = renderOnboarding();
    fill("Password", "correct horse 42");
    fill("Confirm password", "correct horse 42");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert").textContent).toContain("unavailable");
    expect(location.history.at(-1)).toContain("/onboarding/");
  });

  it("shows a clear message, and no form, for an invalid, expired, used or revoked link", () => {
    api.state.preview = { available: false };
    renderOnboarding();
    expect(screen.getByText("Invitation unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("waits for the server's answer before showing anything", () => {
    api.state.previewLoading = true;
    renderOnboarding();
    expect(screen.getByText("Checking your invitation…")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("sends an already signed-in visitor to the dashboard", async () => {
    api.state.me = SESSION;
    api.state.preview = INVITED;
    const location = renderOnboarding();
    await waitFor(() => expect(location.history.at(-1)).toBe("/dashboard"));
  });

  it("does not send someone else who is signed in (the team, testing) to their own area: it asks them to sign out first", async () => {
    api.state.me = STAFF;
    api.state.preview = INVITED;
    const location = renderOnboarding();
    expect(screen.getByText("You are signed in as someone else")).toBeTruthy();
    expect(screen.getByText(/This invitation is for/).textContent).toContain("lewis@example.com");
    expect(screen.queryByLabelText("Password")).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(location.history.at(-1)).toContain("/onboarding/");
    fireEvent.click(screen.getByRole("button", { name: "Sign out and continue" }));
    expect(api.state.signOutCalls).toBe(1);
    expect(api.state.setData).toEqual([null]);
  });

  it("waits for the invitation before sending a signed-in visitor anywhere", () => {
    api.state.me = STAFF;
    api.state.previewLoading = true;
    const location = renderOnboarding();
    expect(location.history.at(-1)).toContain("/onboarding/");
  });
});

describe("no public registration", () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

  it("has no sign-up page, and /signup goes to sign-in instead of a form", () => {
    expect(existsSync(resolve(process.cwd(), "client/src/pages/SignUpPage.tsx"))).toBe(false);
    const app = read("client/src/App.tsx");
    expect(app).not.toMatch(/SignUpPage/);
    expect(app).toMatch(/<Route path="\/signup">\{\(\) => <Redirect to="\/login" \/>\}<\/Route>/);
    expect(app).toMatch(/<Route path="\/onboarding\/:token" component=\{OnboardingPage\} \/>/);
  });

  it("does not offer account creation on the sign-in page", () => {
    renderAt("/login", <LoginPage />);
    expect(screen.getByText("Client access is created during onboarding.")).toBeTruthy();
    expect(screen.queryByText(/create your account/i)).toBeNull();
    expect(document.querySelector('a[href="/signup"]')).toBeNull();
  });

  it("points JUMP participants to their own portal", () => {
    renderAt("/login", <LoginPage />);
    expect(screen.getByRole("link", { name: "Go to the participant portal" }).getAttribute("href")).toBe("/portal");
  });
});

describe("sign-in screen", () => {
  it("signs in and opens the dashboard", async () => {
    api.replies.signIn = SESSION;
    const location = renderAt("/login", <LoginPage />);
    fill("Email", "richie@example.com");
    fill("Password", "correct horse 42");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(location.history.at(-1)).toBe("/dashboard"));
    expect(api.state.signInCalls).toEqual([{ email: "richie@example.com", password: "correct horse 42" }]);
  });

  it("shows the generic failure message", () => {
    api.replies.signInError = "Your email or password is not correct.";
    renderAt("/login", <LoginPage />);
    fill("Email", "x@example.com");
    fill("Password", "whatever 12");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert").textContent).toBe("Your email or password is not correct.");
  });

  it("does not loop: a signed-in visitor goes to the dashboard, an anonymous one stays", async () => {
    const anonymous = renderAt("/login", <LoginPage />);
    expect(anonymous.history).toEqual(["/login"]);
    cleanup();
    api.state.me = SESSION;
    const signedIn = renderAt("/login", <LoginPage />);
    await waitFor(() => expect(signedIn.history.at(-1)).toBe("/dashboard"));
  });
});

describe("account dashboard", () => {
  it("welcomes the person and shows their business workspace, the incomplete profile and a way to finish it", () => {
    api.state.me = SESSION;
    renderAt("/dashboard", <AccountDashboard />);
    expect(screen.getByRole("heading", { name: "Welcome, Richie" })).toBeTruthy();
    expect(screen.getByText("Richie Tech")).toBeTruthy();
    expect(screen.getByText("Incomplete")).toBeTruthy();
    expect(screen.getByText(/60% complete/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("60");
    expect(screen.getByText("richie@example.com")).toBeTruthy();
    expect(screen.getByText(/Your account is you\. Your business is the workspace/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Complete profile" }).getAttribute("href")).toBe("/settings/business");
  });

  it("shows no workspace switcher for a person with one business", () => {
    api.state.me = SESSION;
    renderAt("/dashboard", <AccountDashboard />);
    expect(screen.queryByLabelText("Workspace")).toBeNull();
  });

  it("shows a workspace switcher, listing each business with the person's role, for two or more", () => {
    api.state.me = { ...SESSION, memberships: [RICHIE_TECH, SECOND_CO] };
    renderAt("/dashboard", <AccountDashboard />);
    const select = screen.getByLabelText("Workspace") as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.textContent)).toEqual(["Richie Tech · Owner", "Second Co · Member"]);
    expect(select.value).toBe("7");
  });

  it("switches workspace through the server and uses the refreshed context", () => {
    api.state.me = { ...SESSION, memberships: [RICHIE_TECH, SECOND_CO] };
    const switched = { ...SESSION, memberships: [RICHIE_TECH, SECOND_CO], activeBusiness: SECOND_CO };
    api.replies.switchTo = switched;
    renderAt("/dashboard", <AccountDashboard />);
    fireEvent.change(screen.getByLabelText("Workspace"), { target: { value: "8" } });
    expect(api.state.switchCalls).toEqual([{ businessId: 8 }]);
    expect(api.state.setData).toEqual([switched]);
  });

  it("does not offer a business to someone who has none and has no internal role", () => {
    api.state.me = { ...SESSION, memberships: [], activeBusiness: null };
    renderAt("/dashboard", <AccountDashboard />);
    expect(screen.getByText("You are not a member of a business yet.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Complete profile" })).toBeNull();
  });

  it("gives an internal person with no business an internal workspace, not a fake business", () => {
    api.state.me = STAFF;
    renderAt("/dashboard", <AccountDashboard />);
    expect(screen.getByText("Internal workspace")).toBeTruthy();
    expect(screen.getByText(/desk lead/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the internal area" }).getAttribute("href")).toBe("/admin");
    expect(screen.queryByText("You are not a member of a business yet.")).toBeNull();
    expect(screen.queryByText("Your business")).toBeNull();
    expect(screen.queryByLabelText("Workspace")).toBeNull();
  });

  it("redirects an anonymous visitor to the sign-in screen", async () => {
    const location = renderAt("/dashboard", <AccountDashboard />);
    await waitFor(() => expect(location.history.at(-1)).toBe("/login"));
  });

  it("waits for the server before deciding", () => {
    api.state.loading = true;
    const location = renderAt("/dashboard", <AccountDashboard />);
    expect(location.history).toEqual(["/dashboard"]);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("signs out through the server and returns to sign-in", async () => {
    api.state.me = SESSION;
    const location = renderAt("/dashboard", <AccountDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(location.history.at(-1)).toBe("/login"));
    expect(api.state.signOutCalls).toBe(1);
    expect(api.state.setData).toEqual([null]);
  });

  it("links to the settings pages, and to business settings only while working inside a business", () => {
    api.state.me = SESSION;
    renderAt("/dashboard", <AccountDashboard />);
    expect(screen.getByRole("link", { name: "Account settings" }).getAttribute("href")).toBe("/settings/account");
    expect(screen.getByRole("link", { name: "Business settings" }).getAttribute("href")).toBe("/settings/business");
    cleanup();
    api.state.me = STAFF;
    renderAt("/dashboard", <AccountDashboard />);
    expect(screen.queryByRole("link", { name: "Business settings" })).toBeNull();
  });
});

describe("landing after sign-in", () => {
  it("sends a client with a business to the dashboard and internal staff without one to the internal area", async () => {
    api.state.me = SESSION;
    const client = renderAt("/login", <LoginPage />);
    await waitFor(() => expect(client.history.at(-1)).toBe("/dashboard"));
    cleanup();
    api.state.me = STAFF;
    const staff = renderAt("/login", <LoginPage />);
    await waitFor(() => expect(staff.history.at(-1)).toBe("/admin"));
  });

  it("uses the landing path the server returns after signing in, with no loop back to sign-in", async () => {
    api.replies.signIn = STAFF;
    const location = renderAt("/login", <LoginPage />);
    fill("Email", "lewis@example.com");
    fill("Password", "correct horse 42");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(location.history.at(-1)).toBe("/admin"));
    expect(location.history.filter(path => path === "/login")).toHaveLength(1);
  });
});

const PROFILE = { businessId: 7, name: "Richie Tech", description: null, yearFounded: null, sector: null, website: null, staffBand: null, revenueBand: null, country: null, state: null, logoUrl: null, role: "owner", canEdit: true, completion: { percent: 20, missing: ["description", "yearFounded", "sector", "website"], complete: false } };

describe("business settings", () => {
  it("lets an owner edit and save the profile for the active business", () => {
    api.state.me = SESSION;
    api.state.businessProfile = PROFILE;
    renderAt("/settings/business", <BusinessSettingsPage />);
    fill("Description", "We sell fabric.");
    fill("Year founded", "2019");
    fill("Sector", "Retail");
    fill("Website", "example.com");
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    expect(api.state.updateBusinessCalls).toEqual([{ businessId: 7, name: "Richie Tech", description: "We sell fabric.", yearFounded: 2019, sector: "Retail", website: "example.com" }]);
    expect(screen.getByText("Logo upload is coming soon.")).toBeTruthy();
  });

  it("rejects a malformed year before calling the server", () => {
    api.state.me = SESSION;
    api.state.businessProfile = PROFILE;
    renderAt("/settings/business", <BusinessSettingsPage />);
    fill("Year founded", "19");
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    expect(screen.getByRole("alert").textContent).toMatch(/four digits/);
    expect(api.state.updateBusinessCalls).toEqual([]);
  });

  it("shows a member the profile read-only, with no save button", () => {
    api.state.me = { ...SESSION, activeBusiness: { ...RICHIE_TECH, role: "member" } };
    api.state.businessProfile = { ...PROFILE, role: "member", canEdit: false };
    renderAt("/settings/business", <BusinessSettingsPage />);
    expect((screen.getByLabelText("Business name") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save business profile" })).toBeNull();
    expect(screen.getByText(/Only owners and business admins can change these details/)).toBeTruthy();
  });

  it("explains that internal staff without a business have no business profile", () => {
    api.state.me = STAFF;
    renderAt("/settings/business", <BusinessSettingsPage />);
    expect(screen.getByText(/not working inside a business/)).toBeTruthy();
  });

  it("shows the server's refusal", () => {
    api.state.me = SESSION;
    api.state.businessProfile = PROFILE;
    api.replies.businessError = "Your role in this business does not allow you to change its profile.";
    renderAt("/settings/business", <BusinessSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    expect(screen.getByRole("alert").textContent).toContain("does not allow");
  });
});

describe("account settings", () => {
  it("shows the email read-only and saves only the person's own name", () => {
    api.state.me = SESSION;
    renderAt("/settings/account", <AccountSettingsPage />);
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("richie@example.com");
    expect(email.readOnly).toBe(true);
    fill("Full name", "Richie A. Okafor");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.state.updateProfileCalls).toEqual([{ fullName: "Richie A. Okafor" }]);
    expect(api.state.setData).toHaveLength(1);
  });

  it("changes the password after checking it in the browser, and sends the current password", () => {
    api.state.me = SESSION;
    renderAt("/settings/account", <AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getAllByRole("alert").at(-1)!.textContent).toMatch(/current password/);
    fill("Current password", "correct horse 42");
    fill("New password", "short1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getAllByRole("alert").at(-1)!.textContent).toMatch(/at least 10/);
    fill("New password", "brand new pass 7");
    fill("Confirm new password", "other pass 99999");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getAllByRole("alert").at(-1)!.textContent).toMatch(/does not match/);
    expect(api.state.changePasswordCalls).toEqual([]);
    fill("Confirm new password", "brand new pass 7");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(api.state.changePasswordCalls).toEqual([{ currentPassword: "correct horse 42", newPassword: "brand new pass 7", confirmPassword: "brand new pass 7" }]);
  });

  it("shows the server's message when the current password is wrong", () => {
    api.state.me = SESSION;
    api.replies.passwordError = "Your current password is not correct.";
    renderAt("/settings/account", <AccountSettingsPage />);
    fill("Current password", "wrong password 1");
    fill("New password", "brand new pass 7");
    fill("Confirm new password", "brand new pass 7");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getAllByRole("alert").at(-1)!.textContent).toBe("Your current password is not correct.");
  });

  it("redirects an anonymous visitor to sign-in", async () => {
    const location = renderAt("/settings/account", <AccountSettingsPage />);
    await waitFor(() => expect(location.history.at(-1)).toBe("/login"));
  });
});
