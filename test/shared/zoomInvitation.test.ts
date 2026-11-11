import { describe, expect, it } from "vitest";
import { parseZoomInvitation, zoomMeetingIdOf } from "@shared/zoomInvitation";

/** Book a meeting from Zoom (R81): what the platform reads from a pasted Zoom invitation. Fictional people. */
const single = `Ada Example is inviting you to a scheduled Zoom meeting.

Topic: Kick-off: Ada Foods
Time: Nov 18, 2026 10:00 AM West Central Africa

Join Zoom Meeting
https://us06web.zoom.us/j/81234567890?pwd=AbCdEf123.1

Meeting ID: 812 3456 7890
Passcode: 482913
`;

const recurring = `Ada Example is inviting you to a scheduled Zoom meeting.

Topic: Weekly Check-in: Ada Foods
Time: Nov 24, 2026 04:30 PM Lagos
        Every week on Tue, until Dec 15, 2026, 4 occurrence(s)
        Nov 24, 2026 04:30 PM
        Dec 1, 2026 04:30 PM
        Dec 8, 2026 04:30 PM
        Dec 15, 2026 04:30 PM
Please download and import the following iCalendar (.ics) files to your calendar system.
Weekly: https://us06web.zoom.us/meeting/tZAbc/ics?icsToken=xyz

Join Zoom Meeting
https://us06web.zoom.us/j/89998887776?pwd=Zz9

Meeting ID: 899 9888 7776
Passcode: 111222
`;

describe("reading a Zoom invitation", () => {
  it("reads the topic, the time in Lagos, the Join link, the meeting ID and the passcode", () => {
    expect(parseZoomInvitation(single)).toEqual({
      topic: "Kick-off: Ada Foods", starts: [new Date("2026-11-18T09:00:00Z")], zone: "West Central Africa", zoneKnown: true, recurring: false,
      joinUrl: "https://us06web.zoom.us/j/81234567890?pwd=AbCdEf123.1", meetingId: "81234567890", passcode: "482913",
    });
  });

  it("reads every occurrence of a recurring meeting, and not the calendar file's link", () => {
    const invitation = parseZoomInvitation(recurring);
    expect(invitation.recurring).toBe(true);
    expect(invitation.starts.map(start => start.toISOString())).toEqual(["2026-11-24T15:30:00.000Z", "2026-12-01T15:30:00.000Z", "2026-12-08T15:30:00.000Z", "2026-12-15T15:30:00.000Z"]);
    expect(invitation.joinUrl).toBe("https://us06web.zoom.us/j/89998887776?pwd=Zz9");
    expect(invitation.meetingId).toBe("89998887776");
  });

  it("places other ways Zoom writes the time, and refuses a zone with summer time rather than guess", () => {
    expect(parseZoomInvitation("Topic: Debrief\nTime: 18 Nov 2026 16:00 (GMT+1:00) Africa/Lagos\nhttps://zoom.us/j/12345678901").starts).toEqual([new Date("2026-11-18T15:00:00Z")]);
    expect(parseZoomInvitation("Time: Wednesday, Nov 18, 2026 12:00 PM UTC\nhttps://zoom.us/j/12345678901").starts).toEqual([new Date("2026-11-18T12:00:00Z")]);
    const london = parseZoomInvitation("Time: Nov 18, 2026 10:00 AM London\nhttps://zoom.us/j/12345678901");
    expect(london).toMatchObject({ starts: [], zone: "London", zoneKnown: false });
    expect(parseZoomInvitation("just some text")).toMatchObject({ topic: null, starts: [], joinUrl: null, meetingId: null });
  });

  it("knows a meeting again by the ID in its Join link", () => {
    expect(zoomMeetingIdOf("https://us06web.zoom.us/j/81234567890?pwd=x")).toBe("81234567890");
    expect(zoomMeetingIdOf("https://meet.google.com/abc")).toBeNull();
  });
});
