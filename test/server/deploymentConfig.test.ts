import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const KEYS = ["NODE_ENV", "APP_ORIGIN", "APP_ALTERNATE_ORIGINS", "OWNER_ADMIN_EMAIL", "DISCOVERY_CALL_URL", "VERCEL_GIT_COMMIT_SHA", "VERCEL_URL", "DATABASE_URL", "JWT_SECRET", "RESEND_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

async function loadWith(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
  vi.resetModules();
  const security = await import("@server/security");
  const adminSecurity = await import("@server/adminSecurity");
  const { ENV, REQUIRED_IN_PRODUCTION } = await import("@server/_core/env");
  const { healthReport } = await import("@server/_core/health");
  return { ...security, ...adminSecurity, ENV, REQUIRED_IN_PRODUCTION, healthReport };
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

describe("the Vercel function", () => {
  it("may run for a minute: the Business Check waits on the AI summary and two emails in one request", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { functions?: Record<string, { maxDuration?: number }> };
    expect(config.functions?.["api/index.js"]?.maxDuration).toBe(60);
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

  it("has no personal defaults: without APP_ORIGIN the deployment's own address is used and nobody is Super Admin by email", async () => {
    const config = await loadWith({ VERCEL_URL: "ipf-sme-abc123.vercel.app" });

    expect(config.getTrustedApplicationOrigin("production")).toBe("https://ipf-sme-abc123.vercel.app");
    expect(config.isTrustedBrowserOrigin("https://ipf-sme-abc123.vercel.app", "production")).toBe(true);
    expect(config.isTrustedBrowserOrigin("https://www.emmanueltarfa.com", "production")).toBe(false);
    expect(config.ENV.appAlternateOrigins).toEqual([]);
    expect(config.OWNER_ADMIN_EMAIL).toBe("");
    expect(config.isOwnerAdmin({ email: "emmanueltarfa@gmail.com" })).toBe(false);
    expect(config.isOwnerAdmin({ email: "" })).toBe(false);
  });

  it("treats blank origin variables as unset instead of failing at import, falling back to localhost off Vercel", async () => {
    const config = await loadWith({ APP_ORIGIN: "", APP_ALTERNATE_ORIGINS: "" });

    expect(config.getTrustedApplicationOrigin("production")).toBe("http://localhost:3000");
    expect(config.ENV.missingSettings).toEqual([]);
  });

  it("names the settings production cannot run without, and health answers 503 until they are set", async () => {
    const bare = await loadWith({ NODE_ENV: "production", VERCEL_URL: "ipf-sme-abc123.vercel.app" });
    expect(bare.REQUIRED_IN_PRODUCTION).toEqual(["DATABASE_URL", "JWT_SECRET", "APP_ORIGIN", "OWNER_ADMIN_EMAIL", "RESEND_API_KEY"]);
    expect(bare.ENV.missingSettings).toEqual(["DATABASE_URL", "JWT_SECRET", "APP_ORIGIN", "OWNER_ADMIN_EMAIL", "RESEND_API_KEY"]);
    expect(bare.healthReport()).toEqual({ status: 503, body: { ok: false, service: "ipfactory-sme", build: null, missing: ["DATABASE_URL", "JWT_SECRET", "APP_ORIGIN", "OWNER_ADMIN_EMAIL", "RESEND_API_KEY"] } });

    const partial = await loadWith({ NODE_ENV: "production", DATABASE_URL: "postgresql://x", JWT_SECRET: "s", APP_ORIGIN: "https://ipfactory.co", OWNER_ADMIN_EMAIL: " ", RESEND_API_KEY: "re_x", VERCEL_GIT_COMMIT_SHA: "abcdef0123" });
    expect(partial.ENV.missingSettings).toEqual(["OWNER_ADMIN_EMAIL"]);
    expect(partial.healthReport()).toEqual({ status: 503, body: { ok: false, service: "ipfactory-sme", build: "abcdef0", missing: ["OWNER_ADMIN_EMAIL"] } });

    const complete = await loadWith({ NODE_ENV: "production", DATABASE_URL: "postgresql://x", JWT_SECRET: "s", APP_ORIGIN: "https://ipfactory.co", OWNER_ADMIN_EMAIL: "owner@programme.example.org", RESEND_API_KEY: "re_x" });
    expect(complete.ENV.missingSettings).toEqual([]);
    expect(complete.healthReport()).toEqual({ status: 200, body: { ok: true, service: "ipfactory-sme", build: null } });
  });
});
