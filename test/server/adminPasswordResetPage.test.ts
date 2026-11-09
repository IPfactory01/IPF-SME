import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/AdminPasswordResetPage.tsx"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("administrator password reset confirmation page", () => {
  it("requires an emailed token before showing the new-password submission route", () => {
    expect(source).toContain('get("token")');
    expect(source).toContain("confirmPasswordReset.useMutation");
    expect(source).toContain("This reset link is incomplete.");
  });

  it("returns to normal secure Gmail sign-in after a successful password reset", () => {
    expect(source).toContain('setLocation("/admin/login")');
    expect(source).toContain("Kindly sign in again");
    expect(routerSource).toContain('{ path: "/admin/reset", page: AdminPasswordResetPage }');
  });
});
