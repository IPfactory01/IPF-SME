/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { openCheckout, rememberedPayPage, rememberPayPage } from "@/lib/payOnline";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("paying online in the browser", () => {
  it("remembers the pay page for this tab, so the return page can offer to try again", () => {
    expect(rememberedPayPage()).toBeNull();
    rememberPayPage("/pay/CHECKTOKEN1234567890abcdef/full_report");
    expect(rememberedPayPage()).toBe("/pay/CHECKTOKEN1234567890abcdef/full_report");
  });

  it("offers back only a pay page of ours", () => {
    for (const path of ["https://elsewhere.example.com/pay/x/full_report", "//elsewhere.example.com", "/admin", "/pay/x/full_report?next=/admin"]) {
      window.sessionStorage.setItem("ipf-pay-page", path);
      expect(rememberedPayPage(), path).toBeNull();
    }
  });

  it("works without storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => rememberPayPage("/pay/x/full_report")).not.toThrow();
    expect(rememberedPayPage()).toBeNull();
  });

  it("follows only a secure checkout address", () => {
    expect(() => openCheckout("http://checkout.example.com/insecure")).toThrow("The payment page address is not secure.");
    expect(() => openCheckout("javascript:alert(1)")).toThrow();
  });
});
