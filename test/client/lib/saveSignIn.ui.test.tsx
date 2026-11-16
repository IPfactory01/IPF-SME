/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { offerToSaveSignIn } from "@/lib/saveSignIn";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(navigator, "credentials", { configurable: true, value: undefined });
});

const withStore = (store: (credential: unknown) => Promise<unknown>) => {
  vi.stubGlobal("PasswordCredential", class { constructor(public data: unknown) { Object.assign(this, data as object); } });
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { store } });
};

describe("offering to save the sign-in in the browser (ET, 16 November 2026)", () => {
  it("hands the email and password to the browser's own password manager", async () => {
    const stored: unknown[] = [];
    withStore(async credential => void stored.push(credential));
    expect(await offerToSaveSignIn(" staff@example.test ", "correct horse 42")).toBe(true);
    expect(stored).toEqual([expect.objectContaining({ id: "staff@example.test", password: "correct horse 42" })]);
  });

  it("does nothing where the browser has no such store (Safari, Firefox), or without both parts", async () => {
    expect(await offerToSaveSignIn("staff@example.test", "correct horse 42")).toBe(false);
    withStore(async () => undefined);
    expect(await offerToSaveSignIn("", "correct horse 42")).toBe(false);
    expect(await offerToSaveSignIn("staff@example.test", "")).toBe(false);
  });

  it("never holds up signing in: a store that hangs or fails is let go", async () => {
    vi.useFakeTimers();
    withStore(() => new Promise(() => undefined));
    const pending = offerToSaveSignIn("staff@example.test", "correct horse 42");
    await vi.advanceTimersByTimeAsync(1600);
    expect(await pending).toBe(true);
    vi.useRealTimers();
    withStore(async () => { throw new Error("blocked"); });
    expect(await offerToSaveSignIn("staff@example.test", "correct horse 42")).toBe(false);
  });
});
