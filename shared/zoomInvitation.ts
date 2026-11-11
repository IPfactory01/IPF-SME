/**
 * Book a meeting from Zoom (R81, ET 11 November 2026): the team books in Zoom, presses Copy invitation, and pastes it
 * here. This reads what the platform needs from that text: the topic, each date and time (one, or every occurrence of
 * a recurring meeting), the Join link and the meeting ID. A time is placed only when its time zone is known; anything
 * it cannot read is left for the person to fill in, never guessed.
 */

/** The kinds of meeting the team books, each with its usual length and the plan's Session it fills. */
export const MEETING_TYPES = [
  { id: "kickoff", label: "Kick-off", kind: "other", minutes: 45, fills: "Kick-off" },
  { id: "weekly_checkin", label: "Weekly Check-in", kind: "check_in", minutes: 30, fills: "Weekly Check-in" },
  { id: "checkin", label: "Check-in", kind: "check_in", minutes: 30, fills: "Check-in" },
  { id: "review", label: "Monthly review", kind: "review", minutes: 45, fills: "review" },
  { id: "session", label: "Session", kind: "assessment_call", minutes: 90, fills: "Session" },
  { id: "debrief", label: "Debrief", kind: "other", minutes: 30, fills: null },
  { id: "catch_up", label: "Catch-up", kind: "other", minutes: 30, fills: null },
  { id: "stand_up", label: "Stand-up", kind: "other", minutes: 15, fills: null },
  { id: "working_session", label: "Working session", kind: "other", minutes: 60, fills: null },
  { id: "other", label: "Other", kind: "other", minutes: 30, fills: null },
] as const;
export type MeetingTypeId = (typeof MEETING_TYPES)[number]["id"];
export const MEETING_TYPE_IDS = MEETING_TYPES.map(type => type.id) as unknown as readonly [MeetingTypeId, ...MeetingTypeId[]];
export const meetingType = (id: MeetingTypeId) => MEETING_TYPES.find(type => type.id === id)!;

/** Where Zoom's scheduler is: the team books there, then pastes the invitation back. */
export const ZOOM_SCHEDULE_URL = "https://zoom.us/meeting/schedule";
/** At most this many dates from one recurring invitation. */
export const MAX_OCCURRENCES = 26;

/**
 * Zoom's time zone names and their offset from UTC in minutes, for the zones a Lagos team and its clients use. A zone
 * with summer time is not listed: its offset depends on the date, so the person enters the time instead.
 */
const ZONES: [RegExp, number][] = [
  [/west central africa|lagos|\bwat\b|africa\/lagos|gmt\s*\+\s*0?1(:00)?\b|utc\s*\+\s*0?1(:00)?\b/i, 60],
  [/\b(gmt|utc)\b(?!\s*[+-])|accra|monrovia|reykjavik|africa\/accra/i, 0],
  [/nairobi|\beat\b|africa\/nairobi|gmt\s*\+\s*0?3(:00)?\b/i, 180],
  [/johannesburg|harare|pretoria|cairo|\bcat\b|\bsast\b|gmt\s*\+\s*0?2(:00)?\b/i, 120],
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE_TIME = /\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4}))\s+(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i;

function toInstant(match: RegExpExecArray, offsetMinutes: number) {
  const monthName = (match[1] ?? match[5] ?? "").slice(0, 3).toLowerCase();
  const month = MONTHS.indexOf(monthName);
  const day = Number(match[2] ?? match[4]);
  const year = Number(match[3] ?? match[6]);
  let hour = Number(match[7]);
  const minute = Number(match[8]);
  const meridiem = match[9]?.replace(/\./g, "").toLowerCase();
  if (month < 0 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  const utc = Date.UTC(year, month, day, hour, minute) - offsetMinutes * 60_000;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ZoomInvitation = {
  topic: string | null;
  /** Every date and time, earliest first; empty when none could be placed. */
  starts: Date[];
  /** The time zone as Zoom wrote it, and whether it could be placed. */
  zone: string | null;
  zoneKnown: boolean;
  recurring: boolean;
  joinUrl: string | null;
  meetingId: string | null;
  passcode: string | null;
};

/** Reads a pasted Zoom invitation. Pure: nothing is sent or stored. */
export function parseZoomInvitation(text: string): ZoomInvitation {
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.trim());
  const topic = lines.find(line => /^topic\s*:/i.test(line))?.replace(/^topic\s*:\s*/i, "").trim() || null;
  const joinUrl = text.match(/https:\/\/[a-z0-9.-]*zoom\.us\/(?:j|w|my)\/[^\s<>"')]+/i)?.[0] ?? null;
  const meetingId = (text.match(/meeting\s*id\s*:\s*([\d ]{9,14})/i)?.[1] ?? joinUrl?.match(/\/j\/(\d{9,12})/)?.[1] ?? "").replace(/\s/g, "") || null;
  const passcode = text.match(/pass(?:code|word)\s*:\s*(\S+)/i)?.[1] ?? null;
  // The time block: the "Time:" line and the dates listed under it, up to the next part of the invitation.
  const timeAt = lines.findIndex(line => /^time\s*:/i.test(line));
  const block = timeAt < 0 ? [] : [lines[timeAt]!.replace(/^time\s*:\s*/i, ""), ...lines.slice(timeAt + 1).filter((_, index, rest) => !rest.slice(0, index + 1).some(line => /^(join|please download|meeting id|https?:)/i.test(line) || line === ""))];
  const first = block[0] ?? "";
  const firstMatch = DATE_TIME.exec(first);
  const zone = firstMatch ? first.slice(firstMatch.index + firstMatch[0].length).replace(/^[\s,]+/, "").trim() || null : null;
  const offset = zone ? ZONES.find(([pattern]) => pattern.test(zone))?.[1] ?? null : null;
  const recurring = block.some(line => /^every\s/i.test(line) || /occurrence/i.test(line));
  const starts: Date[] = [];
  if (offset !== null) {
    // A recurring meeting lists each occurrence under the first line; a single one has only the first.
    const listed = block.slice(1).filter(line => !/^every\s/i.test(line)).map(line => DATE_TIME.exec(line)).filter((match): match is RegExpExecArray => match !== null);
    for (const match of (listed.length ? listed : firstMatch ? [firstMatch] : []).slice(0, MAX_OCCURRENCES)) {
      const start = toInstant(match, offset);
      if (start && !starts.some(item => item.getTime() === start.getTime())) starts.push(start);
    }
    starts.sort((a, b) => a.getTime() - b.getTime());
  }
  return { topic, starts, zone, zoneKnown: offset !== null, recurring, joinUrl, meetingId, passcode };
}

/** The Zoom meeting a Join link belongs to, to find a meeting booked before. */
export const zoomMeetingIdOf = (link: string | null) => link?.match(/zoom\.us\/(?:j|w)\/(\d{9,12})/i)?.[1] ?? null;
