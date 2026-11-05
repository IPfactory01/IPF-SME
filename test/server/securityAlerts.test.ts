import { describe, expect, it } from "vitest";
import { buildAlertEmail } from "@server/securityAlerts";
import { BRAND } from "@shared/brand";

describe("security alert email", () => {
  it("names the product and the event in the subject, and says who receives it and where the record is", () => {
    const message = buildAlertEmail({ subject: "New device: ada@example.com", lines: ["Ada signed in from a new browser."], event: "staff_new_device" });
    expect(message.subject).toBe(`[${BRAND.productName} security] New device: ada@example.com`);
    expect(message.body.startsWith("Ada signed in from a new browser.")).toBe(true);
    expect(message.body).toContain("every Super Admin");
    expect(message.body).toContain("audit log");
  });
});
