import { firstNameOf } from "@shared/whatsapp";
import WhatsAppShare from "./WhatsAppShare";
import { Failed, Loading } from "@/components/states";
import { isRefusal } from "@/lib/readPolicy";
import { DATED_TYPES, STAGED_TYPES } from "@shared/engagementTypes";
import { lagosDay } from "@shared/agreement";
import { dayInWords } from "@shared/requests";
import { DATA_REQUEST_TEMPLATES, parsePastedDataRequest, templateById } from "@shared/dataRequestTemplates";
import { feeTotal, type FeeLineDraft } from "@shared/agreement";
import { formatNaira } from "@shared/businessSupport";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import PreviewAsClient from "./PreviewAsClient";
import { PROBLEM_AREAS } from "@shared/businessSupport";
import {
  OPEN_TASK_STATUSES,
  ENGAGEMENT_TASK_FACTORS,
  ENGAGEMENT_TASK_FACTOR_LABELS,
  type EngagementTaskFactor,
  DELIVERABLES_NEEDING_APPROVAL,
  ENGAGEMENT_AUDIENCE_LABELS,
  ENGAGEMENT_DELIVERABLE_KIND_LABELS,
  ENGAGEMENT_DELIVERABLE_KINDS,
  ENGAGEMENT_SESSION_KIND_LABELS,
  ENGAGEMENT_SESSION_KINDS,
  ENGAGEMENT_SESSION_STATUSES,
  ENGAGEMENT_STAGE_LABELS,
  ENGAGEMENT_STAGES,
  ENGAGEMENT_TASK_STATUS_LABELS,
  ENGAGEMENT_TASK_STATUSES,
  ENGAGEMENT_TASK_PRIORITIES,
  ENGAGEMENT_TASK_PRIORITY_LABELS,
  type EngagementTaskPriority,
  ENGAGEMENT_TEAM_ROLE_LABELS,
  teamRolesFor,
  CHECKIN_QUESTIONS,
  FINDINGS_OUTLINE,
  FIX_WEEKS,
  formatFileSize,
  formatMeasure,
  MAX_CHECKIN_WEEKS,
  UPLOAD_ACCEPT,
  type EngagementAudience,
  type EngagementDeliverableKind,
  type EngagementSessionKind,
  type EngagementSessionStatus,
  type EngagementStage,
  type EngagementTaskKind,
  type EngagementTaskSide,
  type EngagementTaskStatus,
  type EngagementTeamRole,
} from "@shared/engagement";
import type { inferRouterOutputs } from "@trpc/server";
import { CONTENT_KIND_LABELS, CONTENT_KINDS, CONTENT_STATUS_LABELS, CONTENT_STATUSES, type ContentKind, type ContentStatus } from "@shared/engagementTypes";
import React, { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { DetailField, DetailSection } from "./AdminPrimitives";
import DeliveryShareNote from "./DeliveryShareNote";
import { combineDateAndTime, formatDate, formatDateTime, toDateInput, toTimeInput, whatsappLink } from "./format";
import { FeeHoldNote } from "./FeeHoldBadge";
import { ArrowLeft, Check, Flag } from "lucide-react";
import RoomTabs, { type RoomTab } from "@/components/room/RoomTabs";
import { avatarColour, dueFlag, FLAG_TONE, initials } from "@/components/EngagementRoom";
import { METHOD } from "@shared/method";
import { TodayCard } from "./Today";
import WeekCards from "@/components/room/WeekCards";
import { StaffFileStrip } from "@/components/room/FileStrip";
import { FeePaymentList, RecordPaymentForm, WriteOffControls } from "./FeePayments";
import { AskClient, ItemConversation } from "./AskClient";
import BookMeeting from "./BookMeeting";

type Detail = inferRouterOutputs<AppRouter>["engagement"]["staff"]["detail"];
type Session = Detail["sessions"][number];
type Task = Detail["tasks"][number];
type Deliverable = Detail["deliverables"][number];
type StaffFile = Task["files"][number];
type Checkin = Detail["checkins"][number];
type UploadTarget = { kind: "task" | "deliverable"; id: number };

const FIELD = "w-full border border-line bg-white px-2 py-1.5 text-sm text-ink";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SMALL_BUTTON = "rounded-none text-xs";

const SESSION_STATUS_LABELS: Record<EngagementSessionStatus, string> = { planned: "Planned", held: "Held", cancelled: "Cancelled" };
const SIDE_LABELS: Record<EngagementTaskSide, string> = { client: "The client", ipf: "IP Factory" };
const KIND_LABELS: Record<EngagementTaskKind, string> = { data_request: "Data request", action: "Action" };

/** Refreshes the record and the list after any change, and reports the server's message on failure. */
function useRefresh(engagementId: number) {
  const utils = trpc.useUtils();
  return {
    onSuccess: () => {
      void utils.engagement.staff.detail.invalidate({ engagementId });
      void utils.engagement.staff.list.invalidate();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  };
}

/** One engagement, for the team. The server checks every change: these controls only hide what the role cannot do. */
export default function EngagementDetail({ engagementId }: { engagementId: number }) {
  const detail = trpc.engagement.staff.detail.useQuery({ engagementId });
  if (detail.error && detail.data === undefined) return <Failed error={detail.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />;
  if (!detail.data) return <Loading label="Loading the engagement" rows={4} />;
  const data = detail.data;
  return (
    <>
      <FeeHoldNote hold={data.hold} />
      <TheClient data={data} engagementId={engagementId} />
      <StageAndTeam data={data} engagementId={engagementId} />
      {data.can.seeFees && <FeesAdmin engagementId={engagementId} owner={data.owner} />}
      <Problem data={data} engagementId={engagementId} />
      <Sessions data={data} engagementId={engagementId} />
      {data.engagement.type === "digital_marketing" && <ContentAdmin data={data} engagementId={engagementId} />}
      <FileInbox data={data} engagementId={engagementId} />
      <Tasks data={data} engagementId={engagementId} />
      <Deliverables data={data} engagementId={engagementId} />
      <TheFix data={data} engagementId={engagementId} />
    </>
  );
}

function TheClient({ data, engagementId }: { data: Detail; engagementId: number }) {
  return (
    <DetailSection title="The client">
      <DetailField label="Owner">{data.owner?.name ?? "-"}</DetailField>
      <DetailField label="Email">{data.owner?.email ?? "-"}</DetailField>
      <DetailField label="WhatsApp">{data.owner?.whatsapp ? <a className="text-brand underline" href={whatsappLink(data.owner.whatsapp) ?? undefined} target="_blank" rel="noreferrer">{data.owner.whatsapp}</a> : "-"}</DetailField>
      <DetailField label="Client account">{data.hasAccount ? `Yes${data.clientPeople.length > 1 ? `, ${data.clientPeople.length} people` : ""}` : "Not yet: the invitation is out"}</DetailField>
      {data.can.sendSignIn && data.engagement.businessCheckId !== null && <SendSignInLink businessCheckId={data.engagement.businessCheckId} hasAccount={data.hasAccount} owner={data.owner} />}
      {data.can.previewAsClient && <div className="border-t border-line-soft pt-2"><PreviewAsClient engagementId={engagementId} /></div>}
    </DetailSection>
  );
}

/** In the workspace each item is a short row that opens into its form; in the drawer the forms show as before (R82). */
const Compact = React.createContext(false);
/** The item a link from an email opens (R89): the workspace starts on the Work Plan with its panel open. */
const FocusTask = React.createContext<number | null>(null);
const ROW = "flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line-soft bg-white px-3 py-2.5 text-left";
const PILL = "rounded-full bg-paper-sunken px-2 py-0.5 text-xs text-ink-600";
const DELIVERABLE_STATUS_WORDS: Record<Deliverable["status"], string> = { draft: "Draft", awaiting_approval: "Waiting for approval", approved: "Approved", shared: "Shared" };

/** One Work Plan item: in the workspace, its title, status, due day and conversation, opening into its form. */
function TaskRow({ task, data, engagementId }: { task: Task; data: Detail; engagementId: number }) {
  const compact = React.useContext(Compact);
  const [open, setOpen] = useState(false);
  if (!compact) return <TaskCard task={task} data={data} engagementId={engagementId} />;
  if (open) return <div className="space-y-2"><button type="button" className="text-sm font-medium text-brand" onClick={() => setOpen(false)}>Close {task.title}</button><TaskCard task={task} data={data} engagementId={engagementId} onDone={() => setOpen(false)} /></div>;
  const late = OPEN_TASK_STATUSES.includes(task.status) && task.dueOn !== null && task.dueOn < new Date().toISOString().slice(0, 10);
  return (
    <button type="button" className={`${ROW} hover:border-brand`} onClick={() => setOpen(true)} aria-label={`Open ${task.title}`}>
      <span className="min-w-0">
        <span className="block font-medium text-ink">{task.title}</span>
        <span className="block text-xs text-ink-muted">{SIDE_LABELS[task.side]}{task.dueOn ? ` · due ${formatDate(task.dueOn)}` : ""}{task.comments.length ? ` · ${task.comments.length} ${task.comments.length === 1 ? "message" : "messages"}` : ""}{task.files.length ? ` · ${task.files.length} ${task.files.length === 1 ? "file" : "files"}` : ""}</span>
      </span>
      <span className={late ? "rounded-full bg-danger-tint px-2 py-0.5 text-xs text-danger" : PILL}>{late ? "Late" : task.statusLabel}</span>
    </button>
  );
}

/** One Deliverable: in the workspace, its title, kind and status, opening into its form. */
function DeliverableRow({ item, data, engagementId }: { item: Deliverable; data: Detail; engagementId: number }) {
  const compact = React.useContext(Compact);
  const [open, setOpen] = useState(false);
  if (!compact) return <DeliverableCard item={item} data={data} engagementId={engagementId} />;
  if (open) return <div className="space-y-2"><button type="button" className="text-sm font-medium text-brand" onClick={() => setOpen(false)}>Close {item.title}</button><DeliverableCard item={item} data={data} engagementId={engagementId} /></div>;
  return (
    <button type="button" className={`${ROW} hover:border-brand`} onClick={() => setOpen(true)} aria-label={`Open ${item.title}`}>
      <span className="min-w-0"><span className="block font-medium text-ink">{item.title}</span><span className="block text-xs text-ink-muted">{item.kindLabel}{item.comments.length ? ` · ${item.comments.length} ${item.comments.length === 1 ? "comment" : "comments"}` : ""}</span></span>
      <span className={item.status === "awaiting_approval" ? "rounded-full bg-brand px-2 py-0.5 text-xs text-white" : PILL}>{DELIVERABLE_STATUS_WORDS[item.status]}</span>
    </button>
  );
}

/** The lead's prompt (R88): team items with no one named go to the person in their plan role, in one step. */
function AssignByRole({ engagementId, count }: { engagementId: number; count: number }) {
  const refresh = useRefresh(engagementId);
  const assign = trpc.engagement.staff.assignByRole.useMutation({ ...refresh, onSuccess: result => { refresh.onSuccess(); toast.success(`${result.assigned} ${result.assigned === 1 ? "item" : "items"} assigned. Each person sees them, with their reminders.`); } });
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-health-watch bg-health-watch-tint p-3 text-sm">
      <span>{count} team {count === 1 ? "item has" : "items have"} no one named, so no one is reminded.</span>
      <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={assign.isPending} onClick={() => assign.mutate({ engagementId })}>Assign by role</Button>
    </div>
  );
}

/** The Work Plan's groups in the workspace, as the client's room groups its tasks: by where each item stands. */
const TEAM_PLAN_GROUPS: { id: string; name: string; dot: string; pill: string; test: (task: Task) => boolean }[] = [
  { id: "client", name: "With the client", dot: "border-brand-plum bg-white", pill: "bg-brand-plum text-white", test: task => task.side === "client" && OPEN_TASK_STATUSES.includes(task.status) },
  { id: "us", name: "With IP Factory", dot: "border-brand bg-white", pill: "bg-brand text-white", test: task => task.side !== "client" && OPEN_TASK_STATUSES.includes(task.status) },
  { id: "checking", name: "Sent, to check", dot: "border-highlight bg-white", pill: "bg-brand-tint text-brand-deep", test: task => task.status === "received" },
  { id: "done", name: "Done", dot: "border-health-clear bg-health-clear", pill: "bg-health-clear-tint text-health-clear-strong", test: task => !OPEN_TASK_STATUSES.includes(task.status) && task.status !== "received" },
];
const PRIORITY_WORDS = { high: "High", medium: "Medium", low: "Low" } as const;

/**
 * The Work Plan in the workspace (R82), in the client's room's shape: grouped by where each item stands, with who, when,
 * priority and type; selecting a row opens it beside the table with its form and its conversation.
 */
function PlanTable({ data, engagementId, now = Date.now() }: { data: Detail; engagementId: number; now?: number }) {
  const focus = React.useContext(FocusTask);
  const [selected, setSelected] = useState<number | null>(() => (focus !== null && data.tasks.some(item => item.id === focus) ? focus : null));
  const task = data.tasks.find(item => item.id === selected) ?? null;
  const nameOf = (item: Task) => (item.assigneeUserId !== null ? [...data.clientPeople.map(person => ({ id: person.userId, name: person.name })), ...data.team.map(member => ({ id: member.userId, name: member.name ?? "" }))].find(person => person.id === item.assigneeUserId)?.name : undefined)
    || (item.side === "client" ? data.businessName || "The client" : item.ownerName || "No one yet");
  const groupOf = (item: Task) => TEAM_PLAN_GROUPS.find(group => group.test(item)) ?? TEAM_PLAN_GROUPS[1]!;
  const refresh = useRefresh(engagementId);
  const markHeld = trpc.engagement.staff.markHeld.useMutation({ ...refresh, onSuccess: (result) => { refresh.onSuccess(); toast.success(result.status === "held" ? "Marked held. Write the notes in Sessions." : "Taken off the plan. Book it again when you have a date."); } });
  if (!data.tasks.length) return <p className="text-sm text-ink-muted">Nothing on the {METHOD.workPlan} yet.</p>;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      <div className={`min-w-0 ${task ? "" : "xl:col-span-2"}`}>
        {/* Weekly cards (R85), as the client sees them, with each week's Sessions. */}
        <WeekCards startedOn={data.engagement.startedOn ?? null} items={data.tasks} sessions={data.sessions} now={now}
          onMarkHeld={data.can.markHeld ? (sessionId, held) => { if (!markHeld.isPending) markHeld.mutate({ sessionId, held }); } : undefined}
          // Handed in or sent is done from the sender's side (R87); for the lead it waits on their review.
          isDone={item => groupOf(item).id === "done" || (!data.can.seeAllTasks && groupOf(item).id === "checking")}
          isWaiting={item => groupOf(item).id === "us" || (data.can.seeAllTasks && groupOf(item).id === "checking")} waitingLabel={data.can.seeAllTasks ? "Waiting on IP Factory" : "Waiting on you"}
          renderItem={item => {
            const group = groupOf(item);
            // Something the client has sent is not late: it waits on us to check it.
            const flag = group.id === "checking" ? { text: "Sent", tone: "calm" as const } : dueFlag(item.dueOn, group.id === "done", now);
            const who = nameOf(item);
            return (
              <>
              <button type="button" onClick={() => setSelected(selected === item.id ? null : item.id)} aria-expanded={selected === item.id} aria-label={`Open ${item.title}`}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${selected === item.id ? "bg-brand-tint" : "hover:bg-paper-sunken"}`}>
                {/* Sent or handed in is ticked, pending review; completed once the lead has reviewed it (R87). */}
                {group.id === "checking" || group.id === "done"
                  ? <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${group.id === "done" ? "bg-health-clear" : "bg-brand"} text-white`}><Check className="h-3 w-3" /></span>
                  : <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full border-2 ${group.dot}`} />}
                <span className="min-w-0 flex-1">
                  <span className={`block ${group.id === "done" ? "text-ink-muted line-through decoration-line-strong" : "text-ink"}`}>{item.title}</span>
                  <span className="block text-xs text-ink-muted">{[group.id === "checking" ? (item.side === "ipf" ? (data.can.seeAllTasks ? "Handed in: review it" : "Handed in, pending review") : (data.can.seeAllTasks ? "Sent by the client: review it" : "Sent, pending review")) : group.id === "done" ? "Completed" : group.name, item.kind === "data_request" ? METHOD.dataRequest : "Action", item.comments.length ? `${item.comments.length} ${item.comments.length === 1 ? "message" : "messages"}` : "", item.files.length ? `${item.files.length} ${item.files.length === 1 ? "file" : "files"}` : ""].filter(Boolean).join(" · ")}</span>
                </span>
                {item.owners.length > 0
                  ? <span className="hidden shrink-0 sm:flex">{item.owners.slice(0, 3).map(owner => <span key={owner.userId} title={owner.name} className={`-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-medium text-white first:ml-0 ${avatarColour(owner.name)}`}><span aria-hidden>{initials(owner.name)}</span><span className="sr-only">{owner.name}</span></span>)}</span>
                  : <span title={who} className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white sm:inline-flex ${avatarColour(who)}`}><span aria-hidden>{initials(who)}</span><span className="sr-only">{who}</span></span>}
                <span className={`hidden w-32 shrink-0 whitespace-nowrap text-right sm:block ${flag ? FLAG_TONE[flag.tone] : "text-ink-muted"}`}>{flag?.text ?? ""}</span>
                <span className="hidden w-20 shrink-0 whitespace-nowrap md:block">{item.priority ? <span className={`inline-flex items-center gap-1.5 ${item.priority === "high" ? "font-medium text-health-stuck" : "text-ink-muted"}`}><Flag className={`h-3.5 w-3.5 ${item.priority === "high" ? "fill-current" : ""}`} aria-hidden />{PRIORITY_WORDS[item.priority]}</span> : null}</span>
              </button>
              {(item.files.length > 0 || item.responseLink) && <div className="pb-2.5 pl-11 pr-4"><StaffFileStrip files={item.files} link={item.responseLink ?? null} /></div>}
              </>
            );
          }} />
      </div>
      {task && (
        <aside aria-label="Task details" className="space-y-3 rounded-xl border border-line-soft bg-white p-4 xl:sticky xl:top-16">
          <div className="flex justify-end">
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-brand underline underline-offset-2">Close</button>
          </div>
          {/* The lead changes an item; below the lead, a person reads it and works on it: files, messages, Ready for review (R86). */}
          {data.can.manage && data.can.seeAllTasks ? <ReviewItem key={task.id} task={task} data={data} engagementId={engagementId} now={now} /> : <OwnItem key={task.id} task={task} data={data} engagementId={engagementId} now={now} />}
        </aside>
      )}
    </div>
  );
}

/**
 * Every file on the engagement, sorted (R85): the drop box's unmatched files first (To match), then one card per item or
 * Deliverable that has files, with its reference, title and status, and each file with who sent it and when.
 */
function FilesByItem({ data, engagementId }: { data: Detail; engagementId: number }) {
  const withFiles = data.tasks.filter(task => task.files.length).sort((a, b) => (a.ref ?? "").localeCompare(b.ref ?? "", undefined, { numeric: true }) || a.id - b.id);
  const outputs = data.deliverables.filter(item => item.files.length);
  const unsorted = data.inbox.filter(file => !file.taskIds.length).length;
  return (
    <div className="space-y-4">
      {unsorted > 0 && <section aria-label="To match" className="rounded-xl border border-brand bg-white p-4"><FileInbox data={data} engagementId={engagementId} /></section>}
      {!withFiles.length && !outputs.length && !unsorted && <p className="rounded-xl border border-line-soft bg-white p-4 text-sm text-ink-muted">No files yet. What the client sends against an item appears here, under that item.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {withFiles.map(task => (
          <section key={task.id} aria-label={task.title} className="space-y-2 rounded-xl border border-line-soft bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-xs text-ink-muted">{[task.ref, task.kind === "data_request" ? METHOD.dataRequest : "Action"].filter(Boolean).join(" · ")}</p><h4 className="font-medium text-ink">{task.title}</h4></div>
              <span className="shrink-0 rounded-full bg-paper-sunken px-2 py-0.5 text-xs text-ink-600">{task.statusLabel}</span>
            </div>
            <StaffFiles files={task.files} engagementId={engagementId} target={{ kind: "task", id: task.id }} canUpload={false} canManage={data.can.manage} />
          </section>
        ))}
        {outputs.map(item => (
          <section key={`d-${item.id}`} aria-label={item.title} className="space-y-2 rounded-xl border border-line-soft bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-xs text-ink-muted">{item.kindLabel}</p><h4 className="font-medium text-ink">{item.title}</h4></div>
              <span className="shrink-0 rounded-full bg-paper-sunken px-2 py-0.5 text-xs text-ink-600">{DELIVERABLE_STATUS_WORDS[item.status]}</span>
            </div>
            <StaffFiles files={item.files} engagementId={engagementId} target={{ kind: "deliverable", id: item.id }} canUpload={false} canManage={data.can.manage} />
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * An item as the lead reviews it (ET, 13 November 2026): what it is, then what was sent (files, link, note) first, the
 * two decisions (Mark received, Ask for more), its messages, and the full form only behind Edit the item.
 */
function ReviewItem({ task, data, engagementId, now }: { task: Task; data: Detail; engagementId: number; now: number }) {
  const refresh = useRefresh(engagementId);
  const [editing, setEditing] = useState(false);
  const sent = task.status === "received";
  const flag = dueFlag(task.dueOn, !OPEN_TASK_STATUSES.includes(task.status) && !sent, now);
  if (editing) return <div className="space-y-2"><button type="button" className="text-sm font-medium text-brand" onClick={() => setEditing(false)}>Back to the item</button><TaskCard task={task} data={data} engagementId={engagementId} onDone={() => setEditing(false)} /></div>;
  return (
    <div className="space-y-3">
      <h3 className="font-sans text-lg font-semibold tracking-tight text-ink">{task.title}</h3>
      <Owners task={task} data={data} engagementId={engagementId} />
      <Reviewer task={task} data={data} engagementId={engagementId} />
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-muted">With</dt><dd>{task.side === "client" ? data.businessName || "The client" : task.goesTo?.name || "IP Factory"}</dd>
        <dt className="text-ink-muted">Due</dt><dd className={flag && !sent ? FLAG_TONE[flag.tone] : ""}>{task.dueOn ? dayInWords(task.dueOn) : "No date"}{flag && !sent && flag.tone === "late" ? ` · ${flag.text}` : ""}</dd>
        {task.priority && <><dt className="text-ink-muted">Priority</dt><dd>{PRIORITY_WORDS[task.priority]}</dd></>}
        <dt className="text-ink-muted">Status</dt><dd>{sent ? (task.side === "client" ? "Sent by the client: review it" : "Handed in: review it") : task.status === "done" || task.status === "accepted" ? "Completed" : task.statusLabel}</dd>
      </dl>
      {/* What was sent, first. */}
      {(task.files.length > 0 || task.responseLink || (sent && task.statusNote)) && (
        <section aria-label="What was sent" className="space-y-2 rounded-lg border border-brand-line bg-brand-tint-soft p-3">
          <p className="text-xs font-semibold text-ink">What was sent</p>
          {task.responseLink && <p className="text-sm"><a href={task.responseLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">Open the link</a> <span className="text-xs text-ink-muted">({(() => { try { return new URL(task.responseLink).hostname.replace(/^www\./, ""); } catch { return "link"; } })()})</span></p>}
          {sent && task.statusNote && <p className="text-sm text-ink-600">Their note: {task.statusNote}</p>}
          <StaffFiles files={task.files} engagementId={engagementId} target={{ kind: "task", id: task.id }} canUpload={false} canManage={data.can.manage} />
        </section>
      )}
      {sent && task.canReview && <ReviewDecision task={task} engagementId={engagementId} />}
      {task.detail && <p className="whitespace-pre-line text-sm text-ink-600">{task.detail}</p>}
      <ItemConversation task={task} engagementId={engagementId} people={data.team.map(member => ({ name: member.name ?? "" }))} />
      <button type="button" className="text-xs font-medium text-ink-600 underline underline-offset-2" onClick={() => setEditing(true)}>Edit the item</button>
    </div>
  );
}

/** The reviewer's two decisions on what was sent or handed in (R89): Mark received, or Ask for more with a note. */
function ReviewDecision({ task, engagementId }: { task: Task; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const [asking, setAsking] = useState<string | null>(null);
  const review = trpc.engagement.staff.reviewTask.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); setAsking(null); toast.success("Saved. The owners see it."); } });
  return asking === null ? (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={review.isPending} onClick={() => review.mutate({ taskId: task.id, decision: "received", note: null })}>Mark received</Button>
      <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAsking("")}>Ask for more</Button>
    </div>
  ) : (
    <div className="space-y-1">
      <label className={LABEL} htmlFor={`more-${task.id}`}>What is still needed (they see this)</label>
      <input id={`more-${task.id}`} className={FIELD} value={asking} maxLength={500} onChange={event => setAsking(event.target.value)} />
      <div className="flex gap-2">
        <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={review.isPending || !asking.trim()} onClick={() => review.mutate({ taskId: task.id, decision: "more", note: asking.trim() })}>Send</Button>
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAsking(null)}>Cancel</Button>
      </div>
    </div>
  );
}

/** Who checks the item (R89): its reviewer by name; the lead can name someone else, or go back to the default. */
function Reviewer({ task, data, engagementId }: { task: Task; data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const save = trpc.engagement.staff.setReviewer.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Reviewer saved. They get the review emails."); } });
  if (!data.can.seeAllTasks) return <p className="text-xs text-ink-muted">Reviewer: <span className="text-ink">{task.reviewer?.name || "The lead"}</span></p>;
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">Reviewer
      <select aria-label="Reviewer" className="min-h-8 rounded-md border border-line-soft bg-white px-2 text-sm text-ink" disabled={save.isPending}
        value={task.reviewerUserId ? String(task.reviewerUserId) : ""}
        onChange={event => save.mutate({ taskId: task.id, userId: event.target.value ? Number(event.target.value) : null })}>
        <option value="">{`The default${!task.reviewerUserId && task.reviewer?.name ? ` (${task.reviewer.name})` : ""}`}</option>
        {data.team.filter(member => member.name).map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}
      </select>
    </label>
  );
}

/**
 * An item's owners (R89): their initials, the lead owner first and ringed, and + to change them for the lead or the
 * item's lead owner. Every owner gets its reminders, its Today and its emails; the lead owner hands it in.
 */
function Owners({ task, data, engagementId }: { task: Task; data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const canChange = data.can.seeAllTasks || task.owners[0]?.userId === data.viewerUserId;
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<number | null>(task.owners[0]?.userId ?? null);
  const [others, setOthers] = useState<number[]>(task.owners.slice(1).map(owner => owner.userId));
  const save = trpc.engagement.staff.setOwners.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); setOpen(false); toast.success("Owners saved. Each of them gets its reminders."); } });
  const people = data.team.filter(member => member.name);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-muted">Owners</span>
        <span className="flex">
          {task.owners.map(owner => <span key={owner.userId} title={`${owner.name}${owner.lead ? " (lead owner)" : ""}`} className={`-ml-1 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-medium text-white first:ml-0 ${owner.lead ? "border-brand" : "border-white"} ${avatarColour(owner.name)}`}><span aria-hidden>{initials(owner.name)}</span><span className="sr-only">{owner.name}{owner.lead ? ", lead owner" : ""}</span></span>)}
          {!task.owners.length && <span className="text-xs text-danger">No one yet</span>}
        </span>
        {canChange && <button type="button" aria-label="Change owners" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line text-sm text-ink-600 hover:border-brand">+</button>}
      </div>
      {open && (
        <fieldset className="space-y-1 rounded-lg border border-line-soft bg-white p-2 text-sm">
          <legend className="px-1 text-xs text-ink-muted">Who owns it; one leads and hands it in</legend>
          {people.map(member => {
            const chosen = member.userId === lead || others.includes(member.userId);
            return (
              <div key={member.userId} className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={chosen} onChange={() => {
                  if (chosen) { setOthers(list => list.filter(id => id !== member.userId)); if (lead === member.userId) setLead(others.find(id => id !== member.userId) ?? null); }
                  else if (lead === null) setLead(member.userId); else setOthers(list => [...list, member.userId]);
                }} />{member.name} <span className="text-xs text-ink-muted">{member.roleLabel}</span></label>
                {chosen && <label className="flex items-center gap-1 text-xs text-ink-600"><input type="radio" name={`lead-${task.id}`} checked={lead === member.userId} onChange={() => { if (lead !== null) setOthers(list => [...list.filter(id => id !== member.userId), lead]); setLead(member.userId); }} />Lead</label>}
              </div>
            );
          })}
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending || lead === null} onClick={() => save.mutate({ taskId: task.id, leadUserId: lead!, otherUserIds: others })}>Save owners</Button>
            <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** One of a person's own items, for someone below the lead (R86): what it is and when, its files, and its messages. */
function OwnItem({ task, data, engagementId, now }: { task: Task; data: Detail; engagementId: number; now: number }) {
  const flag = dueFlag(task.dueOn, !OPEN_TASK_STATUSES.includes(task.status) && task.status !== "received", now);
  return (
    <div className="space-y-3">
      <h3 className="font-sans text-lg font-semibold tracking-tight text-ink">{task.title}</h3>
      <Owners task={task} data={data} engagementId={engagementId} />
      <Reviewer task={task} data={data} engagementId={engagementId} />
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-muted">For</dt><dd>{task.side === "client" ? data.businessName || "The client" : "IP Factory"}</dd>
        <dt className="text-ink-muted">Due</dt><dd className={flag ? FLAG_TONE[flag.tone] : ""}>{flag?.text ?? "No date"}</dd>
        {task.priority && <><dt className="text-ink-muted">Priority</dt><dd>{PRIORITY_WORDS[task.priority]}</dd></>}
        <dt className="text-ink-muted">Status</dt><dd>{task.status === "received" ? "Ticked: sent, pending review" : task.status === "done" || task.status === "accepted" ? "Completed" : task.statusLabel}</dd>
      </dl>
      {task.status === "received" && task.canReview && <ReviewDecision task={task} engagementId={engagementId} />}
      {task.detail && <p className="whitespace-pre-line text-sm text-ink-600">{task.detail}</p>}
      <StaffFiles files={task.files} engagementId={engagementId} target={{ kind: "task", id: task.id }} canUpload={data.uploadsEnabled && (task.canHandIn || task.requestedByUserId === data.viewerUserId)} canManage={false} briefFor={task.requestedByUserId === data.viewerUserId} />
      <ItemConversation task={task} engagementId={engagementId} people={data.team.map(member => ({ name: member.name ?? "" }))} />
    </div>
  );
}

/** A section of the record as a card in the workspace (R82). */
const Card = ({ children }: { children: React.ReactNode }) => <div className="rounded-xl border border-line-soft bg-white p-4">{children}</div>;

/**
 * The team's workspace (R82): one engagement as a full page in the room's layout, for someone who does not see every
 * engagement. The tabs hold the record's own sections, so what each person may do is unchanged; the server checks
 * every action as before.
 */
export function EngagementWorkspace({ engagementId, myRole, onBack, openTaskId = null, now = Date.now() }: { engagementId: number; myRole: string | null; onBack: () => void; openTaskId?: number | null; now?: number }) {
  const detail = trpc.engagement.staff.detail.useQuery({ engagementId });
  const today = trpc.engagement.staff.today.useQuery(undefined);
  const back = <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-brand"><ArrowLeft className="h-4 w-4" aria-hidden />All my projects</button>;
  if (detail.error && detail.data === undefined) return <div className="space-y-3 p-4">{back}<Failed error={detail.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching} /></div>;
  if (!detail.data) return <div className="space-y-3 p-4">{back}<Loading label="Loading the engagement" rows={4} /></div>;
  const data = detail.data;
  const mine = (today.data ?? []).filter(item => item.engagementId === engagementId);
  const next = data.sessions.filter(session => session.status === "planned" && session.scheduledFor && new Date(session.scheduledFor).getTime() >= now).sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())[0] ?? null;
  const withClient = data.tasks.filter(task => task.side === "client" && OPEN_TASK_STATUSES.includes(task.status)).length;
  const unsorted = data.inbox.filter(file => !file.taskIds.length).length;
  const toApprove = data.can.review ? data.deliverables.filter(item => item.status === "awaiting_approval").length : 0;
  const count = (value: number, label: string) => (value ? { value, label } : undefined);
  // Day N of M, as the client's room shows it, for a dated engagement once it has started.
  const plan = DATED_TYPES[data.engagement.type];
  const started = data.engagement.startedOn;
  const dayNumber = plan && started ? Math.round((new Date(`${lagosDay(new Date(now))}T00:00:00Z`).getTime() - new Date(`${started}T00:00:00Z`).getTime()) / 86_400_000) + 1 : null;
  const progress = plan && dayNumber !== null && dayNumber >= 1 ? { day: Math.min(dayNumber, plan.durationDays), total: plan.durationDays } : null;
  const overview = (
    <div className="grid gap-4 p-4 sm:p-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="needs-you-here" className="space-y-2">
          <h2 id="needs-you-here" className="text-sm font-semibold text-ink">What needs you here <span className="font-normal text-ink-muted">({mine.length})</span></h2>
          {mine.length ? <ul className="grid gap-2 sm:grid-cols-2">{mine.map(item => <li key={item.key}><TodayCard item={item} now={now} /></li>)}</ul>
            : <p className="rounded-xl border border-line-soft bg-white p-4 text-sm text-ink-muted">Nothing needs you on {data.businessName || "this engagement"} right now.</p>}
        </section>
        <section aria-labelledby="next-meeting" className="rounded-xl border border-line-soft bg-white p-4">
          <h2 id="next-meeting" className="text-xs font-semibold text-ink-muted">Next meeting</h2>
          {next ? <>
            <p className="mt-1 font-medium text-ink">{next.title}</p>
            <p className="text-sm text-ink-600">{formatDateTime(next.scheduledFor!)}</p>
            {next.meetingLink && <a href={next.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand underline underline-offset-2">Join</a>}
          </> : <p className="mt-1 text-sm text-ink-muted">None booked.</p>}
        </section>
        <Card><StageAndTeam data={data} engagementId={engagementId} /></Card>
        {STAGED_TYPES.includes(data.engagement.type) && <Card><Problem data={data} engagementId={engagementId} /></Card>}
      </div>
      <aside aria-label="At a glance" className="space-y-4">
        <Card><TheClient data={data} engagementId={engagementId} /></Card>
      </aside>
    </div>
  );
  const pane = (children: React.ReactNode) => <div className="space-y-4 p-4 sm:p-7"><Card>{children}</Card></div>;
  const tabs: RoomTab[] = [
    { id: "overview", label: "Overview", count: count(mine.length, `${mine.length} for you`), content: overview },
    ...(data.engagement.type === "digital_marketing" ? [{ id: "content", label: "Content", content: pane(<ContentAdmin data={data} engagementId={engagementId} />) }] : []),
    { id: "plan", label: METHOD.workPlan, count: count(withClient, `${withClient} with the client`), content: pane(<Tasks data={data} engagementId={engagementId} />) },
    { id: "files", label: "Files", count: count(unsorted, `${unsorted} to match`), content: <div className="p-4 sm:p-7"><FilesByItem data={data} engagementId={engagementId} /></div> },
    { id: "meetings", label: `${METHOD.session}s`, content: pane(<Sessions data={data} engagementId={engagementId} />) },
    { id: "deliverables", label: METHOD.deliverables, count: count(toApprove, `${toApprove} to approve`), content: <div className="space-y-4 p-4 sm:p-7"><Card><Deliverables data={data} engagementId={engagementId} /></Card>{STAGED_TYPES.includes(data.engagement.type) && <Card><TheFix data={data} engagementId={engagementId} /></Card>}</div> },
    ...(data.can.seeFees ? [{ id: "fees", label: "Fees", content: pane(<FeesAdmin engagementId={engagementId} owner={data.owner} />) }] : []),
  ];
  return (
    <div className="room-skin bg-paper text-ink" aria-label={`${data.businessName} workspace`} role="region">
      <section aria-labelledby="workspace-title" className="border-b border-line-soft bg-white px-4 pt-4 pb-4 sm:px-7">
        {back}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">{data.engagement.typeLabel && <><span>{data.engagement.typeLabel}</span><span aria-hidden className="px-1.5">/</span></>}<span>{data.engagement.stageLabel}</span></p>
            <h1 id="workspace-title" className="mt-1 font-sans text-2xl font-semibold tracking-tight">{data.businessName || "The client"}</h1>
            {myRole && <p className="mt-1 text-sm text-brand">You are the {myRole}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-5">
          {progress && (
            <div className="w-56">
              <div className="flex justify-between gap-3 text-xs"><span className="font-medium text-ink">Day {progress.day} of {progress.total}</span><span className="text-ink-muted tabular-nums">{Math.round((progress.day / progress.total) * 100)}%</span></div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken" role="progressbar" aria-label={`Day ${progress.day} of ${progress.total}`} aria-valuenow={progress.day} aria-valuemin={0} aria-valuemax={progress.total}>
                <div className="h-full rounded-full bg-brand" style={{ width: `${(progress.day / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          {data.team.length > 0 && (
            <div role="img" className="flex" aria-label={`Team: ${data.team.map(member => member.name).join(", ")}`}>
              {data.team.map(member => <span key={`${member.userId}-${member.role}`} title={`${member.name}, ${member.roleLabel}`} aria-hidden className={`-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-medium text-white first:ml-0 ${avatarColour(member.name ?? "")}`}>{initials(member.name ?? "")}</span>)}
            </div>
          )}
          </div>
        </div>
      </section>
      {data.hold && <div className="px-4 pt-4 sm:px-7"><FeeHoldNote hold={data.hold} /></div>}
      <Compact.Provider value={true}><FocusTask.Provider value={openTaskId}><RoomTabs label={`${data.businessName} workspace`} initial={openTaskId !== null ? "plan" : "overview"} tabs={tabs} /></FocusTask.Provider></Compact.Provider>
    </div>
  );
}

/**
 * "Send sign-in link": a client who lost their way in gets the right link by email, a password reset if they have an
 * account, a fresh invitation if not. The link shows here once, for WhatsApp, in case the email does not arrive.
 */
function SendSignInLink({ businessCheckId, hasAccount, owner }: { businessCheckId: number; hasAccount: boolean; owner?: { name: string; whatsapp: string | null } | null }) {
  const [sent, setSent] = useState<{ kind: "reset" | "invitation"; email: string; url: string; deliveryStatus: string } | null>(null);
  const send = trpc.onboarding.sendSignInLink.useMutation({
    onSuccess: result => {
      setSent(result);
      toast.success(result.deliveryStatus === "Sent" ? `Sent to ${result.email}.` : "Ready. Send them the link below.");
    },
    onError: error => toast.error(error.message),
  });
  return (
    <div className="space-y-2 border-t border-line-soft pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={send.isPending} onClick={() => send.mutate({ businessCheckId })}>
          {send.isPending ? "Sending…" : "Send sign-in link"}
        </Button>
        <span className="text-xs text-ink-muted">{hasAccount ? "Emails a link to choose a new password. It works once, for 20 minutes." : "Emails a fresh invitation to create the account. The one still out stops working."}</span>
      </div>
      {sent && (
        <div role="status" className="space-y-1 border border-brand-line bg-brand-tint p-3 text-xs">
          <p className="font-semibold">{sent.kind === "reset" ? "Password reset link" : "Account invitation"} for {sent.email} · {sent.deliveryStatus === "Sent" ? "emailed" : "not emailed: send it yourself"}</p>
          <p className="break-all font-mono">{sent.url}</p>
          <p className="text-ink-muted">Shown once. Share it only with the client.</p>
          <WhatsAppShare number={owner?.whatsapp} message={sent.kind === "reset"
            ? `Hello ${firstNameOf(owner?.name ?? "")}, here is your link to choose a new password for your room on The Shift. It works once, for 20 minutes: ${sent.url}`
            : `Hello ${firstNameOf(owner?.name ?? "")}, here is your link to set up your account for your room on The Shift: ${sent.url}`} />
        </div>
      )}
    </div>
  );
}

/**
 * Files on a request or deliverable: open any; attach one when storage is set up. The lead chooses who sees it; a
 * Specialist's file is for IP Factory only, a draft the lead shares with the client when it is ready.
 */
/** The team removes a file (a wrong or private one), saying why; the stored file is deleted (R61). */
function RemoveStaffFile({ fileId, fileName, engagementId }: { fileId: number; fileName: string; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const [reason, setReason] = useState<string | null>(null);
  const remove = trpc.engagement.staff.removeFile.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); setReason(null); toast.success("File removed."); } });
  if (reason === null) return <button type="button" className="text-xs font-semibold text-danger-strong underline underline-offset-2" onClick={() => setReason("")}>Remove</button>;
  return (
    <span className="flex w-full flex-wrap items-center gap-2" role="group" aria-label={`Remove ${fileName}`}>
      <input aria-label={`Why ${fileName} is removed`} className={`${FIELD} w-auto min-w-48 flex-1`} placeholder="Why (recorded; the client is not told)" value={reason} maxLength={300} onChange={event => setReason(event.target.value)} />
      <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-danger text-white`} disabled={remove.isPending || reason.trim().length < 3} onClick={() => remove.mutate({ fileId, reason })}>{remove.isPending ? "Removing…" : "Remove the file"}</Button>
      <button type="button" className="text-xs text-ink-muted underline underline-offset-2" onClick={() => setReason(null)}>Cancel</button>
    </span>
  );
}

/** `briefFor`: a Specialist attaching the brief to a request they sent (R78): the client sees it. */
function StaffFiles({ files, engagementId, target, canUpload, canManage, briefFor = false }: { files: StaffFile[]; engagementId: number; target: UploadTarget; canUpload: boolean; canManage: boolean; briefFor?: boolean }) {
  const refresh = useRefresh(engagementId);
  const link = trpc.engagement.staff.fileLink.useMutation({ onError: error => toast.error(error.message) });
  const request = trpc.engagement.staff.requestUpload.useMutation();
  const confirm = trpc.engagement.staff.confirmUpload.useMutation();
  const [chosen, setAudience] = useState<EngagementAudience>("owner");
  const audience: EngagementAudience = canManage ? chosen : briefFor ? "business" : "team";
  const shareFile = trpc.engagement.staff.shareFile.useMutation({ onSuccess: () => { refresh.onSuccess(); toast.success("Shared with the client."); }, onError: error => toast.error(error.message) });
  const [busy, setBusy] = useState(false);
  const send = async (file: File) => {
    setBusy(true);
    try {
      const meta = { fileName: file.name, contentType: file.type, sizeBytes: file.size };
      const ticket = await request.mutateAsync({ engagementId, target, ...meta });
      const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
      if (!put.ok) throw new Error("The upload did not finish. Try again.");
      await confirm.mutateAsync({ engagementId, target, storageKey: ticket.storageKey, audience, ...meta });
      refresh.onSuccess();
      toast.success(audience === "team" ? "Draft attached, for IP Factory only. The lead shares it with the client." : "File attached.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The upload did not finish.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1 border-t border-line-soft pt-2">
      {files.length > 0 && (
        <ul aria-label="Files" className="space-y-1 text-sm">
          {files.map(file => (
            <li key={file.id} className="flex flex-wrap items-center gap-2">
              <span>{file.fileName}</span>
              <span className="text-xs text-ink-muted">{formatFileSize(file.sizeBytes)} · {file.uploadedByName || "unknown"} · {ENGAGEMENT_AUDIENCE_LABELS[file.audience].toLowerCase()}</span>
              <button type="button" className="text-xs font-semibold text-brand underline underline-offset-2" disabled={link.isPending} onClick={() => link.mutateAsync({ fileId: file.id }).then(result => window.open(result.url, "_blank", "noopener"))}>Open</button>
              {canManage && file.audience === "team" && <button type="button" className="text-xs font-semibold text-brand underline underline-offset-2" disabled={shareFile.isPending} onClick={() => shareFile.mutate({ fileId: file.id, audience: "owner" })}>Share with the owner</button>}
              {canManage && <RemoveStaffFile fileId={file.id} fileName={file.fileName} engagementId={engagementId} />}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex cursor-pointer items-center border border-line bg-white px-2 py-1 text-xs font-medium ${busy ? "opacity-60" : ""}`}>
            {busy ? "Uploading…" : "Attach a file"}
            <input type="file" className="sr-only" accept={UPLOAD_ACCEPT} disabled={busy} aria-label={`Attach a file to ${target.kind} ${target.id}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void send(file); }} />
          </label>
          {canManage ? (
            <select aria-label="Who sees the file" className={`${FIELD} w-auto`} value={chosen} onChange={event => setAudience(event.target.value as EngagementAudience)}>
              <option value="owner">{ENGAGEMENT_AUDIENCE_LABELS.owner}</option>
              <option value="business">{ENGAGEMENT_AUDIENCE_LABELS.business}</option>
              <option value="team">{ENGAGEMENT_AUDIENCE_LABELS.team}</option>
            </select>
          ) : briefFor ? <span className="text-xs text-ink-muted">The client sees it with your request</span> : <span className="text-xs text-ink-muted">{ENGAGEMENT_AUDIENCE_LABELS.team}: the lead shares it with the client</span>}
        </div>
      )}
    </div>
  );
}

function StageAndTeam({ data, engagementId }: { data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const setStage = trpc.engagement.staff.setStage.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Stage saved."); } });
  const assign = trpc.engagement.staff.assign.useMutation({ ...refresh, onSuccess: result => { refresh.onSuccess(); toast.success(`${result.added ? "Added to the team" : "Role changed"}${result.notified ? ", and emailed" : ""}.`); } });
  const remove = trpc.engagement.staff.removeMember.useMutation(refresh);
  const staff = trpc.engagement.staff.assignableStaff.useQuery(undefined, { enabled: data.can.assign });
  const [person, setPerson] = useState("");
  const [role, setRole] = useState<EngagementTeamRole>("analyst");
  // Someone already on the team changes role on their own row, so adding never replaces anyone.
  const available = (staff.data ?? []).filter(item => !data.team.some(member => member.userId === item.userId));
  return (
    <DetailSection title="Stage and team">
      {staff.error && !isRefusal(staff.error) && staff.data === undefined && <Failed error={staff.error} onRetry={() => void staff.refetch()} retrying={staff.isFetching} />}
      <div className="space-y-1">
        <label className={LABEL} htmlFor="engagement-stage">Stage</label>
        {/* Someone who cannot change the stage reads it; a control that looks editable but is not only confuses. */}
        {!data.can.manage ? <p id="engagement-stage" className="text-sm text-ink">{data.engagement.stageLabel}</p> : <select id="engagement-stage" className={FIELD} disabled={setStage.isPending} value={STAGED_TYPES.includes(data.engagement.type) || data.engagement.stage === "closed" ? data.engagement.stage : "setting_up"} onChange={event => setStage.mutate({ engagementId, stage: event.target.value as EngagementStage })}>
          {/* The stage follows the type: a Business Review or Six-Week Fix moves through the method; any other type is open or closed (its steps are read from its dates or its work). */}
          {(STAGED_TYPES.includes(data.engagement.type) ? ENGAGEMENT_STAGES.map(stage => [stage, ENGAGEMENT_STAGE_LABELS[stage]] as const) : ([["setting_up", "Open"], ["closed", "Closed"]] as const))
            .map(([stage, name]) => <option key={stage} value={stage}>{name}</option>)}
        </select>}
      </div>
      <ul aria-label="Team" className="space-y-1 text-sm">
        {data.team.map(member => (
          <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft py-1">
            <span>{member.name || member.email}{member.jobTitle ? <span className="text-ink-muted"> · {member.jobTitle}</span> : null}</span>
            {data.can.assign ? (
              <span className="flex items-center gap-2">
                <select aria-label={`Role of ${member.name || member.email}`} className={`${FIELD} w-auto`} disabled={assign.isPending} value={member.role} onChange={event => assign.mutate({ engagementId, userId: member.userId, role: event.target.value as EngagementTeamRole })}>
                  {teamRolesFor(data.engagement.type).map(item => <option key={item} value={item}>{ENGAGEMENT_TEAM_ROLE_LABELS[item]}</option>)}
                </select>
                <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={remove.isPending} onClick={() => remove.mutate({ engagementId, userId: member.userId })}>Remove</Button>
              </span>
            ) : <span className="text-ink-muted">{member.roleLabel}</span>}
          </li>
        ))}
        {data.team.length === 0 && <li className="text-danger">No one is on this engagement yet.</li>}
      </ul>
      {data.can.assign && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <label className={LABEL} htmlFor="team-person">Add to the team</label>
              <select id="team-person" className={FIELD} value={person} onChange={event => setPerson(event.target.value)}>
                <option value="">{available.length ? "Choose a person" : "Everyone with a staff account is on the team"}</option>
                {available.map(item => <option key={item.userId} value={item.userId}>{item.name || item.email}</option>)}
              </select>
            </div>
            <select aria-label="Role on the engagement" className={`${FIELD} w-auto`} value={role} onChange={event => setRole(event.target.value as EngagementTeamRole)}>
              {teamRolesFor(data.engagement.type).map(item => <option key={item} value={item}>{ENGAGEMENT_TEAM_ROLE_LABELS[item]}</option>)}
            </select>
            <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={!person || assign.isPending} onClick={() => { assign.mutate({ engagementId, userId: Number(person), role }); setPerson(""); }}>Add</Button>
          </div>
          <p className="text-xs text-ink-muted">Only colleagues with a staff account appear here. Invite one in People, with a role; once they accept, add them here. They are emailed when added.</p>
        </>
      )}
    </DetailSection>
  );
}

function Problem({ data, engagementId }: { data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const save = trpc.engagement.staff.saveProblem.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Problem Statement saved."); } });
  const [area, setArea] = useState(data.engagement.problemArea === null ? "" : String(data.engagement.problemArea));
  const [sub, setSub] = useState(data.engagement.subProblem ?? "");
  const [statement, setStatement] = useState(data.engagement.problemStatement ?? "");
  return (
    <DetailSection title="Problem Statement">
      <p className="text-xs text-ink-muted">Agreed at the end of the Business Review. One problem per Fix.</p>
      <label className={LABEL} htmlFor="problem-area">Problem area</label>
      <select id="problem-area" className={FIELD} disabled={!data.can.manage} value={area} onChange={event => setArea(event.target.value)}>
        <option value="">Not chosen yet</option>
        {PROBLEM_AREAS.map(item => <option key={item.number} value={item.number}>{item.number}. {item.name}</option>)}
      </select>
      <label className={LABEL} htmlFor="sub-problem">Sub-problem</label>
      <input id="sub-problem" className={FIELD} disabled={!data.can.manage} value={sub} maxLength={255} onChange={event => setSub(event.target.value)} />
      <label className={LABEL} htmlFor="problem-statement">The Problem Statement, in the owner's words</label>
      <textarea id="problem-statement" className={FIELD} rows={3} disabled={!data.can.manage} value={statement} onChange={event => setStatement(event.target.value)} />
      {data.can.manage && <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending} onClick={() => save.mutate({ engagementId, problemArea: area === "" ? null : Number(area), subProblem: sub, problemStatement: statement })}>Save the Problem Statement</Button>}
    </DetailSection>
  );
}

/**
 * The type's current plan for an engagement already open (R77): adds the Sessions and items it does not have yet,
 * dated from its kickoff. Nothing already there changes. The lead (manage_engagements) only; the server checks.
 */
function PlanUpdate({ engagementId }: { engagementId: number }) {
  const utils = trpc.useUtils();
  const add = trpc.engagement.staff.addMissingPlan.useMutation({
    onSuccess: result => {
      void utils.engagement.staff.detail.invalidate({ engagementId });
      const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
      toast.success(result.sessions + result.items === 0 ? "This engagement already has everything in the plan." : `Added ${count(result.sessions, "Session")} and ${count(result.items, "item")} from the plan.`);
    },
    onError: error => toast.error(error.message),
  });
  return (
    <div role="group" aria-label="The plan" className="flex flex-wrap items-center justify-between gap-2 border border-line bg-white p-2 text-xs">
      <span className="min-w-0 flex-1 text-ink-muted">The plan has Weekly Check-ins in month 1 then every two weeks, a review each month, and footage every Thursday. Add what this engagement is missing, dated from its kickoff. Nothing already here changes.</span>
      <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={add.isPending} onClick={() => add.mutate({ engagementId })}>Add what's missing from the plan</Button>
    </div>
  );
}

function Sessions({ data, engagementId }: { data: Detail; engagementId: number }) {
  const [editing, setEditing] = useState<number | null>(null);
  // One list of what is booked (R81): each meeting once, with Edit for a new time or the notes. The plan's Sessions
  // without a time are not forms: one line says what is still to book.
  const booked = data.sessions.filter(session => session.scheduledFor && session.status !== "cancelled")
    .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime());
  const toBook = data.sessions.filter(session => !session.scheduledFor && session.status === "planned");
  const counts = Array.from(toBook.reduce((map, session) => map.set(session.title, (map.get(session.title) ?? 0) + 1), new Map<string, number>()));
  return (
    <DetailSection title="Sessions">
      <p className="text-xs text-ink-muted">Book in Zoom and paste the invitation: everyone on the engagement is emailed the time and the Join link, and the client sees it in their room. If the time changes, paste the new invitation, or Edit it below. Notes reach the client only when you share them.</p>
      {data.can.manage && <BookMeeting engagementId={engagementId} businessName={data.businessName || "the client"} />}
      {counts.length > 0 && <p className="text-xs text-ink-muted">Still to book from the plan: {counts.map(([title, count]) => (count > 1 ? `${title} (${count})` : title)).join(", ")}.</p>}
      {booked.length === 0 ? <p className="text-sm text-ink-muted">Nothing booked yet.</p> : (
        <ul className="divide-y divide-line-soft border border-line bg-white" aria-label="Booked Sessions">
          {booked.map(session => (
            <li key={session.id} className="p-3" aria-label={session.title}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{session.title} <span className="text-xs font-normal text-ink-muted">· {SESSION_STATUS_LABELS[session.status]}</span></p>
                  <p className="text-xs text-ink-muted">{formatDateTime(session.scheduledFor)}{session.durationMinutes ? `, ${session.durationMinutes} minutes` : ""}{session.meetingLink ? <> · <a className="text-brand underline" href={session.meetingLink} target="_blank" rel="noreferrer">Join link</a></> : ""}</p>
                </div>
                <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} aria-expanded={editing === session.id} onClick={() => setEditing(editing === session.id ? null : session.id)}>{editing === session.id ? "Close" : "Edit"}</Button>
              </div>
              {editing === session.id && <div className="mt-2"><SessionCard session={session} engagementId={engagementId} canManage={data.can.manage} seeInternal={data.can.seeInternal} onDone={() => setEditing(null)} /></div>}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

function SessionCard({ session, engagementId, canManage, seeInternal, onDone }: { session?: Session; engagementId: number; canManage: boolean; seeInternal: boolean; onDone?: () => void }) {
  const refresh = useRefresh(engagementId);
  const [kind, setKind] = useState<EngagementSessionKind>(session?.kind ?? "check_in");
  const [title, setTitle] = useState(session?.title ?? "");
  const [date, setDate] = useState(toDateInput(session?.scheduledFor));
  const [time, setTime] = useState(toTimeInput(session?.scheduledFor));
  const [duration, setDuration] = useState(session?.durationMinutes ? String(session.durationMinutes) : "");
  const [link, setLink] = useState(session?.meetingLink ?? "");
  const [agenda, setAgenda] = useState(session?.agenda ?? "");
  const [status, setStatus] = useState<EngagementSessionStatus>(session?.status ?? "planned");
  const [clientNotes, setClientNotes] = useState(session?.clientNotes ?? "");
  const [internalNotes, setInternalNotes] = useState(session?.internalNotes ?? "");
  const save = trpc.engagement.staff.saveSession.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Session saved."); onDone?.(); } });
  const saveNotes = trpc.engagement.staff.saveNotes.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Notes saved. The client cannot see them until you share."); } });
  const share = trpc.engagement.staff.shareNotes.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Notes shared."); } });
  const id = session?.id ?? "new";
  const notesChanged = (session?.clientNotes ?? "") !== clientNotes || (session?.internalNotes ?? "") !== internalNotes;
  return (
    <div className="space-y-2 border border-line bg-paper-raised p-3" aria-label={session?.title ?? "New Session"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className={LABEL} htmlFor={`title-${id}`}>Title</label><input id={`title-${id}`} className={FIELD} disabled={!canManage} value={title} onChange={event => setTitle(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`kind-${id}`}>Kind</label><select id={`kind-${id}`} className={FIELD} disabled={!canManage} value={kind} onChange={event => setKind(event.target.value as EngagementSessionKind)}>{ENGAGEMENT_SESSION_KINDS.map(item => <option key={item} value={item}>{ENGAGEMENT_SESSION_KIND_LABELS[item]}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`date-${id}`}>Date</label><input id={`date-${id}`} type="date" className={FIELD} disabled={!canManage} value={date} onChange={event => setDate(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`time-${id}`}>Time</label><input id={`time-${id}`} type="time" className={FIELD} disabled={!canManage} value={time} onChange={event => setTime(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`duration-${id}`}>Minutes</label><input id={`duration-${id}`} type="number" min={5} max={480} className={FIELD} disabled={!canManage} value={duration} onChange={event => setDuration(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`status-${id}`}>Status</label><select id={`status-${id}`} className={FIELD} disabled={!canManage} value={status} onChange={event => setStatus(event.target.value as EngagementSessionStatus)}>{ENGAGEMENT_SESSION_STATUSES.map(item => <option key={item} value={item}>{SESSION_STATUS_LABELS[item]}</option>)}</select></div>
      </div>
      <label className={LABEL} htmlFor={`link-${id}`}>Meeting link</label>
      <input id={`link-${id}`} className={FIELD} disabled={!canManage} placeholder="https://" value={link} onChange={event => setLink(event.target.value)} />
      <label className={LABEL} htmlFor={`agenda-${id}`}>Agenda (the client sees it)</label>
      <textarea id={`agenda-${id}`} className={FIELD} rows={2} disabled={!canManage} value={agenda} onChange={event => setAgenda(event.target.value)} />
      {canManage && (
        <div className="flex gap-2">
          <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending || !title.trim()} onClick={() => save.mutate({
            engagementId, sessionId: session?.id, kind, title, scheduledFor: combineDateAndTime(date, time), durationMinutes: duration ? Number(duration) : null, meetingLink: link.trim() || null, agenda, status,
          })}>Save the Session</Button>
          {onDone && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>}
        </div>
      )}
      {session && (
        <div className="space-y-2 border-t border-line-soft pt-2">
          <label className={LABEL} htmlFor={`client-notes-${id}`}>Notes for the client</label>
          <textarea id={`client-notes-${id}`} className={FIELD} rows={4} disabled={!canManage} value={clientNotes} onChange={event => setClientNotes(event.target.value)} />
          {seeInternal && (
            <>
              <label className={LABEL} htmlFor={`internal-notes-${id}`}>Internal notes (never shown to the client)</label>
              <textarea id={`internal-notes-${id}`} className={FIELD} rows={3} disabled={!canManage} value={internalNotes} onChange={event => setInternalNotes(event.target.value)} />
            </>
          )}
          <p className="text-xs text-ink-muted">{session.notesSharedAt ? `Shared ${formatDateTime(session.notesSharedAt)}: ${ENGAGEMENT_AUDIENCE_LABELS[session.notesAudience].toLowerCase()}.` : "Not shared yet."}</p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={saveNotes.isPending || !notesChanged} onClick={() => saveNotes.mutate({ sessionId: session.id, clientNotes, internalNotes })}>Save notes</Button>
              <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={share.isPending || notesChanged || !session.clientNotes} onClick={() => share.mutate({ sessionId: session.id, audience: "owner" })}>Share with the owner</Button>
              <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={share.isPending || notesChanged || !session.clientNotes} onClick={() => share.mutate({ sessionId: session.id, audience: "business" })}>Share with the owner and their team</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The Work Plan: every Data Request and action, by week and in order, the client's side and ours. */
type ContentItem = Detail["content"][number];

/**
 * The content board, for the team: each reel, post and story by month, moved through planned, in edit and for the
 * client's approval to published. The client approves or asks for changes in their room.
 */
function ContentAdmin({ data, engagementId }: { data: Detail; engagementId: number }) {
  const [adding, setAdding] = useState(false);
  const months = Array.from(new Set([1, 2, 3, ...data.content.map(item => item.month)])).sort((a, b) => a - b);
  return (
    <DetailSection title={`Content (${data.content.length})`}>
      <p className="text-xs text-ink-muted">Reels, posts and stories by month. Move a piece to For your approval when the client should see it; it counts once they approve it. Nothing is published without their yes.</p>
      {months.map(month => {
        const items = data.content.filter(item => item.month === month);
        if (!items.length) return null;
        return (
          <div key={month} className="space-y-2">
            <p className={`${LABEL} mt-3`}>Month {month}</p>
            {items.map(item => <ContentRow key={item.id} item={item} engagementId={engagementId} canManage={data.can.manage} />)}
          </div>
        );
      })}
      {adding ? <ContentRow engagementId={engagementId} canManage={data.can.manage} onDone={() => setAdding(false)} /> : data.can.manage && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAdding(true)}>Add a piece of content</Button>}
    </DetailSection>
  );
}

function ContentRow({ item, engagementId, canManage, onDone }: { item?: ContentItem; engagementId: number; canManage: boolean; onDone?: () => void }) {
  const refresh = useRefresh(engagementId);
  const [kind, setKind] = useState<ContentKind>(item?.kind ?? "reel");
  const [title, setTitle] = useState(item?.title ?? "");
  const [month, setMonth] = useState(String(item?.month ?? 1));
  const [status, setStatus] = useState<ContentStatus>(item?.status ?? "planned");
  const [dueOn, setDueOn] = useState(item?.dueOn ?? "");
  const [link, setLink] = useState(item?.link ?? "");
  const save = trpc.engagement.staff.saveContent.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Saved."); onDone?.(); } });
  const remove = trpc.engagement.staff.deleteContent.useMutation(refresh);
  const id = item?.id ?? "new";
  return (
    <div className="space-y-2 border border-line bg-paper-raised p-3" aria-label={item?.title ?? "New piece of content"}>
      {item?.status === "changes_requested" && item.clientNote && <p className="text-xs text-danger">The client asked for changes: {item.clientNote}</p>}
      <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_6rem]">
        <div><label className={LABEL} htmlFor={`content-kind-${id}`}>Kind</label><select id={`content-kind-${id}`} className={FIELD} disabled={!canManage} value={kind} onChange={event => setKind(event.target.value as ContentKind)}>{CONTENT_KINDS.map(value => <option key={value} value={value}>{CONTENT_KIND_LABELS[value]}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`content-title-${id}`}>Title</label><input id={`content-title-${id}`} className={FIELD} disabled={!canManage} value={title} onChange={event => setTitle(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`content-month-${id}`}>Month</label><select id={`content-month-${id}`} className={FIELD} disabled={!canManage} value={month} onChange={event => setMonth(event.target.value)}>{[1, 2, 3].map(value => <option key={value} value={value}>Month {value}</option>)}</select></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className={LABEL} htmlFor={`content-status-${id}`}>Status</label><select id={`content-status-${id}`} className={FIELD} disabled={!canManage} value={status} onChange={event => setStatus(event.target.value as ContentStatus)}>{CONTENT_STATUSES.map(value => <option key={value} value={value}>{CONTENT_STATUS_LABELS[value]}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`content-due-${id}`}>Due</label><input id={`content-due-${id}`} type="date" className={FIELD} disabled={!canManage} value={dueOn} onChange={event => setDueOn(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`content-link-${id}`}>Link</label><input id={`content-link-${id}`} className={FIELD} disabled={!canManage} placeholder="https://" value={link} onChange={event => setLink(event.target.value)} /></div>
      </div>
      {canManage && (
        <div className="flex gap-2">
          <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending || !title.trim()} onClick={() => save.mutate({ engagementId, itemId: item?.id, kind, title, month: Number(month), status, dueOn: dueOn || null, link: link || null })}>Save</Button>
          {item && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={remove.isPending} onClick={() => remove.mutate({ itemId: item.id })}>Remove</Button>}
          {onDone && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>}
        </div>
      )}
    </div>
  );
}

type InboxFile = Detail["inbox"][number];

/**
 * The drop box, for the team: every file the client sent without saying what it answers. Tick the Data Requests a file
 * answers and save; the client sees the match, and a request still waiting on them moves to "Sent, we are checking".
 */
function FileInbox({ data, engagementId }: { data: Detail; engagementId: number }) {
  if (!data.inbox.length) return null;
  const unsorted = data.inbox.filter(file => !file.taskIds.length).length;
  return (
    <DetailSection title={`Files the client sent (${unsorted} to sort)`}>
      <p className="text-xs text-ink-muted">The client drops everything here without saying which file is which. Match each file to the Data Requests it answers; one file can answer several. Then mark each request Received, or ask for more, in the Work Plan below.</p>
      <div className="space-y-2">{data.inbox.map(file => <InboxRow key={file.id} file={file} data={data} engagementId={engagementId} />)}</div>
    </DetailSection>
  );
}

function InboxRow({ file, data, engagementId }: { file: InboxFile; data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const [picked, setPicked] = useState<number[]>(file.taskIds);
  const match = trpc.engagement.staff.matchFile.useMutation({ ...refresh, onSuccess: result => { refresh.onSuccess(); toast.success(result.moved ? `Matched. ${result.moved} request${result.moved === 1 ? "" : "s"} moved to "Sent, we are checking".` : "Matched."); } });
  const link = trpc.engagement.staff.fileLink.useMutation({ onError: error => toast.error(error.message) });
  const requests = data.tasks.filter(task => task.kind === "data_request" && task.status !== "cancelled").sort((a, b) => (a.ref ?? "").localeCompare(b.ref ?? "", undefined, { numeric: true }) || a.id - b.id);
  const changed = picked.length !== file.taskIds.length || picked.some(taskId => !file.taskIds.includes(taskId));
  return (
    <div className="border border-line bg-paper-raised p-3" aria-label={file.fileName}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <button type="button" className="font-medium text-brand underline underline-offset-2" disabled={link.isPending} onClick={() => link.mutateAsync({ fileId: file.id }).then(result => window.open(result.url, "_blank", "noopener"))}>{file.fileName}</button>
        <span className="text-xs text-ink-muted">{formatFileSize(file.sizeBytes)} · {file.uploadedByName ?? "The client"} · {formatDateTime(file.createdAt)}</span>
      </div>
      {file.note && <p className="mt-1 text-xs text-ink-600">“{file.note}”</p>}
      <fieldset className="mt-2">
        <legend className={LABEL}>Answers</legend>
        <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {requests.map(task => (
            <label key={task.id} className="flex items-start gap-2 text-xs text-ink">
              <input type="checkbox" disabled={!data.can.manage} checked={picked.includes(task.id)} onChange={event => setPicked(event.target.checked ? [...picked, task.id] : picked.filter(taskId => taskId !== task.id))} />
              <span>{task.ref && <span className="mr-1 font-mono">{task.ref}</span>}{task.title} <span className="text-ink-muted">({task.statusLabel})</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {data.can.manage && <Button type="button" size="sm" className={`${SMALL_BUTTON} mt-2 bg-brand text-white`} disabled={match.isPending || !changed} onClick={() => match.mutate({ fileId: file.id, taskIds: picked })}>Save the match</Button>}
      {data.can.manage && <div className="mt-2"><RemoveStaffFile fileId={file.id} fileName={file.fileName} engagementId={engagementId} /></div>}
    </div>
  );
}

function Tasks({ data, engagementId }: { data: Detail; engagementId: number }) {
  const compact = React.useContext(Compact);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const weekOf = (task: Task) => task.weekNumber ?? null;
  const weeks = Array.from(new Set(data.tasks.map(weekOf))).sort((a, b) => (a ?? 99) - (b ?? 99));
  const inWeek = (week: number | null) => data.tasks.filter(task => weekOf(task) === week).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  return (
    <DetailSection title="Work Plan">
      <p className="text-xs text-ink-muted">Data Requests from the client and actions on both sides, by week: the plan the Discovery Call shaped. The client sees their own items, and one line a week for ours. {data.can.seeAllTasks ? "You lead: you see every item." : "You see your own items."}</p>
      {DATED_TYPES[data.engagement.type] && data.can.manage && <PlanUpdate engagementId={engagementId} />}
      {data.unassignedTeamItems > 0 && (data.can.seeAllTasks || data.can.assign) && <AssignByRole engagementId={engagementId} count={data.unassignedTeamItems} />}
      {data.ask.allowed && (asking
        ? <AskClient data={data} engagementId={engagementId} onDone={() => setAsking(false)} />
        : <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} onClick={() => setAsking(true)}>Ask {data.businessName || "the client"}</Button>)}
      {compact ? <PlanTable data={data} engagementId={engagementId} /> : weeks.map(week => (
        <div key={week ?? "none"} className="space-y-2">
          <p className={`${LABEL} mt-3`}>{week === null ? "No week" : `Week ${week}`}</p>
          {inWeek(week).map(task => <TaskRow key={task.id} task={task} data={data} engagementId={engagementId} />)}
        </div>
      ))}
      {adding ? <TaskCard data={data} engagementId={engagementId} onDone={() => setAdding(false)} /> : (data.can.manage || data.can.contribute) && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAdding(true)}>{data.can.manage ? "Add to the Work Plan" : "Add a team item"}</Button>
          {data.can.manage && !loading && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setLoading(true)}>Load a Data Request</Button>}
        </div>
      )}
      {loading && <LoadDataRequest engagementId={engagementId} onDone={() => setLoading(false)} />}
    </DetailSection>
  );
}

function TaskCard({ task, data, engagementId, onDone }: { task?: Task; data: Detail; engagementId: number; onDone?: () => void }) {
  const refresh = useRefresh(engagementId);
  const [kind, setKind] = useState<EngagementTaskKind>(task?.kind ?? "action");
  // A Specialist adds team items only; the lead decides what the client is asked for.
  const [side, setSide] = useState<EngagementTaskSide>(task?.side ?? (data.can.manage ? "client" : "ipf"));
  const [title, setTitle] = useState(task?.title ?? "");
  const [detail, setDetail] = useState(task?.detail ?? "");
  // A team item always names its person (R88): a new one starts with whoever adds it.
  const [assignee, setAssignee] = useState(task?.assigneeUserId ? String(task.assigneeUserId) : !task ? String(data.viewerUserId) : "");
  const [dueOn, setDueOn] = useState(task?.dueOn ?? "");
  const [status, setStatus] = useState<EngagementTaskStatus>(task?.status ?? "open");
  const [note, setNote] = useState(task?.statusNote ?? "");
  const [week, setWeek] = useState(task?.weekNumber ? String(task.weekNumber) : "");
  const [order, setOrder] = useState(String(task?.sortOrder ?? 0));
  const [factor, setFactor] = useState<EngagementTaskFactor | "">(task?.factor ?? "");
  const [section, setSection] = useState(task?.section ?? "");
  const [ref, setRef] = useState(task?.ref ?? "");
  const [informs, setInforms] = useState(task?.informs ?? "");
  const [format, setFormat] = useState(task?.format ?? "");
  const [priority, setPriority] = useState<EngagementTaskPriority | "">(task?.priority ?? "");
  const save = trpc.engagement.staff.saveTask.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Saved."); onDone?.(); } });
  const people = side === "client" ? data.clientPeople.map(person => ({ userId: person.userId, name: person.name })) : data.team.map(member => ({ userId: member.userId, name: member.name ?? "" }));
  const id = task?.id ?? "new";
  // Editable by the lead; a Specialist fills in a new team item, and the lead changes the rest.
  const canManage = data.can.manage || (!task && data.can.contribute);
  const lead = data.can.manage;
  return (
    <div className="space-y-2 border border-line bg-paper-raised p-3" aria-label={task?.title ?? "New request or action"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className={LABEL} htmlFor={`task-kind-${id}`}>Kind</label><select id={`task-kind-${id}`} className={FIELD} disabled={!canManage} value={kind} onChange={event => setKind(event.target.value as EngagementTaskKind)}>{(["data_request", "action"] as const).map(item => <option key={item} value={item}>{KIND_LABELS[item]}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`task-side-${id}`}>Whose job</label><select id={`task-side-${id}`} className={FIELD} disabled={!lead} value={side} onChange={event => { setSide(event.target.value as EngagementTaskSide); setAssignee(""); }}>{(["client", "ipf"] as const).map(item => <option key={item} value={item}>{SIDE_LABELS[item]}</option>)}</select></div>
      </div>
      <label className={LABEL} htmlFor={`task-title-${id}`}>What</label>
      <input id={`task-title-${id}`} className={FIELD} disabled={!canManage} value={title} onChange={event => setTitle(event.target.value)} />
      <label className={LABEL} htmlFor={`task-detail-${id}`}>Detail</label>
      <textarea id={`task-detail-${id}`} className={FIELD} rows={2} disabled={!canManage} value={detail} onChange={event => setDetail(event.target.value)} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className={LABEL} htmlFor={`task-person-${id}`}>{side === "ipf" ? "Lead owner" : "Person"}</label><select id={`task-person-${id}`} className={FIELD} disabled={!lead} value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">{side === "client" ? "The business" : "Choose who"}</option>{people.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`task-due-${id}`}>Due</label><input id={`task-due-${id}`} type="date" className={FIELD} disabled={!canManage} value={dueOn} onChange={event => setDueOn(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`task-status-${id}`}>Status</label><select id={`task-status-${id}`} className={FIELD} disabled={!canManage} value={status} onChange={event => setStatus(event.target.value as EngagementTaskStatus)}>{ENGAGEMENT_TASK_STATUSES.map(item => <option key={item} value={item}>{ENGAGEMENT_TASK_STATUS_LABELS[item]}</option>)}</select></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className={LABEL} htmlFor={`task-week-${id}`}>Week</label><select id={`task-week-${id}`} className={FIELD} disabled={!canManage} value={week} onChange={event => setWeek(event.target.value)}><option value="">No week</option>{Array.from({ length: DATED_TYPES[data.engagement.type] ? 12 : 6 }, (_, index) => index + 1).map(item => <option key={item} value={item}>Week {item}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`task-order-${id}`}>Order in the week</label><input id={`task-order-${id}`} type="number" min={0} max={999} className={FIELD} disabled={!canManage} value={order} onChange={event => setOrder(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`task-factor-${id}`}>Factor</label><select id={`task-factor-${id}`} className={FIELD} disabled={!canManage} value={factor} onChange={event => setFactor(event.target.value as EngagementTaskFactor | "")}><option value="">Not tagged</option>{ENGAGEMENT_TASK_FACTORS.map(item => <option key={item} value={item}>{ENGAGEMENT_TASK_FACTOR_LABELS[item]}</option>)}</select></div>
      </div>
      {kind === "data_request" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className={LABEL} htmlFor={`task-section-${id}`}>Section</label><input id={`task-section-${id}`} className={FIELD} disabled={!canManage} maxLength={80} placeholder="B Financial performance" value={section} onChange={event => setSection(event.target.value)} /></div>
          <div><label className={LABEL} htmlFor={`task-ref-${id}`}>Reference</label><input id={`task-ref-${id}`} className={FIELD} disabled={!canManage} maxLength={8} placeholder="B1" value={ref} onChange={event => setRef(event.target.value)} /></div>
          <div><label className={LABEL} htmlFor={`task-informs-${id}`}>Why we ask (what it informs)</label><input id={`task-informs-${id}`} className={FIELD} disabled={!canManage} maxLength={200} placeholder="Where the business makes its money" value={informs} onChange={event => setInforms(event.target.value)} /></div>
          <div><label className={LABEL} htmlFor={`task-format-${id}`}>Format that is fine</label><input id={`task-format-${id}`} className={FIELD} disabled={!canManage} maxLength={80} placeholder="Excel preferred; photos are fine" value={format} onChange={event => setFormat(event.target.value)} /></div>
        </div>
      )}
      <div><label className={LABEL} htmlFor={`task-priority-${id}`}>Priority</label><select id={`task-priority-${id}`} className={FIELD} disabled={!canManage} value={priority} onChange={event => setPriority(event.target.value as EngagementTaskPriority | "")}><option value="">Not set</option>{ENGAGEMENT_TASK_PRIORITIES.map(item => <option key={item} value={item}>{ENGAGEMENT_TASK_PRIORITY_LABELS[item]}</option>)}</select></div>
      <label className={LABEL} htmlFor={`task-note-${id}`}>Note (the client sees it)</label>
      <input id={`task-note-${id}`} className={FIELD} disabled={!canManage} placeholder={status === "needs_more" ? "Say what else you need" : ""} value={note} onChange={event => setNote(event.target.value)} />
      {task?.responseLink && <p className="text-xs text-ink-600">The client sent a link: <a href={task.responseLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">Open the link</a> <span className="text-ink-muted">({(() => { try { return new URL(task.responseLink).hostname.replace(/^www\./, ""); } catch { return "link"; } })()})</span></p>}
      {/* The person a team item is for attaches what they hand in (R86), for IP Factory only until the lead shares it. */}
      {task && <StaffFiles files={task.files} engagementId={engagementId} target={{ kind: "task", id: task.id }} canUpload={data.uploadsEnabled && (canManage || task.requestedByUserId === data.viewerUserId || task.canHandIn)} canManage={canManage} briefFor={!canManage && task.requestedByUserId === data.viewerUserId} />}
      {task && <ItemConversation task={task} engagementId={engagementId} people={data.team.map(member => ({ name: member.name ?? "" }))} />}
      {canManage && (
        <div className="flex gap-2">
          <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending || !title.trim() || (side === "ipf" && !assignee)} onClick={() => save.mutate({
            engagementId, taskId: task?.id, kind, side, title, detail, assigneeUserId: assignee ? Number(assignee) : null, dueOn: dueOn || null, status, statusNote: note, sessionId: task?.sessionId ?? null,
            weekNumber: week ? Number(week) : null, sortOrder: Number(order) || 0, factor: factor || null,
            priority: priority || null,
            ...(kind === "data_request" ? { section, ref, informs, format } : { section: null, ref: null, informs: null, format: null }),
          })}>Save</Button>
          {onDone && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>}
        </div>
      )}
    </div>
  );
}

function Deliverables({ data, engagementId }: { data: Detail; engagementId: number }) {
  const [adding, setAdding] = useState(false);
  return (
    <DetailSection title="Deliverables">
      <p className="text-xs text-ink-muted">Findings, the problem statement, the prescription, tools and the plan. A Partner, Vice President or Senior Associate, or this engagement's lead, approves every prescription and plan before the client sees it. Editing a shared item takes it back to draft.</p>
      {data.deliverables.map(item => <DeliverableRow key={item.id} item={item} data={data} engagementId={engagementId} />)}
      {adding ? <DeliverableCard data={data} engagementId={engagementId} onDone={() => setAdding(false)} /> : data.can.manage && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAdding(true)}>Add a deliverable</Button>}
    </DetailSection>
  );
}

const DELIVERABLE_STATUS_TEXT = { draft: "Draft", awaiting_approval: "Waiting for approval", approved: "Approved, not shared yet", shared: "Shared" } as const;

function DeliverableCard({ item, data, engagementId, onDone }: { item?: Deliverable; data: Detail; engagementId: number; onDone?: () => void }) {
  const refresh = useRefresh(engagementId);
  const [kind, setKind] = useState<EngagementDeliverableKind>(item?.kind ?? "findings");
  const [title, setTitle] = useState(item?.title ?? "");
  const [summary, setSummary] = useState(item?.summary ?? "");
  const [comment, setComment] = useState("");
  const save = trpc.engagement.staff.saveDeliverable.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Saved as a draft."); onDone?.(); } });
  const approve = trpc.engagement.staff.approveDeliverable.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Approved."); } });
  const share = trpc.engagement.staff.shareDeliverable.useMutation({
    ...refresh,
    onSuccess: result => { refresh.onSuccess(); toast.success(result.balancesDated ? "Shared with the client. The second half falls due in seven days, and they were emailed its link." : "Shared with the client."); },
  });
  const addComment = trpc.engagement.staff.comment.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); setComment(""); } });
  const id = item?.id ?? "new";
  const changed = !item || item.kind !== kind || item.title !== title || (item.summary ?? "") !== summary;
  const needsApproval = DELIVERABLES_NEEDING_APPROVAL.includes(kind);
  const approved = item?.status === "approved" || item?.status === "shared";
  return (
    <div className="space-y-2 border border-line bg-paper-raised p-3" aria-label={item?.title ?? "New deliverable"}>
      {item && <p className="text-xs text-ink-muted">{DELIVERABLE_STATUS_TEXT[item.status]}{item.sharedAt ? ` · ${formatDate(item.sharedAt)}, ${ENGAGEMENT_AUDIENCE_LABELS[item.audience].toLowerCase()}` : ""}{item.clientAcceptedAt ? " · signed off by the owner" : ""}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className={LABEL} htmlFor={`deliverable-kind-${id}`}>Kind</label><select id={`deliverable-kind-${id}`} className={FIELD} disabled={!data.can.manage} value={kind} onChange={event => setKind(event.target.value as EngagementDeliverableKind)}>{ENGAGEMENT_DELIVERABLE_KINDS.map(value => <option key={value} value={value}>{ENGAGEMENT_DELIVERABLE_KIND_LABELS[value]}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`deliverable-title-${id}`}>Title</label><input id={`deliverable-title-${id}`} className={FIELD} disabled={!data.can.manage} value={title} onChange={event => setTitle(event.target.value)} /></div>
      </div>
      <label className={LABEL} htmlFor={`deliverable-summary-${id}`}>What it says</label>
      <textarea id={`deliverable-summary-${id}`} className={FIELD} rows={5} disabled={!data.can.manage} value={summary} onChange={event => setSummary(event.target.value)} />
      {!item && kind === "findings" && !summary.trim() && data.can.manage && (
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setSummary(FINDINGS_OUTLINE)}>Start from the standard Findings outline</Button>
      )}
      <div className="flex flex-wrap gap-2">
        {data.can.manage && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={save.isPending || !changed || !title.trim()} onClick={() => save.mutate({ engagementId, deliverableId: item?.id, kind, title, summary })}>{item ? "Save changes" : "Save as a draft"}</Button>}
        {onDone && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>}
        {item && !changed && needsApproval && !approved && data.can.review && <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={approve.isPending} onClick={() => approve.mutate({ deliverableId: item.id })}>Approve</Button>}
        {item && !changed && data.can.manage && item.status !== "shared" && (
          <>
            <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={share.isPending || (needsApproval && !approved)} onClick={() => share.mutate({ deliverableId: item.id, audience: "owner" })}>Share with the owner</Button>
            <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={share.isPending || (needsApproval && !approved)} onClick={() => share.mutate({ deliverableId: item.id, audience: "business" })}>Share with the owner and their team</Button>
          </>
        )}
      </div>
      {item && <StaffFiles files={item.files} engagementId={engagementId} target={{ kind: "deliverable", id: item.id }} canUpload={data.uploadsEnabled && (data.can.manage || data.can.contribute)} canManage={data.can.manage} />}
      {item && needsApproval && !approved && <p className="text-xs text-ink-muted">A Partner, Vice President or Senior Associate, or this engagement's lead, approves this before it can be shared.</p>}
      {item && item.status !== "shared" && data.can.manage && <DeliveryShareNote type={data.engagement.type} kind={item.kind} balanceWaiting={data.balanceOnDelivery} />}
      {item && (
        <div className="space-y-1 border-t border-line-soft pt-2">
          {item.comments.map(entry => <p key={entry.id} className="text-sm"><span className="font-medium">{entry.authorName}</span> <span className="text-xs text-ink-muted">{formatDateTime(entry.createdAt)}</span><br />{entry.body}</p>)}
          <div className="flex gap-2">
            <input aria-label={`Comment on ${item.title}`} className={FIELD} value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a comment" />
            <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ deliverableId: item.id, body: comment })}>Post</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

/** The fix: the one number (set in week 1) and the weekly check-in, recorded in order. */
function TheFix({ data, engagementId }: { data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const measure = data.measure;
  const [name, setName] = useState(measure?.name ?? "");
  const [definition, setDefinition] = useState(measure?.definition ?? "");
  const [unit, setUnit] = useState(measure?.unit ?? "");
  const [baseline, setBaseline] = useState(measure?.baselineValue === null || measure?.baselineValue === undefined ? "" : String(measure.baselineValue));
  const [target, setTarget] = useState(measure?.targetValue === null || measure?.targetValue === undefined ? "" : String(measure.targetValue));
  const [adding, setAdding] = useState(false);
  const compact = React.useContext(Compact);
  const [editing, setEditing] = useState(false);
  const save = trpc.engagement.staff.saveMeasure.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); setEditing(false); toast.success("The Measure of Success is saved. The client can see it."); } });
  const nextWeek = (data.checkins.at(-1)?.weekNumber ?? 0) + 1;
  const canManage = data.can.manage;
  return (
    <DetailSection title="Six-Week Fix: the Measure of Success and the Weekly Check-in">
      <p className="text-xs text-ink-muted">One problem, one Measure of Success. Set it in week 1 of the Six-Week Fix with where it starts and where it should get to; the client sees it. Then one Weekly Check-in, recorded in order: week {FIX_WEEKS} is the last unless The Fix is extended.</p>
      {compact && !editing ? (
        measure ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line-soft bg-white px-3 py-2.5" aria-label="The Measure of Success">
            <div className="min-w-0">
              <p className="font-medium text-ink">{measure.name}</p>
              {measure.definition && <p className="text-sm text-ink-600">{measure.definition}</p>}
              <p className="text-xs text-ink-muted">From {formatMeasure(measure.baselineValue, measure.unit)} to {formatMeasure(measure.targetValue, measure.unit)}</p>
            </div>
            {canManage && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setEditing(true)}>Edit</Button>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-white px-3 py-2.5 text-sm text-ink-muted">
            <span>Not set yet.</span>
            {canManage && <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} onClick={() => setEditing(true)}>Set the Measure of Success</Button>}
          </div>
        )
      ) : (
        <>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={LABEL} htmlFor="measure-name">Measure of Success</label><input id="measure-name" className={FIELD} disabled={!canManage} value={name} maxLength={160} placeholder="e.g. Cash in the bank at the end of the week" onChange={event => setName(event.target.value)} /></div>
          <div className="sm:col-span-2"><label className={LABEL} htmlFor="measure-definition">How it is measured (the client sees this)</label><textarea id="measure-definition" className={FIELD} rows={2} disabled={!canManage} value={definition} onChange={event => setDefinition(event.target.value)} /></div>
          <div><label className={LABEL} htmlFor="measure-unit">Unit</label><input id="measure-unit" className={FIELD} disabled={!canManage} value={unit} maxLength={32} placeholder="₦, %, days, orders…" onChange={event => setUnit(event.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={LABEL} htmlFor="measure-baseline">Where it starts</label><input id="measure-baseline" type="number" step="any" className={FIELD} disabled={!canManage} value={baseline} onChange={event => setBaseline(event.target.value)} /></div>
            <div><label className={LABEL} htmlFor="measure-target">Where it should get to</label><input id="measure-target" type="number" step="any" className={FIELD} disabled={!canManage} value={target} onChange={event => setTarget(event.target.value)} /></div>
          </div>
        </div>
        {canManage && <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending || !name.trim()} onClick={() => save.mutate({ engagementId, name, definition, unit, baselineValue: numberOrNull(baseline), targetValue: numberOrNull(target) })}>{measure ? "Save the Measure of Success" : "Set the Measure of Success"}</Button>}
          {compact && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setEditing(false)}>Cancel</Button>}
        </>
      )}
      {data.checkins.map(checkin => <CheckinRow key={checkin.weekNumber} checkin={checkin} engagementId={engagementId} canManage={canManage} unit={measure?.unit ?? null} />)}
      {adding ? (
        <CheckinCard weekNumber={nextWeek} engagementId={engagementId} canManage={canManage} unit={measure?.unit ?? null} onDone={() => setAdding(false)} />
      ) : canManage && nextWeek <= MAX_CHECKIN_WEEKS && (
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAdding(true)}>Record week {nextWeek}</Button>
      )}
    </DetailSection>
  );
}

/** One Weekly Check-in: in the workspace, the week, its reading and its day, opening into its form. */
function CheckinRow({ checkin, engagementId, canManage, unit }: { checkin: Checkin; engagementId: number; canManage: boolean; unit: string | null }) {
  const compact = React.useContext(Compact);
  const [open, setOpen] = useState(false);
  if (!compact) return <CheckinCard checkin={checkin} engagementId={engagementId} canManage={canManage} unit={unit} />;
  if (open) return <div className="space-y-2"><button type="button" className="text-sm font-medium text-brand" onClick={() => setOpen(false)}>Close week {checkin.weekNumber}</button><CheckinCard checkin={checkin} engagementId={engagementId} canManage={canManage} unit={unit} onDone={() => setOpen(false)} /></div>;
  return (
    <button type="button" className={`${ROW} hover:border-brand`} onClick={() => setOpen(true)} aria-label={`Open week ${checkin.weekNumber}`}>
      <span className="min-w-0"><span className="block font-medium text-ink">Week {checkin.weekNumber}</span><span className="block text-xs text-ink-muted">{checkin.heldOn ? `Held ${formatDate(checkin.heldOn)}` : "No date"}{checkin.nextStep ? ` · next: ${checkin.nextStep.length > 60 ? `${checkin.nextStep.slice(0, 60)}…` : checkin.nextStep}` : ""}</span></span>
      {checkin.measureReading !== null && <span className={PILL}>{formatMeasure(checkin.measureReading, unit)}</span>}
    </button>
  );
}

function CheckinCard({ checkin, weekNumber, engagementId, canManage, unit, onDone }: { checkin?: Checkin; weekNumber?: number; engagementId: number; canManage: boolean; unit: string | null; onDone?: () => void }) {
  const refresh = useRefresh(engagementId);
  const week = checkin?.weekNumber ?? weekNumber ?? 1;
  const [heldOn, setHeldOn] = useState(checkin?.heldOn ?? "");
  const [answers, setAnswers] = useState({ progress: checkin?.progress ?? "", blockers: checkin?.blockers ?? "", nextStep: checkin?.nextStep ?? "", questionsAsked: checkin?.questionsAsked ?? "" });
  const [reading, setReading] = useState(checkin?.measureReading === null || checkin?.measureReading === undefined ? "" : String(checkin.measureReading));
  const [hours, setHours] = useState({ lead: checkin?.hoursLead?.toString() ?? "", analyst: checkin?.hoursAnalyst?.toString() ?? "", partner: checkin?.hoursPartner?.toString() ?? "" });
  const [aiUsed, setAiUsed] = useState(checkin?.aiUsed ?? false);
  const save = trpc.engagement.staff.saveCheckin.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success(`Week ${week} recorded.`); onDone?.(); } });
  const id = `week-${week}`;
  const field = (key: keyof typeof answers) => (event: { target: { value: string } }) => setAnswers(current => ({ ...current, [key]: event.target.value }));
  return (
    <div className="space-y-2 border border-line bg-paper-raised p-3" aria-label={`Week ${week}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm font-semibold">Week {week}{checkin?.measureReading !== null && checkin?.measureReading !== undefined ? <span className="ml-2 font-normal text-ink-muted">· {formatMeasure(checkin.measureReading, unit)}</span> : null}</p>
        <div><label className={LABEL} htmlFor={`${id}-date`}>Held on</label><input id={`${id}-date`} type="date" className={FIELD} disabled={!canManage} value={heldOn} onChange={event => setHeldOn(event.target.value)} /></div>
      </div>
      {CHECKIN_QUESTIONS.map(question => question.key === "measureReading" ? (
        <div key={question.key}><label className={LABEL} htmlFor={`${id}-reading`}>{question.label}{unit ? ` (${unit})` : ""}</label><input id={`${id}-reading`} type="number" step="any" className={FIELD} disabled={!canManage} value={reading} onChange={event => setReading(event.target.value)} /></div>
      ) : (
        <div key={question.key}><label className={LABEL} htmlFor={`${id}-${question.key}`}>{question.label}</label><textarea id={`${id}-${question.key}`} className={FIELD} rows={2} disabled={!canManage} value={answers[question.key]} onChange={field(question.key)} /></div>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <div><label className={LABEL} htmlFor={`${id}-hours-lead`}>Lead hours</label><input id={`${id}-hours-lead`} type="number" step="0.25" min={0} className={FIELD} disabled={!canManage} value={hours.lead} onChange={event => setHours(current => ({ ...current, lead: event.target.value }))} /></div>
        <div><label className={LABEL} htmlFor={`${id}-hours-analyst`}>Analyst hours</label><input id={`${id}-hours-analyst`} type="number" step="0.25" min={0} className={FIELD} disabled={!canManage} value={hours.analyst} onChange={event => setHours(current => ({ ...current, analyst: event.target.value }))} /></div>
        <div><label className={LABEL} htmlFor={`${id}-hours-partner`}>Partner hours</label><input id={`${id}-hours-partner`} type="number" step="0.25" min={0} className={FIELD} disabled={!canManage} value={hours.partner} onChange={event => setHours(current => ({ ...current, partner: event.target.value }))} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canManage} checked={aiUsed} onChange={event => setAiUsed(event.target.checked)} />AI was used in preparing this Weekly Check-in</label>
      <p className="text-xs text-ink-muted">The client sees the reading and the next step. Hours, questions and what got in the way stay with the team.</p>
      {canManage && (
        <div className="flex gap-2">
          <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending} onClick={() => save.mutate({
            engagementId, weekNumber: week, heldOn: heldOn || null, progress: answers.progress, blockers: answers.blockers, nextStep: answers.nextStep, measureReading: numberOrNull(reading), questionsAsked: answers.questionsAsked,
            hoursLead: numberOrNull(hours.lead), hoursAnalyst: numberOrNull(hours.analyst), hoursPartner: numberOrNull(hours.partner), aiUsed,
          })}>{checkin ? "Save week" : "Record week"} {week}</Button>
          {onDone && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>}
        </div>
      )}
    </div>
  );
}

/** A fee line as the team edits it: `id` for a fee already on the engagement, so saving keeps it (and its pay link). */
type DraftFee = FeeLineDraft & { id?: number };

/**
 * The engagement's fees: filled in from the service's price or the type's monthly fee when it is opened, and changed
 * here. Saving keeps each fee (its id, its pay link); a fee that has been billed cannot be removed. Each fee shows what
 * is paid and what is left, and its payments; money that came another way is recorded by Finance or the Super Admin
 * (App flow 3.1). There is no proposal to send: a client agrees by paying, or on the call, under the Terms and
 * Conditions (ET, 6 November 2026). Finance counts a fee as owed once it is saved here.
 */
/**
 * Paid in arrears or in advance, from the kickoff (R74): for an engagement paid by the month. A Partner or the Super
 * Admin chooses it and sets the kickoff; the server moves every fee not yet paid and, in arrears, opens the room.
 */
function FeeTiming({ engagementId, timing, canChange, onChanged }: { engagementId: number; timing: { inArrears: boolean; kickoffOn: string | null }; canChange: boolean; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const [kickoff, setKickoff] = useState(timing.kickoffOn ?? "");
  const set = trpc.engagement.staff.setFeeTiming.useMutation({
    onSuccess: (result, input) => {
      onChanged();
      void utils.engagement.staff.list.invalidate();
      const fees = result.moved === 1 ? "1 fee" : `${result.moved} fees`;
      toast.success(input.inArrears ? `Paid in arrears from the kickoff on ${formatDate(input.kickoffOn)}: ${fees} moved${result.opened ? ", and the room is open" : ""}.` : `Paid in advance from the kickoff on ${formatDate(input.kickoffOn)}: ${fees} moved.`);
    },
    onError: error => toast.error(error.message),
  });
  const choose = (inArrears: boolean) => set.mutate({ engagementId, inArrears, kickoffOn: kickoff });
  return (
    <section aria-label="How the fees are paid" className="space-y-2 border border-line bg-white p-3 text-xs">
      <p className="text-ink">{timing.inArrears
        ? `Paid in arrears: each month's fee falls due 30, 60 and 90 days after the kickoff${timing.kickoffOn ? ` on ${formatDate(timing.kickoffOn)}` : ""}.`
        : `Paid in advance: each month's fee falls due on the month's first day, from the kickoff${timing.kickoffOn ? ` on ${formatDate(timing.kickoffOn)}` : ""}.`}</p>
      {canChange ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div><label className={LABEL} htmlFor={`kickoff-${engagementId}`}>Kickoff</label><input id={`kickoff-${engagementId}`} type="date" className={FIELD} value={kickoff} onChange={event => setKickoff(event.target.value)} /></div>
            {timing.inArrears ? (
              <>
                <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={!kickoff || kickoff === timing.kickoffOn || set.isPending} onClick={() => choose(true)}>Move the fees to this kickoff</Button>
                <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={!kickoff || set.isPending} onClick={() => choose(false)}>Pay in advance</Button>
              </>
            ) : <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={!kickoff || set.isPending} onClick={() => choose(true)}>Pay in arrears</Button>}
          </div>
          <p className="text-ink-muted">{timing.inArrears
            ? "A new kickoff moves every fee not yet paid. Pay in advance puts the dates back to day 0, 30 and 60."
            : "In arrears, each fee falls due 30, 60 and 90 days after the kickoff, and the client's room opens now. A fee already paid keeps its date."}</p>
        </>
      ) : <p className="text-ink-muted">Only a Partner or the Super Admin can change how this engagement is paid.</p>}
    </section>
  );
}

function FeesAdmin({ engagementId, owner }: { engagementId: number; owner?: { name: string; whatsapp: string | null } | null }) {
  const utils = trpc.useUtils();
  const query = trpc.engagement.staff.fees.useQuery({ engagementId });
  const [draft, setDraft] = useState<DraftFee[] | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const refresh = () => { void utils.engagement.staff.fees.invalidate({ engagementId }); void utils.engagement.finance.list.invalidate(); };
  const done = (message: string) => ({ onSuccess: () => { refresh(); toast.success(message); }, onError: (error: { message: string }) => toast.error(error.message) });
  const save = trpc.engagement.staff.saveFees.useMutation(done("Fees saved."));
  const [sentLink, setSentLink] = useState<{ feeLineId: number; url: string } | null>(null);
  const sendLink = trpc.engagement.staff.sendFeeLink.useMutation({ onSuccess: (result, input) => { setSentLink({ feeLineId: input.feeLineId, url: result.url }); refresh(); toast.success(result.deliveryStatus === "Failed" ? "The email did not go. Copy the link below and send it yourself." : "Payment link emailed to the client."); }, onError: error => toast.error(error.message) });
  const openNow = trpc.engagement.staff.openRoomNow.useMutation(done("The client's room is open."));
  const compact = React.useContext(Compact);
  const [editing, setEditing] = useState(false);
  if (query.error && query.data === undefined) return <DetailSection title="Fees"><Failed error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /></DetailSection>;
  const data = query.data;
  if (!data) return <DetailSection title="Fees"><Loading label="Loading the fees" rows={2} /></DetailSection>;
  const saved: DraftFee[] = data.feeLines.map(line => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn }));
  // Unsaved: the suggestion from the service, until the team saves a schedule.
  const current: DraftFee[] = draft ?? (data.suggested ?? saved);
  const unsaved = draft !== null || data.suggested !== null;
  const setLine = (index: number, patch: Partial<DraftFee>) => setDraft(current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  const storedOf = (line: DraftFee) => (line.id === undefined ? undefined : data.feeLines.find(stored => stored.id === line.id));
  const fees = current.filter(line => line.label.trim() && line.amount > 0);
  // In the workspace the saved fees read as rows with their actions; Change the fees opens the editor (R82).
  const reading = compact && !unsaved && !editing;
  const help = data.suggested ? "Filled in from the service's price. Check the amounts and dates, then save."
    : data.online ? `Send each fee's payment link; Paystack records the payment when the client pays. ${data.can.recordPayments ? "Record money that came another way with Record a payment." : "Money that came another way is recorded by Finance."}`
      : `Online payment is off. ${data.can.recordPayments ? "Record each payment when the money arrives." : "Finance records each payment when the money arrives."} Finance counts each fee as owed, and as late once its date passes.`;
  return (
    <DetailSection title="Fees">
      <p className="text-xs text-ink-muted">{help}</p>
      {data.opensOnPayment && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 border border-brand-line bg-brand-tint p-2 text-xs text-ink">
          <span>The client's room opens once the first fee is paid. Until then they see only the fee to pay.</span>
          {data.can.edit && data.can.approveUnpaidWork && <button type="button" className="font-semibold text-brand underline" disabled={openNow.isPending} onClick={() => openNow.mutate({ engagementId })}>Open the room now</button>}
          {data.can.edit && !data.can.approveUnpaidWork && <span className="text-ink-muted">Only a Partner can open it before payment, or move the first fee past the start date.</span>}
        </div>
      )}
      {data.timing?.offered && <FeeTiming engagementId={engagementId} timing={data.timing} canChange={data.can.edit && data.can.approveUnpaidWork} onChanged={() => { setDraft(null); refresh(); }} />}
      <ul aria-label="Fee lines" className="space-y-2">
        {current.map((line, index) => {
          const stored = storedOf(line);
          const status = !stored ? null
            : stored.left === 0 && stored.writtenOff ? `Written off ${formatNaira(stored.writtenOff.amount)}`
            : stored.left === 0 ? (stored.paidOnline ? "Paid online" : "Paid")
              : stored.paidAmount > 0 ? `${formatNaira(stored.paidAmount)} paid, ${formatNaira(stored.left)} left` : "Owed";
          const actions = stored && stored.left > 0 && !unsaved && (
            <>
              {data.online && data.can.sendLink && <button type="button" className="font-semibold text-brand underline" disabled={sendLink.isPending} onClick={() => sendLink.mutate({ feeLineId: stored.id })}>Send link</button>}
              {data.can.recordPayments && recording !== stored.id && <button type="button" className="font-semibold text-brand underline" onClick={() => setRecording(stored.id)}>Record a payment</button>}
            </>
          );
          if (reading && stored) return (
            <li key={stored.id} className="space-y-2 rounded-xl border border-line-soft bg-white px-3 py-2.5" aria-label={stored.label}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0"><span className="block font-medium text-ink">{stored.label}</span><span className="block text-xs text-ink-muted">{formatNaira(stored.amount)}{stored.dueOn ? ` · due ${formatDate(stored.dueOn)}` : " · no date yet"}{stored.reference ? ` · ${stored.reference}` : ""}</span></span>
                {status && <span className={stored.left === 0 && !stored.writtenOff ? "rounded-full bg-health-clear-tint px-2 py-0.5 text-xs text-health-clear-strong" : PILL}>{status}</span>}
              </div>
              {actions && <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{actions}</div>}
              <FeePaymentList payments={stored.payments} canRecord={data.can.recordPayments} onChanged={refresh} />
              <WriteOffControls fee={stored} canWriteOff={data.can.writeOff} onChanged={refresh} />
              {recording === stored.id && <RecordPaymentForm feeLineId={stored.id} label={stored.label} left={stored.left} onDone={recorded => { setRecording(null); if (recorded) refresh(); }} />}
            </li>
          );
          return (
            <li key={line.id ?? `new-${index}`} className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_7rem_8.5rem_10rem] items-center gap-1">
                <input aria-label={`Fee ${index + 1}`} title={[stored?.reference, stored?.invoice].filter(Boolean).join(" · ")} className={FIELD} disabled={!data.can.edit} value={line.label} onChange={event => setLine(index, { label: event.target.value })} />
                <input aria-label={`Amount ${index + 1}`} type="number" min={1} className={FIELD} disabled={!data.can.edit} value={line.amount || ""} onChange={event => setLine(index, { amount: Math.round(Number(event.target.value) || 0) })} />
                <input aria-label={`Due ${index + 1}`} type="date" className={FIELD} disabled={!data.can.edit} value={line.dueOn ?? ""} onChange={event => setLine(index, { dueOn: event.target.value || null })} />
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  {status && <span className={stored?.left === 0 && !stored.writtenOff ? "text-health-clear-strong" : undefined}>{status}</span>}
                  {stored && stored.left > 0 && !unsaved && data.online && data.can.sendLink && <button type="button" className="font-semibold text-brand underline" disabled={sendLink.isPending} onClick={() => sendLink.mutate({ feeLineId: stored.id })}>Send link</button>}
                  {stored && stored.left > 0 && !unsaved && data.can.recordPayments && recording !== stored.id && <button type="button" className="font-semibold text-brand underline" onClick={() => setRecording(stored.id)}>Record a payment</button>}
                  {data.can.edit && !stored?.billed && <button type="button" className="text-danger underline" aria-label={`Remove fee ${index + 1}`} onClick={() => setDraft(current.filter((_, at) => at !== index))}>Remove</button>}
                </span>
              </div>
              {stored && <FeePaymentList payments={stored.payments} canRecord={data.can.recordPayments} onChanged={refresh} />}
              {stored && !unsaved && <WriteOffControls fee={stored} canWriteOff={data.can.writeOff} onChanged={refresh} />}
              {stored && recording === stored.id && <RecordPaymentForm feeLineId={stored.id} label={stored.label} left={stored.left} onDone={recorded => { setRecording(null); if (recorded) refresh(); }} />}
            </li>
          );
        })}
      </ul>
      {sentLink && (
        <div className="space-y-1 border border-line bg-paper-raised p-2 text-xs">
          <p className="font-medium text-ink">Payment link for {data.feeLines.find(line => line.id === sentLink.feeLineId)?.reference}</p>
          <p className="break-all font-mono">{sentLink.url}</p>
          <p className="text-ink-muted">Emailed to the client. Shown here in case the email does not arrive.</p>
          {(() => {
            const line = data.feeLines.find(item => item.id === sentLink.feeLineId);
            return <WhatsAppShare number={owner?.whatsapp} message={`Hello ${firstNameOf(owner?.name ?? "")}, here is the payment link for ${line?.label ?? "your fee"}${line ? ` (${formatNaira(line.left || line.amount)})` : ""}: ${sentLink.url}`} />;
          })()}
        </div>
      )}
      {data.can.edit && reading && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setEditing(true)}>Change the fees</Button>}
      {data.can.edit && !reading && <button type="button" className="text-xs font-semibold text-brand underline" onClick={() => setDraft([...current, { label: "", amount: 0, dueOn: null }])}>Add a fee</button>}
      {compact && editing && !unsaved && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setEditing(false)}>Done</Button>}
      <p className="text-sm font-semibold">Total {formatNaira(feeTotal(unsaved ? fees : data.feeLines))}</p>
      {data.can.edit && unsaved && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending} onClick={() => save.mutate({ engagementId, feeLines: fees }, { onSuccess: () => { setDraft(null); setEditing(false); } })}>Save the fees</Button>
          {draft !== null && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => { setDraft(null); setEditing(false); }}>Cancel</Button>}
        </div>
      )}
    </DetailSection>
  );
}

/**
 * Load a whole Data Request in one step: a template (the Small business baseline, the Business Review's list) or rows
 * pasted from a client's own Excel sheet. A preview shows what will be added, by section; items already on the
 * engagement are skipped, and dates follow the priority when the sheet gives none.
 */
function LoadDataRequest({ engagementId, onDone }: { engagementId: number; onDone: () => void }) {
  const refresh = useRefresh(engagementId);
  const [source, setSource] = useState<string>(DATA_REQUEST_TEMPLATES[0]!.id);
  const [pasted, setPasted] = useState("");
  const load = trpc.engagement.staff.loadDataRequest.useMutation({
    onSuccess: result => { refresh.onSuccess(); toast.success(`${result.added} ${result.added === 1 ? "item" : "items"} added to the Data Request${result.skipped ? `; ${result.skipped} already there` : ""}.`); onDone(); },
    onError: error => toast.error(error.message),
  });
  const items = source === "paste"
    ? parsePastedDataRequest(pasted)
    : (templateById(source)?.items ?? []).map(item => ({ ...item, dueOn: null }));
  const sections = Array.from(new Set(items.map(item => item.section ?? "")));
  return (
    <section aria-label="Load a Data Request" className="space-y-2 border border-brand-line bg-brand-tint p-3">
      <div className="space-y-1">
        <label className={LABEL} htmlFor="data-request-source">Load from</label>
        <select id="data-request-source" className={FIELD} value={source} onChange={event => setSource(event.target.value)}>
          {DATA_REQUEST_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name} ({template.items.length} items)</option>)}
          <option value="paste">Paste from Excel</option>
        </select>
        <p className="text-xs text-ink-muted">{source === "paste" ? "Copy the rows of the client's Data Request sheet (with its header row if you can) and paste them here. Section rows are kept." : templateById(source)?.description}</p>
      </div>
      {source === "paste" && <textarea aria-label="Rows pasted from Excel" rows={6} className={`${FIELD} font-mono text-xs`} value={pasted} onChange={event => setPasted(event.target.value)} placeholder={"ID\tItem requested\tDetail\tWhat it informs\tFormat\tPriority\tDate required"} />}
      {items.length > 0 && (
        <div aria-label="Preview" className="max-h-64 space-y-2 overflow-y-auto border border-line bg-white p-2 text-sm">
          {sections.map(section => (
            <div key={section || "none"}>
              {section && <p className="text-xs font-semibold text-ink-muted">{section}</p>}
              <ul className="space-y-0.5">
                {items.filter(item => (item.section ?? "") === section).map((item, index) => (
                  <li key={`${item.ref ?? ""}-${index}`} className="flex justify-between gap-2"><span>{item.ref && <span className="mr-1 font-mono text-xs text-ink-muted">{item.ref}</span>}{item.title}</span>{item.priority && <span className="shrink-0 text-xs text-ink-muted">{ENGAGEMENT_TASK_PRIORITY_LABELS[item.priority]}</span>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={!items.length || load.isPending} onClick={() => load.mutate({ engagementId, items })}>{items.length ? `Add ${items.length} ${items.length === 1 ? "item" : "items"}` : "Nothing to add yet"}</Button>
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>
      </div>
    </section>
  );
}
