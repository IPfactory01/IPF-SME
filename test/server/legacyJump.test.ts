/**
 * The JUMP programme's public forms stay in the code for the record but are closed unless LEGACY_JUMP_ENABLED is on:
 * each one sends email or calls a provider without a limit, and The Shift does not use them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "@server/_core/context";

const mocked = vi.hoisted(() => ({ getDb: vi.fn(), deliverEmail: vi.fn() }));
vi.mock("@server/db", () => ({ getDb: mocked.getDb }));
vi.mock("@server/email", async importOriginal => ({ ...(await importOriginal<typeof import("@server/email")>()), deliverEmail: mocked.deliverEmail }));

import { registrationRouter } from "@server/routers/registration";
import { pricingRequestsRouter } from "@server/routers/pricingRequests";
import { LEGACY_CLOSED_MESSAGE } from "@server/_core/legacy";

const context = { req: { protocol: "https", headers: {}, ip: "203.0.113.5" }, res: {}, user: null } as unknown as TrpcContext;
const closed = { code: "FORBIDDEN", message: LEGACY_CLOSED_MESSAGE };

describe("JUMP programme public forms", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("are closed by default: nothing is read from the database and nothing is sent", async () => {
    const registration = registrationRouter.createCaller(context);
    await expect(registration.submit({
      fullName: "Closed Form", email: "closed@example.test", phone: "+234 800 000 0000", businessName: "Closed Co",
      businessDescription: "A form that should be refused before anything happens.", businessModel: "Expert", package: "Foundation", question: "Is it closed?",
    })).rejects.toMatchObject(closed);
    await expect(registration.requestPortalLink({ email: "closed@example.test" })).rejects.toMatchObject(closed);
    await expect(registration.initializePaystack({ registrationId: 1, email: "closed@example.test", amountInNaira: 1000, packageName: "Foundation" })).rejects.toMatchObject(closed);
    await expect(registration.verifyPaystack({ reference: "reference-123", registrationId: 1 })).rejects.toMatchObject(closed);
    await expect(pricingRequestsRouter.createCaller(context).submitPublic({ fullName: "Closed Form", email: "closed@example.test", businessName: "Closed Co", preferredPackage: "Foundation" })).rejects.toMatchObject(closed);
    expect(mocked.getDb).not.toHaveBeenCalled();
    expect(mocked.deliverEmail).not.toHaveBeenCalled();
  });

  it("close the participant's emailed diagnostic too, which could send a PDF to any address", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers/participant.ts"), "utf8");
    const section = source.slice(source.indexOf("emailWorkingDiagnosticReport:"));
    expect(section.indexOf("requireLegacyJump();")).toBeGreaterThan(-1);
    expect(section.indexOf("requireLegacyJump();")).toBeLessThan(section.indexOf("getDb()"));
  });

  it("open only when LEGACY_JUMP_ENABLED is 1, true or yes", async () => {
    const load = async (value: string | undefined) => {
      vi.resetModules();
      if (value === undefined) vi.stubEnv("LEGACY_JUMP_ENABLED", undefined as unknown as string);
      else vi.stubEnv("LEGACY_JUMP_ENABLED", value);
      return (await import("@server/_core/env")).ENV.legacyJumpEnabled;
    };
    expect(await load(undefined)).toBe(false);
    for (const off of ["", "0", "false", "no", "off", "enabled"]) expect(await load(off)).toBe(false);
    for (const on of ["1", "true", "YES", " Yes "]) expect(await load(on)).toBe(true);
  }, 30_000);
});
