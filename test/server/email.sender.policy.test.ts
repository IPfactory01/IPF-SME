import { describe, expect, it } from "vitest";
import { BUSINESS_SUPPORT_MAILBOX, BUSINESS_SUPPORT_SENDER, resendRequestBody } from "@server/email";

/** One sender for every email (C19, 9 November 2026): the JUMP programme mailbox and its layout were removed. */
describe("email sender policy", () => {
  it("sends an email that names no sender from IP Factory, with replies to the office", () => {
    const body = resendRequestBody({ to: "ada@example.com", subject: "A notice", body: "Hello" });
    expect(body.from).toBe(BUSINESS_SUPPORT_SENDER);
    expect(body.reply_to).toBe(BUSINESS_SUPPORT_MAILBOX);
  });

  it("offers no other identity to choose", async () => {
    const email = await import("@server/email");
    expect(Object.keys(email).filter((name) => /jump|programme/i.test(name))).toEqual([]);
  });
});
