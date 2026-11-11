import { describe, expect, it } from "vitest";
import { clockReminderEmail, feePausedLeadEmail, feeReminderEmail, feeStageOn, isCronRequest, isQuietHour, itemsReminderEmail, itemStagesOn, outstandingLeadEmail } from "@server/reminders";

/** The morning reminders (R12, R16, R57): their windows, quiet hours, the secret, and the words. Fictional businesses. */
describe("when each reminder goes", () => {
  it("reminds of a fee five days before to the day before, on the day, three days late and seven days late", () => {
    expect(feeStageOn("2026-11-20", "2026-11-14")).toBeNull();
    expect(feeStageOn("2026-11-20", "2026-11-15")).toBe("soon");
    expect(feeStageOn("2026-11-20", "2026-11-19")).toBe("soon");
    expect(feeStageOn("2026-11-20", "2026-11-20")).toBe("today");
    expect(feeStageOn("2026-11-20", "2026-11-22")).toBe("today");
    expect(feeStageOn("2026-11-20", "2026-11-23")).toBe("late_3");
    expect(feeStageOn("2026-11-20", "2026-11-27")).toBe("late_7");
    expect(feeStageOn("2026-11-20", "2026-12-04")).toBeNull();
  });

  it("reminds of an item two days before and two days after, and tells the lead from three days after", () => {
    expect(itemStagesOn("2026-11-20", "2026-11-17")).toEqual([]);
    expect(itemStagesOn("2026-11-20", "2026-11-18")).toEqual(["soon"]);
    expect(itemStagesOn("2026-11-20", "2026-11-20")).toEqual([]);
    expect(itemStagesOn("2026-11-20", "2026-11-22")).toEqual(["late"]);
    expect(itemStagesOn("2026-11-20", "2026-11-23")).toEqual(["late", "lead"]);
    expect(itemStagesOn("2026-11-20", "2026-11-30")).toEqual(["lead"]);
    expect(itemStagesOn("2026-11-20", "2026-12-01")).toEqual([]);
  });

  it("sends nothing between 9pm and 7am Lagos time", () => {
    expect(isQuietHour(new Date("2026-11-12T06:31:00Z"))).toBe(false); // 07:31 in Lagos
    expect(isQuietHour(new Date("2026-11-12T05:59:00Z"))).toBe(true); // 06:59
    expect(isQuietHour(new Date("2026-11-12T19:59:00Z"))).toBe(false); // 20:59
    expect(isQuietHour(new Date("2026-11-12T20:00:00Z"))).toBe(true); // 21:00
  });

  it("answers only Vercel Cron's secret, and nobody when no secret is set", () => {
    expect(isCronRequest("Bearer correct-secret", "correct-secret")).toBe(true);
    expect(isCronRequest("Bearer wrong", "correct-secret")).toBe(false);
    expect(isCronRequest(undefined, "correct-secret")).toBe(false);
    expect(isCronRequest("Bearer ", "")).toBe(false);
  });
});

describe("the reminder emails", () => {
  const fee = { name: "Ada Okafor", title: "Digital Marketing", label: "Month 2 service fee", left: 470000, dueOn: "2026-12-02", reference: "TS-F-000012", payUrl: "https://ipfactory.example.test/pay/fee/12/token", roomUrl: "https://ipfactory.example.test/dashboard" };

  it("names the fee, what is left, the day and the pay link at each stage", () => {
    expect(feeReminderEmail({ ...fee, stage: "soon" }).subject).toBe("Coming up: Month 2 service fee, ₦470,000 due Wednesday 2 December");
    expect(feeReminderEmail({ ...fee, stage: "today" }).subject).toBe("Due today: Month 2 service fee, ₦470,000");
    expect(feeReminderEmail({ ...fee, stage: "late_3" }).subject).toBe("Now late: Month 2 service fee, ₦470,000 was due Wednesday 2 December");
    const paused = feeReminderEmail({ ...fee, stage: "late_7" });
    expect(paused.subject).toBe("Work on your Digital Marketing is paused: Month 2 service fee");
    expect(paused.body).toContain("starts it again at once");
    expect(paused.body).toContain("Pay securely with Paystack: https://ipfactory.example.test/pay/fee/12/token");
    expect(paused.body).toContain("Reference: TS-F-000012");
    expect(feeReminderEmail({ ...fee, stage: "today", payUrl: null }).body).toContain("Your room has the details to pay");
    expect(feePausedLeadEmail({ businessName: "Ada Foods", title: "Digital Marketing", label: "Month 2 service fee", left: 470000, dueOn: "2026-12-02" }).subject).toBe("Work paused: Ada Foods, Month 2 service fee");
  });

  it("lists the client's items in one email, and tells the lead what is outstanding", () => {
    const items = [{ title: "Your price list", dueOn: "2026-11-19" }, { title: "Logo, colours and fonts", dueOn: "2026-11-20" }];
    const soon = itemsReminderEmail({ stage: "soon", name: "Ada Okafor", title: "Digital Marketing", items, roomUrl: "https://ipfactory.example.test/dashboard" });
    expect(soon.subject).toBe("Coming up: Your price list and 1 more, due Thursday 19 November");
    expect(soon.body).toContain("• Logo, colours and fonts, due Friday 20 November");
    expect(itemsReminderEmail({ stage: "late", name: "", title: "Digital Marketing", items: items.slice(0, 1), roomUrl: "x" }).subject).toBe("Still waiting: Your price list");
    expect(outstandingLeadEmail({ businessName: "Ada Foods", items: items.slice(0, 1), today: "2026-11-23" }).body).toContain("Your price list, due Thursday 19 November (4 days late)");
  });

  it("warns of a First edit due within a day, and says when it is past its time", () => {
    const dueAt = new Date("2026-11-14T14:05:00Z");
    expect(clockReminderEmail({ late: false, name: "Kemi Producer", label: "First edit", title: "Send week 3 footage", businessName: "Ada Foods", dueAt }).subject).toBe("First edit due within a day: Send week 3 footage");
    const late = clockReminderEmail({ late: true, name: "", label: "First edit", title: "Send week 3 footage", businessName: "Ada Foods", dueAt });
    expect(late.subject).toBe("First edit past its time: Send week 3 footage, Ada Foods");
    expect(late.body).toContain("was due by Sat, 14 Nov 2026, 3:05 pm (Lagos time)");
  });
});
