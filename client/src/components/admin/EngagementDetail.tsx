import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { PROBLEM_AREAS } from "@shared/businessSupport";
import {
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
  ENGAGEMENT_TEAM_ROLE_LABELS,
  ENGAGEMENT_TEAM_ROLES,
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
import React, { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { DetailField, DetailSection } from "./AdminPrimitives";
import { combineDateAndTime, formatDate, formatDateTime, toDateInput, toTimeInput, whatsappLink } from "./format";

type Detail = inferRouterOutputs<AppRouter>["engagement"]["staff"]["detail"];
type Session = Detail["sessions"][number];
type Task = Detail["tasks"][number];
type Deliverable = Detail["deliverables"][number];
type StaffFile = Task["files"][number];
type Checkin = Detail["checkins"][number];
type UploadTarget = { kind: "task" | "deliverable"; id: number };

const FIELD = "w-full border border-line bg-white px-2 py-1.5 text-sm text-ink";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-ink-muted";
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
  const detail = trpc.engagement.staff.detail.useQuery({ engagementId }, { retry: false });
  if (detail.error) return <p role="alert" className="text-sm text-danger">{detail.error.message}</p>;
  if (!detail.data) return <p className="text-sm text-ink-muted">Loading…</p>;
  const data = detail.data;
  return (
    <>
      <DetailSection title="The client">
        <DetailField label="Owner">{data.owner?.name ?? "-"}</DetailField>
        <DetailField label="Email">{data.owner?.email ?? "-"}</DetailField>
        <DetailField label="WhatsApp">{data.owner?.whatsapp ? <a className="text-brand underline" href={whatsappLink(data.owner.whatsapp) ?? undefined} target="_blank" rel="noreferrer">{data.owner.whatsapp}</a> : "-"}</DetailField>
        <DetailField label="Client account">{data.hasAccount ? `Yes${data.clientPeople.length > 1 ? `, ${data.clientPeople.length} people` : ""}` : "Not yet: the invitation is out"}</DetailField>
      </DetailSection>
      <StageAndTeam data={data} engagementId={engagementId} />
      <Problem data={data} engagementId={engagementId} />
      <Sessions data={data} engagementId={engagementId} />
      <Tasks data={data} engagementId={engagementId} />
      <Deliverables data={data} engagementId={engagementId} />
      <TheFix data={data} engagementId={engagementId} />
    </>
  );
}

/** Files on a request or deliverable: open any; attach one (owner-only or the owner and their team) when storage is set up. */
function StaffFiles({ files, engagementId, target, canUpload }: { files: StaffFile[]; engagementId: number; target: UploadTarget; canUpload: boolean }) {
  const refresh = useRefresh(engagementId);
  const link = trpc.engagement.staff.fileLink.useMutation({ onError: error => toast.error(error.message) });
  const request = trpc.engagement.staff.requestUpload.useMutation();
  const confirm = trpc.engagement.staff.confirmUpload.useMutation();
  const [audience, setAudience] = useState<Exclude<EngagementAudience, "team">>("owner");
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
      toast.success("File attached.");
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
          <select aria-label="Who sees the file" className={`${FIELD} w-auto`} value={audience} onChange={event => setAudience(event.target.value as typeof audience)}>
            <option value="owner">{ENGAGEMENT_AUDIENCE_LABELS.owner}</option>
            <option value="business">{ENGAGEMENT_AUDIENCE_LABELS.business}</option>
          </select>
        </div>
      )}
    </div>
  );
}

function StageAndTeam({ data, engagementId }: { data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const setStage = trpc.engagement.staff.setStage.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Stage saved."); } });
  const assign = trpc.engagement.staff.assign.useMutation(refresh);
  const remove = trpc.engagement.staff.removeMember.useMutation(refresh);
  const staff = trpc.engagement.staff.assignableStaff.useQuery(undefined, { enabled: data.can.assign, retry: false });
  const [person, setPerson] = useState("");
  const [role, setRole] = useState<EngagementTeamRole>("analyst");
  return (
    <DetailSection title="Stage and team">
      <div className="space-y-1">
        <label className={LABEL} htmlFor="engagement-stage">Stage</label>
        <select id="engagement-stage" className={FIELD} disabled={!data.can.manage || setStage.isPending} value={data.engagement.stage} onChange={event => setStage.mutate({ engagementId, stage: event.target.value as EngagementStage })}>
          {ENGAGEMENT_STAGES.map(stage => <option key={stage} value={stage}>{ENGAGEMENT_STAGE_LABELS[stage]}</option>)}
        </select>
      </div>
      <ul aria-label="Team" className="space-y-1 text-sm">
        {data.team.map(member => (
          <li key={member.userId} className="flex items-center justify-between gap-2 border-b border-line-soft py-1">
            <span>{member.name} <span className="text-ink-muted">· {member.roleLabel}</span></span>
            {data.can.assign && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={remove.isPending} onClick={() => remove.mutate({ engagementId, userId: member.userId })}>Remove</Button>}
          </li>
        ))}
        {data.team.length === 0 && <li className="text-danger">No one is on this engagement yet.</li>}
      </ul>
      {data.can.assign && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <label className={LABEL} htmlFor="team-person">Add to the team</label>
            <select id="team-person" className={FIELD} value={person} onChange={event => setPerson(event.target.value)}>
              <option value="">Choose a person</option>
              {staff.data?.map(item => <option key={item.userId} value={item.userId}>{item.name || item.email}</option>)}
            </select>
          </div>
          <select aria-label="Role on the engagement" className={`${FIELD} w-auto`} value={role} onChange={event => setRole(event.target.value as EngagementTeamRole)}>
            {ENGAGEMENT_TEAM_ROLES.map(item => <option key={item} value={item}>{ENGAGEMENT_TEAM_ROLE_LABELS[item]}</option>)}
          </select>
          <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={!person || assign.isPending} onClick={() => { assign.mutate({ engagementId, userId: Number(person), role }); setPerson(""); }}>Add</Button>
        </div>
      )}
    </DetailSection>
  );
}

function Problem({ data, engagementId }: { data: Detail; engagementId: number }) {
  const refresh = useRefresh(engagementId);
  const save = trpc.engagement.staff.saveProblem.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Problem saved."); } });
  const [area, setArea] = useState(data.engagement.problemArea === null ? "" : String(data.engagement.problemArea));
  const [sub, setSub] = useState(data.engagement.subProblem ?? "");
  const [statement, setStatement] = useState(data.engagement.problemStatement ?? "");
  return (
    <DetailSection title="The one problem">
      <p className="text-xs text-ink-muted">Agreed at the end of the Current State Assessment. One problem per fix.</p>
      <label className={LABEL} htmlFor="problem-area">Problem area</label>
      <select id="problem-area" className={FIELD} disabled={!data.can.manage} value={area} onChange={event => setArea(event.target.value)}>
        <option value="">Not chosen yet</option>
        {PROBLEM_AREAS.map(item => <option key={item.number} value={item.number}>{item.number}. {item.name}</option>)}
      </select>
      <label className={LABEL} htmlFor="sub-problem">Sub-problem</label>
      <input id="sub-problem" className={FIELD} disabled={!data.can.manage} value={sub} maxLength={255} onChange={event => setSub(event.target.value)} />
      <label className={LABEL} htmlFor="problem-statement">Problem statement, in the owner's words</label>
      <textarea id="problem-statement" className={FIELD} rows={3} disabled={!data.can.manage} value={statement} onChange={event => setStatement(event.target.value)} />
      {data.can.manage && <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending} onClick={() => save.mutate({ engagementId, problemArea: area === "" ? null : Number(area), subProblem: sub, problemStatement: statement })}>Save the problem</Button>}
    </DetailSection>
  );
}

function Sessions({ data, engagementId }: { data: Detail; engagementId: number }) {
  const [adding, setAdding] = useState(false);
  return (
    <DetailSection title="Calls">
      <p className="text-xs text-ink-muted">Book on Calendly or by hand, then record the time here so the client sees it. Notes reach the client only when you share them.</p>
      {data.sessions.map(session => <SessionCard key={session.id} session={session} engagementId={engagementId} canManage={data.can.manage} />)}
      {adding ? <SessionCard engagementId={engagementId} canManage={data.can.manage} onDone={() => setAdding(false)} /> : data.can.manage && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAdding(true)}>Add a call</Button>}
    </DetailSection>
  );
}

function SessionCard({ session, engagementId, canManage, onDone }: { session?: Session; engagementId: number; canManage: boolean; onDone?: () => void }) {
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
  const save = trpc.engagement.staff.saveSession.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Call saved."); onDone?.(); } });
  const saveNotes = trpc.engagement.staff.saveNotes.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Notes saved. The client cannot see them until you share."); } });
  const share = trpc.engagement.staff.shareNotes.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Notes shared."); } });
  const id = session?.id ?? "new";
  const notesChanged = (session?.clientNotes ?? "") !== clientNotes || (session?.internalNotes ?? "") !== internalNotes;
  return (
    <div className="space-y-2 border border-line bg-paper-raised p-3" aria-label={session?.title ?? "New call"}>
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
          })}>Save the call</Button>
          {onDone && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>}
        </div>
      )}
      {session && (
        <div className="space-y-2 border-t border-line-soft pt-2">
          <label className={LABEL} htmlFor={`client-notes-${id}`}>Notes for the client</label>
          <textarea id={`client-notes-${id}`} className={FIELD} rows={4} disabled={!canManage} value={clientNotes} onChange={event => setClientNotes(event.target.value)} />
          <label className={LABEL} htmlFor={`internal-notes-${id}`}>Internal notes (never shown to the client)</label>
          <textarea id={`internal-notes-${id}`} className={FIELD} rows={3} disabled={!canManage} value={internalNotes} onChange={event => setInternalNotes(event.target.value)} />
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

function Tasks({ data, engagementId }: { data: Detail; engagementId: number }) {
  const [adding, setAdding] = useState(false);
  return (
    <DetailSection title="Requests and actions">
      <p className="text-xs text-ink-muted">What we need from the client, and who does what by when. The client sees their side and ours; contributors see only what is given to them.</p>
      {data.tasks.map(task => <TaskCard key={task.id} task={task} data={data} engagementId={engagementId} />)}
      {adding ? <TaskCard data={data} engagementId={engagementId} onDone={() => setAdding(false)} /> : data.can.manage && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAdding(true)}>Add a request or action</Button>}
    </DetailSection>
  );
}

function TaskCard({ task, data, engagementId, onDone }: { task?: Task; data: Detail; engagementId: number; onDone?: () => void }) {
  const refresh = useRefresh(engagementId);
  const [kind, setKind] = useState<EngagementTaskKind>(task?.kind ?? "action");
  const [side, setSide] = useState<EngagementTaskSide>(task?.side ?? "client");
  const [title, setTitle] = useState(task?.title ?? "");
  const [detail, setDetail] = useState(task?.detail ?? "");
  const [assignee, setAssignee] = useState(task?.assigneeUserId ? String(task.assigneeUserId) : "");
  const [dueOn, setDueOn] = useState(task?.dueOn ?? "");
  const [status, setStatus] = useState<EngagementTaskStatus>(task?.status ?? "open");
  const [note, setNote] = useState(task?.statusNote ?? "");
  const save = trpc.engagement.staff.saveTask.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Saved."); onDone?.(); } });
  const people = side === "client" ? data.clientPeople.map(person => ({ userId: person.userId, name: person.name })) : data.team.map(member => ({ userId: member.userId, name: member.name ?? "" }));
  const id = task?.id ?? "new";
  const canManage = data.can.manage;
  return (
    <div className="space-y-2 border border-line bg-paper-raised p-3" aria-label={task?.title ?? "New request or action"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className={LABEL} htmlFor={`task-kind-${id}`}>Kind</label><select id={`task-kind-${id}`} className={FIELD} disabled={!canManage} value={kind} onChange={event => setKind(event.target.value as EngagementTaskKind)}>{(["data_request", "action"] as const).map(item => <option key={item} value={item}>{KIND_LABELS[item]}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`task-side-${id}`}>Whose job</label><select id={`task-side-${id}`} className={FIELD} disabled={!canManage} value={side} onChange={event => { setSide(event.target.value as EngagementTaskSide); setAssignee(""); }}>{(["client", "ipf"] as const).map(item => <option key={item} value={item}>{SIDE_LABELS[item]}</option>)}</select></div>
      </div>
      <label className={LABEL} htmlFor={`task-title-${id}`}>What</label>
      <input id={`task-title-${id}`} className={FIELD} disabled={!canManage} value={title} onChange={event => setTitle(event.target.value)} />
      <label className={LABEL} htmlFor={`task-detail-${id}`}>Detail</label>
      <textarea id={`task-detail-${id}`} className={FIELD} rows={2} disabled={!canManage} value={detail} onChange={event => setDetail(event.target.value)} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className={LABEL} htmlFor={`task-person-${id}`}>Person</label><select id={`task-person-${id}`} className={FIELD} disabled={!canManage} value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">{side === "client" ? "The business" : "The team"}</option>{people.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select></div>
        <div><label className={LABEL} htmlFor={`task-due-${id}`}>Due</label><input id={`task-due-${id}`} type="date" className={FIELD} disabled={!canManage} value={dueOn} onChange={event => setDueOn(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor={`task-status-${id}`}>Status</label><select id={`task-status-${id}`} className={FIELD} disabled={!canManage} value={status} onChange={event => setStatus(event.target.value as EngagementTaskStatus)}>{ENGAGEMENT_TASK_STATUSES.map(item => <option key={item} value={item}>{ENGAGEMENT_TASK_STATUS_LABELS[item]}</option>)}</select></div>
      </div>
      <label className={LABEL} htmlFor={`task-note-${id}`}>Note (the client sees it)</label>
      <input id={`task-note-${id}`} className={FIELD} disabled={!canManage} placeholder={status === "needs_more" ? "Say what else you need" : ""} value={note} onChange={event => setNote(event.target.value)} />
      {task && <StaffFiles files={task.files} engagementId={engagementId} target={{ kind: "task", id: task.id }} canUpload={data.uploadsEnabled && canManage} />}
      {canManage && (
        <div className="flex gap-2">
          <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending || !title.trim()} onClick={() => save.mutate({
            engagementId, taskId: task?.id, kind, side, title, detail, assigneeUserId: assignee ? Number(assignee) : null, dueOn: dueOn || null, status, statusNote: note, sessionId: task?.sessionId ?? null,
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
      <p className="text-xs text-ink-muted">Findings, the problem statement, the prescription, tools and the plan. The desk lead approves every prescription and plan before the client sees it. Editing a shared item takes it back to draft.</p>
      {data.deliverables.map(item => <DeliverableCard key={item.id} item={item} data={data} engagementId={engagementId} />)}
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
  const share = trpc.engagement.staff.shareDeliverable.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Shared with the client."); } });
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
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setSummary(FINDINGS_OUTLINE)}>Start from the standard findings outline</Button>
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
      {item && <StaffFiles files={item.files} engagementId={engagementId} target={{ kind: "deliverable", id: item.id }} canUpload={data.uploadsEnabled && data.can.manage} />}
      {item && needsApproval && !approved && <p className="text-xs text-ink-muted">The desk lead approves this before it can be shared.</p>}
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
  const save = trpc.engagement.staff.saveMeasure.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("The number is saved. The client can see it."); } });
  const nextWeek = (data.checkins.at(-1)?.weekNumber ?? 0) + 1;
  const canManage = data.can.manage;
  return (
    <DetailSection title="The fix: the one number and the weekly check-in">
      <p className="text-xs text-ink-muted">One problem, one number. Set the number in fix week 1 with where it starts and where it should get to; the client sees it. Then one check-in a week, recorded in order: week {FIX_WEEKS} is the last unless the fix is extended.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={LABEL} htmlFor="measure-name">The number we watch</label><input id="measure-name" className={FIELD} disabled={!canManage} value={name} maxLength={160} placeholder="e.g. Cash in the bank at the end of the week" onChange={event => setName(event.target.value)} /></div>
        <div className="sm:col-span-2"><label className={LABEL} htmlFor="measure-definition">How it is measured (the client sees this)</label><textarea id="measure-definition" className={FIELD} rows={2} disabled={!canManage} value={definition} onChange={event => setDefinition(event.target.value)} /></div>
        <div><label className={LABEL} htmlFor="measure-unit">Unit</label><input id="measure-unit" className={FIELD} disabled={!canManage} value={unit} maxLength={32} placeholder="₦, %, days, orders…" onChange={event => setUnit(event.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={LABEL} htmlFor="measure-baseline">Where it starts</label><input id="measure-baseline" type="number" step="any" className={FIELD} disabled={!canManage} value={baseline} onChange={event => setBaseline(event.target.value)} /></div>
          <div><label className={LABEL} htmlFor="measure-target">Where it should get to</label><input id="measure-target" type="number" step="any" className={FIELD} disabled={!canManage} value={target} onChange={event => setTarget(event.target.value)} /></div>
        </div>
      </div>
      {canManage && <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={save.isPending || !name.trim()} onClick={() => save.mutate({ engagementId, name, definition, unit, baselineValue: numberOrNull(baseline), targetValue: numberOrNull(target) })}>{measure ? "Save the number" : "Set the number"}</Button>}
      {data.checkins.map(checkin => <CheckinCard key={checkin.weekNumber} checkin={checkin} engagementId={engagementId} canManage={canManage} unit={measure?.unit ?? null} />)}
      {adding ? (
        <CheckinCard weekNumber={nextWeek} engagementId={engagementId} canManage={canManage} unit={measure?.unit ?? null} onDone={() => setAdding(false)} />
      ) : canManage && nextWeek <= MAX_CHECKIN_WEEKS && (
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setAdding(true)}>Record week {nextWeek}</Button>
      )}
    </DetailSection>
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
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canManage} checked={aiUsed} onChange={event => setAiUsed(event.target.checked)} />AI was used in preparing this check-in</label>
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
