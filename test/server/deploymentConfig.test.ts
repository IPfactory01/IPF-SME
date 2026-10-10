import { afterEach, describe, expect, it, vi } from "vitest";

const KEYS = ["APP_ORIGIN", "APP_ALTERNATE_ORIGINS", "OWNER_ADMIN_EMAIL", "DISCOVERY_CALL_URL", "VERCEL_GIT_COMMIT_SHA"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

async function loadWith(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
  vi.resetModules();
  const security = await import("@server/security");
  const adminSecurity = await import("@server/adminSecurity");
  const { ENV } = await import("@server/_core/env");
  return { ...security, ...adminSecurity, ENV };
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.resetModules();
});

describe("discovery call booking page", () => {
  it("reads the booking page from DISCOVERY_CALL_URL, trimmed, and is empty when unset", async () => {
    expect((await loadWith({ DISCOVERY_CALL_URL: " https://calendly.com/ip-factory/discovery-call " })).ENV.discoveryCallUrl).toBe("https://calendly.com/ip-factory/discovery-call");
    // Without the setting, the site uses IP Factory's Calendly event from shared/brand.ts.
    expect((await loadWith({})).ENV.discoveryCallUrl).toBe("https://calendly.com/ipfactory-info/ipf-free-20-minute-discovery-call");
  });
});

describe("deployment identity configuration", () => {
  it("names the commit the deployment was built from by its first seven characters, and is empty off Vercel", async () => {
    expect((await loadWith({ VERCEL_GIT_COMMIT_SHA: " 902446e52a1b4962d80025b8415b3464f5d6a867 " })).ENV.buildCommit).toBe("902446e");
    expect((await loadWith({})).ENV.buildCommit).toBe("");
  });

  it("uses the configured public origin for links and origin checks, normalising trailing slashes", async () => {
    const config = await loadWith({ APP_ORIGIN: "https://programme.example.org/", APP_ALTERNATE_ORIGINS: "https://www.programme.example.org" });

    expect(config.getTrustedApplicationOrigin("production")).toBe("https://programme.example.org");
    expect(config.isTrustedBrowserOrigin("https://programme.example.org", "production")).toBe(true);
    expect(config.isTrustedBrowserOrigin("https://www.programme.example.org", "production")).toBe(true);
    expect(config.isTrustedBrowserOrigin("https://emmanueltarfa.com", "production")).toBe(false);
  });

  it("recognises only the configured Super Admin email, case-insensitively", async () => {
    const config = await loadWith({ OWNER_ADMIN_EMAIL: " Owner@Programme.Example.org " });

    expect(config.OWNER_ADMIN_EMAIL).toBe("owner@programme.example.org");
    expect(config.isOwnerAdmin({ email: "owner@programme.example.org" })).toBe(true);
    expect(config.isOwnerAdmin({ email: "emmanueltarfa@gmail.com" })).toBe(false);
  });

  it("keeps the current production identity when nothing is configured", async () => {
    const config = await loadWith({});

    expect(config.getTrustedApplicationOrigin("production")).toBe("https://emmanueltarfa.com");
    expect(config.isTrustedBrowserOrigin("https://www.emmanueltarfa.com", "production")).toBe(true);
    expect(config.OWNER_ADMIN_EMAIL).toBe("emmanueltarfa@gmail.com");
  });

  it("treats blank origin variables as unset instead of failing at import", async () => {
    const config = await loadWith({ APP_ORIGIN: "", APP_ALTERNATE_ORIGINS: "" });

    expect(config.getTrustedApplicationOrigin("production")).toBe("https://emmanueltarfa.com");
    expect(config.isTrustedBrowserOrigin("https://www.emmanueltarfa.com", "production")).toBe(true);
  });
});
