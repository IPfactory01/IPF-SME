import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { MEETING_TYPES, meetingType, parseZoomInvitation, ZOOM_SCHEDULE_URL, type MeetingTypeId } from "@shared/zoomInvitation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const FIELD = "w-full border border-line bg-white px-2 py-1.5 text-sm text-ink";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SMALL_BUTTON = "rounded-none text-xs";
const lagos = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(date);

/**
 * Book a meeting from Zoom (R81): pick the kind of meeting, book it in Zoom, press Copy invitation there and paste it
 * here. What was read is shown to check before anything is sent; then everyone on the engagement is emailed the time,
 * the Join link and a calendar invitation. Pasting the same Zoom meeting again moves it.
 */
export default function BookMeeting({ engagementId, businessName }: { engagementId: number; businessName: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MeetingTypeId>("kickoff");
  const [title, setTitle] = useState("");
  const [pasted, setPasted] = useState("");
  const [minutes, setMinutes] = useState(String(meetingType("kickoff").minutes));
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const read = useMemo(() => parseZoomInvitation(pasted), [pasted]);
  const name = title.trim() || meetingType(type).label;
  // When Zoom's time zone could not be placed, the person gives the time in Lagos.
  const manual = date && time ? new Date(`${date}T${time}:00+01:00`) : null;
  const starts = read.starts.length ? read.starts : manual && !Number.isNaN(manual.getTime()) ? [manual] : [];
  const book = trpc.engagement.staff.bookMeeting.useMutation({
    onSuccess: result => {
      void utils.engagement.staff.detail.invalidate({ engagementId });
      toast.success(result.booked === 1 ? "Booked. Everyone on the engagement is emailed the time and the Join link." : `${result.booked} dates booked. Everyone is emailed them all in one calendar file.`);
      setOpen(false); setPasted(""); setTitle(""); setDate(""); setTime("");
    },
    onError: error => toast.error(error.message),
  });
  if (!open) return <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} onClick={() => setOpen(true)}>Book a meeting</Button>;
  return (
    <div className="space-y-3 border border-brand-line bg-paper-raised p-3" role="group" aria-label="Book a meeting">
      <p className="text-sm font-semibold text-ink">Book a meeting</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="meeting-type">Kind of meeting</label>
          <select id="meeting-type" className={FIELD} value={type} onChange={event => { const next = event.target.value as MeetingTypeId; setType(next); setMinutes(String(meetingType(next).minutes)); }}>
            {MEETING_TYPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="meeting-title">Name {type === "other" ? "" : "(optional)"}</label>
          <input id="meeting-title" className={FIELD} maxLength={160} placeholder={meetingType(type).label} value={title} onChange={event => setTitle(event.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="meeting-minutes">Minutes</label>
          <input id="meeting-minutes" type="number" min={5} max={480} className={FIELD} value={minutes} onChange={event => setMinutes(event.target.value)} />
        </div>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-600">
        <li>
          <a href={ZOOM_SCHEDULE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand underline underline-offset-2">Open Zoom to schedule it <ExternalLink className="h-3 w-3" aria-hidden /></a>
          {" "}with the Topic <span className="font-medium text-ink">{name}: {businessName}</span>. For a series, tick Recurring meeting in Zoom.
        </li>
        <li>In Zoom, press <span className="font-medium text-ink">Copy invitation</span>, then paste it below.</li>
      </ol>
      <div>
        <label className={LABEL} htmlFor="meeting-invitation">The Zoom invitation</label>
        <textarea id="meeting-invitation" className={FIELD} rows={5} placeholder={"Topic: …\nTime: …\nJoin Zoom Meeting\nhttps://…zoom.us/j/…"} value={pasted} onChange={event => setPasted(event.target.value)} />
      </div>
      {pasted.trim() && (
        <div className="space-y-1 border-l-2 border-brand pl-3 text-sm" aria-label="What the invitation says">
          {read.starts.length > 0 && (
            <ul className="space-y-0.5">{read.starts.map(start => <li key={start.getTime()}>{lagos(start)} (Lagos)</li>)}</ul>
          )}
          {!read.starts.length && read.zone && !read.zoneKnown && <p className="text-xs text-danger">Zoom wrote the time in "{read.zone}", which this cannot place. Set your Zoom profile's time zone to Lagos, or give the time below.</p>}
          {!read.starts.length && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div><label className={LABEL} htmlFor="meeting-date">Date</label><input id="meeting-date" type="date" className={FIELD} value={date} onChange={event => setDate(event.target.value)} /></div>
              <div><label className={LABEL} htmlFor="meeting-time">Time (Lagos)</label><input id="meeting-time" type="time" className={FIELD} value={time} onChange={event => setTime(event.target.value)} /></div>
            </div>
          )}
          <p className={`text-xs ${read.joinUrl ? "text-ink-muted" : "text-danger"}`}>{read.joinUrl ? `Join link: ${read.joinUrl}` : "No Zoom Join link in what was pasted."}</p>
          {read.recurring && <p className="text-xs text-ink-muted">A recurring meeting: each date becomes a Session.</p>}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={book.isPending || !read.joinUrl || !starts.length || (type === "other" && !title.trim())}
          onClick={() => book.mutate({ engagementId, type, title: name, starts, durationMinutes: Number(minutes) || meetingType(type).minutes, meetingLink: read.joinUrl!, agenda: null })}>
          {book.isPending ? "Booking…" : starts.length > 1 ? `Book ${starts.length} dates and send` : "Book and send to everyone"}
        </Button>
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
