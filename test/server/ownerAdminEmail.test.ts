import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadEnv(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("OWNER_ADMIN_EMAIL", undefined as unknown as string);
  else vi.stubEnv("OWNER_ADMIN_EMAIL", value);
  return (await import("@server/_core/env")).ENV.ownerAdminEmail;
}

// These reload the server modules inside the test, so a cold import can take several seconds when files run in parallel.
describe("OWNER_ADMIN_EMAIL", { timeout: 30_000 }, () => {
  it("is empty when unset, blank or only spaces, so nobody is Super Admin by email until it is set", async () => {
    expect(await loadEnv(undefined)).toBe("");
    expect(await loadEnv("")).toBe("");
    expect(await loadEnv("   ")).toBe("");
  });

  it("is trimmed and lower-cased when set", async () => {
    expect(await loadEnv("  Owner@Example.COM ")).toBe("owner@example.com");
  });
});

describe("isOwnerAdmin", { timeout: 30_000 }, () => {
  it("matches the owner email case-insensitively and nobody else", async () => {
    vi.resetModules();
    vi.stubEnv("OWNER_ADMIN_EMAIL", "owner@example.com");
    const { isOwnerAdmin } = await import("@server/adminSecurity");
    expect(isOwnerAdmin({ email: " Owner@Example.com " })).toBe(true);
    expect(isOwnerAdmin({ email: "someone@example.com" })).toBe(false);
  });

  it("never treats a user without an email as the owner, even when the variable is blank", async () => {
    vi.resetModules();
    vi.stubEnv("OWNER_ADMIN_EMAIL", "");
    const { isOwnerAdmin } = await import("@server/adminSecurity");
    expect(isOwnerAdmin({ email: null })).toBe(false);
    expect(isOwnerAdmin({ email: "" })).toBe(false);
    expect(isOwnerAdmin({ email: "   " })).toBe(false);
  });
});
