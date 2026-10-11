import { beforeEach, describe, expect, it, vi } from "vitest";
// These tests exercise the JUMP programme's own forms, which are closed unless the flag is on.
vi.hoisted(() => { process.env.LEGACY_JUMP_ENABLED = "1"; });
import type { TrpcContext } from "@server/_core/context";

const mocked = vi.hoisted(() => ({
  getDb: vi.fn(),
  deliverEmail: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("@server/db", () => ({ getDb: mocked.getDb }));
vi.mock("@server/email", () => ({ deliverEmail: mocked.deliverEmail }));
vi.mock("@server/_core/notification", () => ({ notifyOwner: mocked.notifyOwner }));

import { registrationRouter } from "@server/routers/registration";

const registrationInput = {
  fullName: "Registration Regression Test",
  email: "registration-regression@example.test",
  phone: "+234 800 000 0000",
  businessName: "Controlled Test Business",
  businessDescription: "A clearly labelled controlled test used to verify registration persistence.",
  businessModel: "Expert" as const,
  package: "Foundation" as const,
  question: "Does the public registration form save correctly?",
};

const publicContext: TrpcContext = {
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  user: null,
};

function createDb(existingRows: Array<{
  id: number;
  email: string;
  fullName: string;
  businessName: string;
  package: "Foundation" | "Engine Room" | "Boardroom";
  supersededByRegistrationId: number | null;
}> = []) {
  const registrationInsertValues = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 77 }]) });
  const emailLogInsertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi
    .fn()
    .mockReturnValueOnce({ values: registrationInsertValues })
    .mockReturnValueOnce({ values: emailLogInsertValues });

  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue(existingRows),
    }),
    insert,
  };

  return { db, insert, registrationInsertValues, emailLogInsertValues };
}

describe("registration.submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    mocked.notifyOwner.mockResolvedValue(true);
  });

  it("persists a valid registration using bookingToken and creates its email audit entry", async () => {
    const { db, registrationInsertValues, emailLogInsertValues } = createDb();
    mocked.getDb.mockResolvedValue(db);

    const caller = registrationRouter.createCaller(publicContext);
    const result = await caller.submit(registrationInput);

    expect(result).toMatchObject({
      success: true,
      status: "Pending",
      emailStatus: "Simulated",
    });
    expect(result.bookingToken).toHaveLength(32);
    expect(registrationInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: registrationInput.email,
        bookingToken: result.bookingToken,
        depositPaid: "Pending",
        instalment1: "Pending",
        instalment2: "Pending",
      }),
    );
    expect(registrationInsertValues.mock.calls[0]?.[0]).not.toHaveProperty("portalToken");
    expect(mocked.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: registrationInput.email }),
    );
    expect(emailLogInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ registrationId: 77, recipientEmail: registrationInput.email }),
    );
  });

  it("rejects a duplicate email before writing a registration or sending mail", async () => {
    const { db, insert } = createDb([{
      id: 4,
      email: registrationInput.email,
      fullName: registrationInput.fullName,
      businessName: registrationInput.businessName,
      package: "Foundation",
      supersededByRegistrationId: null,
    }]);
    mocked.getDb.mockResolvedValue(db);

    const caller = registrationRouter.createCaller(publicContext);

    await expect(caller.submit(registrationInput)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Your Foundation registration is already active. Kindly use that single participant experience rather than submitting a second pathway entry.",
    });
    expect(insert).not.toHaveBeenCalled();
    expect(mocked.deliverEmail).not.toHaveBeenCalled();
  });
});
