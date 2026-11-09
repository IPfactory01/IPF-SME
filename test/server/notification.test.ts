import { beforeEach, describe, expect, it, vi } from "vitest";

const emailMock = vi.hoisted(() => ({ deliverEmail: vi.fn() }));
vi.mock("@server/email", () => ({ deliverEmail: emailMock.deliverEmail }));

import { BRAND } from "@shared/brand";
import { notifyOwner } from "@server/_core/notification";

describe("desk notifications", () => {
  beforeEach(() => emailMock.deliverEmail.mockReset());

  it("emails the administration mailbox with the title as subject", async () => {
    emailMock.deliverEmail.mockResolvedValue({ status: "Sent", providerMessageId: "m1" });

    await expect(notifyOwner({ title: "  New registration  ", content: "Details" })).resolves.toBe(true);

    expect(emailMock.deliverEmail).toHaveBeenCalledWith({ to: BRAND.businessSupportMailbox, subject: "New registration", body: "Details", sender: "business_support" });
  });

  it("reports an undelivered notification without throwing", async () => {
    emailMock.deliverEmail.mockResolvedValue({ status: "Failed", reason: "not configured" });

    await expect(notifyOwner({ title: "New registration", content: "Details" })).resolves.toBe(false);
  });

  it("rejects an empty title before sending anything", async () => {
    await expect(notifyOwner({ title: " ", content: "Details" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(emailMock.deliverEmail).not.toHaveBeenCalled();
  });
});
