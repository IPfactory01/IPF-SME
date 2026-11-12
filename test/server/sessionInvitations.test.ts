import { describe, expect, it } from "vitest";
import { sessionChange, sessionEmail, sessionInvitationIcs } from "@server/sessionInvitations";

/**
 * Session emails (R75): what counts as a change worth an email, the calendar invitation, and the words. Who is emailed,
 * end to end, is in test/db/engagements.db.test.ts and test/db/sessionBooking.db.test.ts.
 */
const NOW = Date.parse("2026-11-10T12:00:00Z");
const at = (iso: string) => new Date(iso);
const planned = { title: "Weekly Check-in", scheduledFor: at("2026-11-12T09:00:00Z"), durationMinutes: 45, meetingLink: "https://zoom.example.test/j/1", status: "planned" };

describe("a change worth an email", () => {
  it("is a time given, a new time, a new length, link or title, or a cancellation, for a Session still to come", () => {
    expect(sessionChange(null, planned, NOW)).toBe("booked");
    expect(sessionChange({ ...planned, scheduledFor: null }, planned, NOW)).toBe("booked");
    expect(sessionChange({ ...planned, status: "cancelled" }, planned, NOW)).toBe("booked");
    expect(sessionChange(planned, { ...planned, scheduledFor: at("2026-11-13T09:00:00Z") }, NOW)).toBe("moved");
    expect(sessionChange(planned, { ...planned, meetingLink: "https://zoom.example.test/j/2" }, NOW)).toBe("updated");
    expect(sessionChange(planned, { ...planned, durationMinutes: 60 }, NOW)).toBe("updated");
    expect(sessionChange(planned, { ...planned, title: "Weekly Check-in 2" }, NOW)).toBe("updated");
    expect(sessionChange(planned, { ...planned, status: "cancelled" }, NOW)).toBe("cancelled");
  });

  it("is nothing for the agenda alone, a Session held, one with no time, one already past, or one cancelled twice", () => {
    expect(sessionChange(planned, { ...planned }, NOW)).toBeNull();
    expect(sessionChange(planned, { ...planned, status: "held" }, NOW)).toBeNull();
    expect(sessionChange(null, { ...planned, scheduledFor: null }, NOW)).toBeNull();
    expect(sessionChange(null, { ...planned, scheduledFor: at("2026-11-09T09:00:00Z") }, NOW)).toBeNull();
    expect(sessionChange({ ...planned, status: "cancelled" }, { ...planned, status: "cancelled" }, NOW)).toBeNull();
    expect(sessionChange({ ...planned, scheduledFor: at("2026-11-09T09:00:00Z") }, { ...planned, scheduledFor: at("2026-11-09T09:00:00Z"), status: "cancelled" }, NOW)).toBeNull();
  });
});

describe("the calendar invitation", () => {
  const invite = (cancelled: boolean, now = NOW) => sessionInvitationIcs({ sessionId: 41, title: "Weekly Check-in", businessName: "Crown Studios, Lekki", start: planned.scheduledFor, minutes: 45, meetingLink: planned.meetingLink, attendee: { name: "Ada Example", email: "ada@example.com" }, cancelled, now });

  it("keeps one UID per Session and a later SEQUENCE, so a new time moves the event in each calendar", () => {
    const folded = invite(false);
    // Calendars unfold a line that continues on the next with a leading space.
    const first = folded.replace(/\r\n /g, "");
    const later = invite(false, NOW + 60_000).replace(/\r\n /g, "");
    expect(first).toContain("UID:session-41@ipfactory.co");
    expect(Number(/SEQUENCE:(\d+)/.exec(later)![1])).toBeGreaterThan(Number(/SEQUENCE:(\d+)/.exec(first)![1]));
    expect(first).toContain("METHOD:REQUEST");
    expect(first).toContain("STATUS:CONFIRMED");
    expect(first).toContain("DTSTART:20261112T090000Z");
    expect(first).toContain("DTEND:20261112T094500Z");
    expect(first).toContain("ORGANIZER;CN=IP Factory:mailto:info@ipfactory.co");
    expect(first).toContain("RSVP=FALSE:mailto:ada@example.com");
    expect(first).toContain("SUMMARY:Weekly Check-in: Crown Studios\\, Lekki");
    expect(first).toContain("URL:https://zoom.example.test/j/1");
    // The calendar format: CRLF line endings and no line longer than 75 characters.
    expect(folded.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(folded.split("\r\n").every(line => line.length <= 75)).toBe(true);
  });

  it("takes the Session out of the calendar when it is cancelled", () => {
    const cancelled = invite(true);
    expect(cancelled).toContain("METHOD:CANCEL");
    expect(cancelled).toContain("STATUS:CANCELLED");
    expect(cancelled).toContain("UID:session-41@ipfactory.co");
    expect(cancelled).not.toContain("BEGIN:VALARM");
  });

  it("asks the calendar to alert an hour before (R59)", () => {
    const unfolded = invite(false).replace(/\r\n /g, "");
    expect(unfolded).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Weekly Check-in in an hour\r\nTRIGGER:-PT1H\r\nEND:VALARM\r\nEND:VEVENT");
  });
});

describe("the email", () => {
  const base = { title: "Weekly Check-in", businessName: "Crown Studios", start: planned.scheduledFor, minutes: 45, meetingLink: planned.meetingLink, origin: "https://app.example.test" };

  it("tells the team the business, the time in Lagos and the Join link, and points to the engagement", () => {
    const message = sessionEmail({ ...base, change: "booked", name: "Kingsley Ezeh", forClient: false });
    expect(message.subject).toBe("Session booked: Weekly Check-in, Thu, 12 Nov 2026, 10:00 am");
    expect(message.body).toContain("Hello Kingsley,");
    expect(message.body).toContain("Weekly Check-in with Crown Studios is booked for Thu, 12 Nov 2026, 10:00 am (Lagos time), for 45 minutes.");
    expect(message.body).toContain("Join: https://zoom.example.test/j/1");
    expect(message.body).toContain("The calendar invitation is attached.");
    expect(message.body).toContain("The engagement: https://app.example.test/admin");
  });

  it("tells the client their team, and points to their room; a Session without a link says where it will be", () => {
    const message = sessionEmail({ ...base, change: "moved", name: "Marcelle Example", forClient: true, meetingLink: null });
    expect(message.subject).toBe("Session moved: Weekly Check-in, now Thu, 12 Nov 2026, 10:00 am");
    expect(message.body).toContain("Weekly Check-in with your team at IP Factory has moved. It is now on Thu, 12 Nov 2026, 10:00 am (Lagos time), for 45 minutes.");
    expect(message.body).toContain("Join: the link will be in the room before the Session.");
    expect(message.body).toContain("Your room: https://app.example.test/dashboard");
  });

  it("says what changed when the time stays, and that a cancellation leaves the calendar", () => {
    expect(sessionEmail({ ...base, change: "updated", name: "Ada", forClient: false }).subject).toBe("Session updated: Weekly Check-in, Thu, 12 Nov 2026, 10:00 am");
    const cancelled = sessionEmail({ ...base, change: "cancelled", name: "Ada", forClient: true });
    expect(cancelled.subject).toBe("Session cancelled: Weekly Check-in, Thu, 12 Nov 2026, 10:00 am");
    expect(cancelled.body).toContain("Weekly Check-in with your team at IP Factory on Thu, 12 Nov 2026, 10:00 am (Lagos time) is cancelled.");
    expect(cancelled.body).toContain("The calendar invitation attached takes it out of your calendar.");
    expect(cancelled.body).not.toContain("Join:");
  });
});

describe("a recurring meeting from Zoom (R81)", () => {
  it("puts every date in one published calendar file, each with its own UID, and lists them in one email", async () => {
    const { sessionSeriesIcs, seriesEmail } = await import("@server/sessionInvitations");
    const events = [17, 24].map((day, index) => ({ sessionId: 40 + index, title: "Weekly Check-in", businessName: "Ada Foods", start: new Date(`2026-11-${day}T09:00:00Z`), minutes: 30, meetingLink: "https://zoom.example.test/j/1" }));
    const ics = sessionSeriesIcs({ events, attendee: { name: "Ada Okafor", email: "ada@example.com" }, now: Date.parse("2026-11-11T10:00:00Z") }).replace(/\r\n /g, "");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:session-41@ipfactory.co");
    const email = seriesEmail({ name: "Ada Okafor", forClient: true, businessName: "Ada Foods", title: "Weekly Check-in", sessions: events.map(event => ({ title: event.title, start: event.start })), meetingLink: "https://zoom.example.test/j/1", origin: "https://ipfactory.example.test" });
    expect(email.subject).toBe("Booked: Weekly Check-in, 2 dates from Tue, 17 Nov 2026, 10:00 am");
    expect(email.body).toContain("• Weekly Check-in: Tue, 24 Nov 2026, 10:00 am");
    expect(email.body).toContain("Join: https://zoom.example.test/j/1");
  });
});
