import { describe, expect, it } from "vitest";
import { messageEmail, newFileEmail, readyEmail, receivedEmail, requestEmail } from "@server/requestEmails";

/** Asking the client (R78): the four emails, in the words each side reads. Fictional people and businesses. */
const origin = "https://ipfactory.example.test";

describe("the request emails", () => {
  it("asks the owner for something: who asked, what, the brief, the day and when the First edit follows", () => {
    const email = requestEmail({ name: "Ada Okafor", askedBy: "Kemi Producer", title: "A video of the new menu", brief: "Thirty seconds, filmed upright.", dueOn: "2026-11-19", turnaround: "first_edit", engagementTitle: "Digital Marketing", origin });
    expect(email.subject).toBe("New request: A video of the new menu, due Thursday 19 November");
    expect(email.body).toContain("Hello Ada,");
    expect(email.body).toContain("Kemi at IP Factory has asked for this, for your Digital Marketing:");
    expect(email.body).toContain("Thirty seconds, filmed upright.");
    expect(email.body).toContain("Due: Thursday 19 November.");
    expect(email.body).toContain("we send you the first edit within 48 hours");
    expect(email.body).toContain(`${origin}/dashboard`);
    expect(requestEmail({ name: "", askedBy: "", title: "Send your price list", brief: null, dueOn: "2026-11-19", turnaround: null, engagementTitle: "Business Review", origin }).body).not.toContain("within 48 hours");
  });

  it("carries a message to the other side: the team member's first name to the client, the business to the team", () => {
    const toClient = messageEmail({ name: "Ada Okafor", author: "Kemi Producer", fromTeam: true, businessName: "Ada Foods", title: "Send week 3 footage", body: "Film the kitchen, please.", origin });
    expect(toClient.subject).toBe("Kemi wrote on Send week 3 footage");
    expect(toClient.body).toContain("Kemi at IP Factory wrote on \"Send week 3 footage\":");
    expect(toClient.body).toContain(`Reply in your room: ${origin}/dashboard`);
    const toTeam = messageEmail({ name: "Kemi Producer", author: "Ada Okafor", fromTeam: false, businessName: "Ada Foods", title: "Send week 3 footage", body: "I am travelling this week.", origin });
    expect(toTeam.subject).toBe("Ada Foods wrote on Send week 3 footage");
    expect(toTeam.body).toContain("Ada Okafor at Ada Foods wrote on");
    expect(toTeam.body).toContain(`Reply in the engagement: ${origin}/admin`);
  });

  it("tells the person it goes to what arrived and when the First edit is due, in Lagos time", () => {
    const email = receivedEmail({ name: "Kemi Producer", businessName: "Ada Foods", title: "Send week 3 footage", how: "a link to a shared folder", note: null, clock: { label: "First edit", dueAt: new Date("2026-11-14T14:05:00Z"), hours: 48 }, origin });
    expect(email.subject).toBe("Received from Ada Foods: Send week 3 footage. First edit due Sat, 14 Nov 2026, 3:05 pm");
    expect(email.body).toContain("Ada Foods has sent \"Send week 3 footage\" (a link to a shared folder).");
    expect(email.body).toContain("The first edit is due by Sat, 14 Nov 2026, 3:05 pm (Lagos time): 48 hours from when it arrived.");
    expect(receivedEmail({ name: "", businessName: "Ada Foods", title: "Send your price list", how: null, note: "On WhatsApp", clock: null, origin }).subject).toBe("Received from Ada Foods: Send your price list");
  });

  it("tells the owner the First edit waits for their approval", () => {
    const email = readyEmail({ name: "Ada Okafor", label: "First edit", title: "Send week 3 footage", origin });
    expect(email.subject).toBe("Ready for your approval: the first edit of Send week 3 footage");
    expect(email.body).toContain("is in your room for your approval");
  });

  it("tells the owners and the lead of a new file on an item, with a link to the item (R89)", () => {
    const fromClient = newFileEmail({ name: "Lola Lead", uploader: "Ada Okafor", fromClient: true, businessName: "Ada Foods", title: "Send your logo, colours and fonts", fileName: "IMG_1264.jpeg", link: "https://ipfactory.example.test/admin?engagement=4&task=51" });
    expect(fromClient.subject).toBe("New file on Send your logo, colours and fonts: IMG_1264.jpeg");
    expect(fromClient.body).toContain("Ada Foods added \"IMG_1264.jpeg\" to \"Send your logo, colours and fonts\".");
    expect(fromClient.body).toContain("Open the item: https://ipfactory.example.test/admin?engagement=4&task=51");
    expect(newFileEmail({ name: "", uploader: "Mira Marketer", fromClient: false, businessName: "Ada Foods", title: "Prepare the content plan for month 1", fileName: "plan.pdf", link: "x" }).body).toContain("Mira added \"plan.pdf\" to \"Prepare the content plan for month 1\" for Ada Foods.");
  });
});
