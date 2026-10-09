/** A date and time as owners and the team read it: Lagos time, for example "Wed, 14 Oct 2026, 3:05 pm". */
export const lagosTime = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
