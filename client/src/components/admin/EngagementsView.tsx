import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import React, { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { ClickableRow, CopyButton, RecordDrawer, TD, TH } from "./AdminPrimitives";
import { ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_TYPES, servicesFor, type EngagementType } from "@shared/engagementTypes";
import EngagementDetail from "./EngagementDetail";
import { formatDate, formatDateTime } from "./format";

type Row = inferRouterOutputs<AppRouter>["engagement"]["staff"]["list"]["items"][number];
type StorageStatus = inferRouterOutputs<AppRouter>["engagement"]["staff"]["storageStatus"];

/**
 * Every engagement this person may see: the desk lead and the Super Admin see all; analysts, partners and specialists
 * see the ones they are on. The server decides the list; this only shows it.
 */
export default function EngagementsView() {
  const list = trpc.engagement.staff.list.useQuery(undefined, { retry: false });
  const awaiting = trpc.engagement.staff.awaitingStart.useQuery(undefined, { retry: false });
  const storage = trpc.engagement.staff.storageStatus.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const start = trpc.engagement.staff.start.useMutation({
    onSuccess: result => {
      void utils.engagement.staff.list.invalidate();
      void utils.engagement.staff.awaitingStart.invalidate();
      toast.success("Engagement started.");
      setOpenId(result.engagementId);
    },
    onError: error => toast.error(error.message),
  });
  const [openId, setOpenId] = useState<number | null>(null);
  const [prefill, setPrefill] = useState<EngagementPrefill | null>(null);
  const open = list.data?.items.find(item => item.id === openId) ?? null;

  // Every type of engagement, not only the Business Review. The desk sees every engagement and how each starts; anyone
  // else sees the projects they are on.
  const seesAll = Boolean(list.data && "seesAll" in list.data && list.data.seesAll);
  const canOpen = Boolean(list.data && "canStart" in list.data && list.data.canStart);
  if (list.error) return <p role="alert" className="p-6 text-sm text-danger">{list.error.message}</p>;
  if (list.data && !list.data.setUp) {
    return <p role="note" className="m-6 border border-line bg-white p-4 text-sm text-ink-muted">The engagement room is not set up in the database yet. It starts working once migration 0008 is applied.</p>;
  }
  return (
    <div className="space-y-4 p-6">
      <p className="text-sm text-ink-muted">{seesAll
        ? `Every engagement, of every type. A Business Review starts when it is paid${canOpen ? "; open any other, such as Digital marketing, with New engagement" : ""}. Open one to name the team, book the Sessions, send the Data Requests and share the Deliverables.`
        : "The projects you are on, of every type. Open one to see its Work Plan, Sessions, Data Requests and Deliverables."}</p>
      {storage.data && <StorageLine status={storage.data} onCheck={() => void storage.refetch()} />}
      {storage.error && <p role="status" aria-label="File uploads" className="border border-health-watch bg-health-watch-tint p-3 text-sm text-health-watch">Could not check file storage: {storage.error.message}</p>}
      {awaiting.data && awaiting.data.length > 0 && (
        <section aria-labelledby="awaiting-start" className="space-y-2 border border-danger-line bg-danger-tint p-4">
          <h2 id="awaiting-start" className="text-sm font-semibold text-danger">Paid, but no engagement yet</h2>
          <p className="text-xs text-ink">These Business Reviews were paid before the room was set up, or the start failed. Start each one: it gets the standard Work Plan and both Sessions, and joins the client's account if they have one.</p>
          <ul className="space-y-1">
            {awaiting.data.map(item => (
              <li key={item.businessCheckId} className="flex flex-wrap items-center justify-between gap-2 border-t border-danger-line pt-2 text-sm">
                <span><span className="font-medium">{item.businessName || item.fullName}</span> <span className="text-ink-muted">· {item.fullName} · paid {formatDate(item.confirmedAt)}</span></span>
                <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={start.isPending} onClick={() => start.mutate({ businessCheckId: item.businessCheckId })}>Start engagement</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {canOpen && <ServiceRequests onOpen={setPrefill} />}
      {canOpen && <NewEngagement key={prefill?.requestId ?? "new"} onCreated={setOpenId} prefill={prefill} onDone={() => setPrefill(null)} />}
      <MyProjects items={list.data?.items ?? []} onOpen={setOpenId} />
      {list.isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : (
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className={TH}>Business</th><th className={TH}>Stage</th><th className={TH}>Team</th><th className={TH}>Data Requests</th><th className={TH}>Next Session</th></tr></thead>
            <tbody>
              {list.data?.items.map(row => (
                <ClickableRow key={row.id} onOpen={() => setOpenId(row.id)} selected={row.id === openId}>
                  <td className={TD}><span className="block font-medium">{row.businessName}</span><span className="block text-xs text-ink-muted">{row.ownerName}{row.hasAccount ? "" : " · no account yet"}</span></td>
                  <td className={TD}><span className="block">{row.stageLabel}</span><span className="block text-xs text-ink-muted">{row.typeLabel}</span></td>
                  <td className={TD}>{row.team.length ? row.team.map(member => `${member.name} (${member.roleLabel})`).join(", ") : <span className="text-danger">No one yet</span>}</td>
                  <td className={TD}>{waitingOn(row)}</td>
                  <td className={TD}>{row.nextSession ? <><span className="block">{row.nextSession.title}</span><span className="block text-xs text-ink-muted">{formatDateTime(row.nextSession.scheduledFor)}</span></> : row.unscheduledSessions ? <span className="text-danger">{row.unscheduledSessions} not booked</span> : "-"}</td>
                </ClickableRow>
              ))}
              {list.data?.items.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-sm text-ink-muted">{seesAll
                ? `No engagements yet. A Business Review starts when its payment is confirmed${canOpen ? "; open any other type with New engagement" : ""}.`
                : "You are not on any project yet. When a lead adds you to one, it appears here and you get an email."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <RecordDrawer open={open !== null} onOpenChange={value => !value && setOpenId(null)} title={open?.businessName ?? ""} description={open ? `${open.stageLabel} · ${open.ownerName}` : ""}>
        {open && <EngagementDetail engagementId={open.id} />}
      </RecordDrawer>
    </div>
  );
}

function waitingOn(row: Row) {
  if (!row.openClientRequests) return "Nothing outstanding";
  return (
    <>
      <span className="block">{row.openClientRequests} outstanding</span>
      {row.overdueClientRequests ? <span className="block text-xs text-danger">{row.overdueClientRequests} overdue</span> : null}
    </>
  );
}

const SETTING_HELP: Record<StorageStatus["missing"][number], string> = {
  SUPABASE_URL: "the project URL from Supabase → Project Settings → API",
  SUPABASE_SERVICE_ROLE_KEY: "the service_role key from the same page",
  SUPABASE_STORAGE_BUCKET: "the bucket's name",
};

/** Whether clients can upload files, and if not the one thing to do next. Checked live, so it is right after a redeploy. */
function StorageLine({ status, onCheck }: { status: StorageStatus; onCheck: () => void }) {
  const on = status.configured && status.bucketFound === true && status.bucketPublic === false;
  const tone = on ? "border-health-clear bg-health-clear-tint text-health-clear" : status.bucketPublic ? "border-danger-line bg-danger-tint text-danger" : "border-health-watch bg-health-watch-tint text-health-watch";
  return (
    <section role="status" aria-label="File uploads" className={`flex flex-wrap items-start justify-between gap-3 border p-3 text-sm ${tone}`}>
      <div className="space-y-1">
        <p className="font-semibold">{on ? "File uploads: on." : status.bucketPublic ? "File uploads: on, but the bucket is public." : "File uploads: off."}</p>
        {on && <p className="text-xs text-ink">Clients can upload against each Data Request. The team can attach files to deliverables.</p>}
        {status.bucketPublic && <p className="text-xs text-ink">Anyone with a link could read client files. In Supabase → Storage, open {status.bucket} and switch "Public bucket" off.</p>}
        {status.missing.length > 0 && (
          <div className="text-xs text-ink">
            <p>Still to add in Vercel → Settings → Environment Variables, then redeploy:</p>
            <ul className="list-disc pl-5">{status.missing.map(name => <li key={name}><span className="font-mono">{name}</span>: {SETTING_HELP[name]}</li>)}</ul>
            <p>Until then the room asks clients to send files on WhatsApp or by email.</p>
          </div>
        )}
        {status.configured && status.bucketFound === false && <p className="text-xs text-ink">The settings are in, but there is no bucket named {status.bucket}. In Supabase → Storage, create a private bucket with that exact name.</p>}
        {status.problem && <p className="text-xs text-ink">{status.problem}</p>}
      </div>
      <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" onClick={onCheck}>Check again</Button>
    </section>
  );
}


/**
 * My projects: the engagements the signed-in person is on, with their role there and what needs them, ahead of the
 * full list. Opening one opens the same record as the table.
 */
function MyProjects({ items, onOpen }: { items: Row[]; onOpen: (id: number) => void }) {
  const mine = items.filter(item => item.myRole);
  if (!mine.length) return null;
  return (
    <section aria-labelledby="my-projects" className="space-y-2">
      <h2 id="my-projects" className="text-sm font-semibold text-ink">My projects <span className="font-normal text-ink-muted">({mine.length})</span></h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {mine.map(item => (
          <li key={item.id}>
            <button type="button" onClick={() => onOpen(item.id)} aria-label={`Open ${item.businessName}`} className="block w-full rounded-xl border border-line bg-white p-4 text-left transition-colors hover:border-brand">
              <span className="flex items-baseline justify-between gap-2"><span className="truncate font-medium text-ink">{item.businessName}</span><span className="shrink-0 text-xs text-ink-muted">{item.stageLabel}</span></span>
              <span className="mt-0.5 block text-xs text-brand">{item.myRole}</span>
              <span className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-muted">
                <span><span className="block text-lg font-semibold tabular-nums text-ink">{item.openClientRequests}</span>with the client</span>
                <span><span className={`block text-lg font-semibold tabular-nums ${item.overdueClientRequests ? "text-danger" : "text-ink"}`}>{item.overdueClientRequests}</span>overdue</span>
                <span><span className={`block text-lg font-semibold tabular-nums ${item.unsortedFiles ? "text-brand" : "text-ink"}`}>{item.unsortedFiles}</span>files to sort</span>
              </span>
              <span className="mt-3 block border-t border-line-soft pt-2 text-xs text-ink-muted">{item.nextSession ? `Next: ${item.nextSession.title}, ${formatDateTime(item.nextSession.scheduledFor)}` : item.unscheduledSessions ? `${item.unscheduledSessions} ${item.unscheduledSessions === 1 ? "Session" : "Sessions"} not booked` : "No Session planned"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * New engagement: for a client who did not come through the Business Health Check (Crown Studio, from JUMP). The type
 * decides the timeline and the starting content; the client's invitation link is shown once to send by hand.
 */
/** What a client's request fills in when the desk opens the engagement from it. */
export type EngagementPrefill = { requestId: number; businessId: number; type: EngagementType; service: string };

function NewEngagement({ onCreated, prefill = null, onDone }: { onCreated: (id: number) => void; prefill?: EngagementPrefill | null; onDone?: () => void }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(Boolean(prefill));
  const blank = { client: prefill ? "existing" : "new", businessId: prefill ? String(prefill.businessId) : "", type: (prefill?.type ?? "digital_marketing") as EngagementType, service: prefill?.service ?? "", businessName: "", contactName: "", contactEmail: "", startedOn: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState(blank);
  const [issued, setIssued] = useState<{ url: string | null; sent: boolean; engagementId: number; name: string } | null>(null);
  const clients = trpc.engagement.staff.clientBusinesses.useQuery(undefined, { enabled: open });
  const handle = trpc.engagement.staff.handleRequest.useMutation({ onSuccess: () => void utils.engagement.staff.serviceRequests.invalidate() });
  const create = trpc.engagement.staff.createDirect.useMutation({
    onSuccess: result => {
      void utils.engagement.staff.list.invalidate();
      // Opened from a client's request: the request is done.
      if (prefill) handle.mutate({ requestId: prefill.requestId, status: "done" });
      const name = form.client === "existing" ? clients.data?.find(item => String(item.id) === form.businessId)?.name ?? "The engagement" : form.businessName;
      setIssued({ url: result.invitationUrl, sent: result.deliveryStatus === "Sent", engagementId: result.engagementId, name });
      toast.success("Engagement opened.");
    },
    onError: error => toast.error(error.message),
  });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: event.target.value, ...(key === "type" ? { service: "" } : {}) });
  const field = "w-full border border-line bg-white px-2 py-1.5 text-sm";
  const label = "block text-xs font-semibold text-ink-muted";
  const services = servicesFor(form.type);
  const needsService = services.length > 0 && form.type !== "six_week_fix";
  const existing = form.client === "existing";
  const ready = Boolean(form.startedOn) && (!needsService || form.service) && (existing ? Boolean(form.businessId) : Boolean(form.businessName.trim() && form.contactName.trim() && form.contactEmail.trim()));
  const submit = () => create.mutate({
    type: form.type, startedOn: form.startedOn,
    ...(needsService ? { service: form.service } : {}),
    ...(existing ? { businessId: Number(form.businessId) } : { businessName: form.businessName, contactName: form.contactName, contactEmail: form.contactEmail }),
  });
  if (!open) return <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" onClick={() => setOpen(true)}>New engagement</Button>;
  return (
    <section aria-labelledby="new-engagement" className="space-y-3 border border-line bg-white p-4">
      <h2 id="new-engagement" className="text-sm font-semibold text-ink">New engagement</h2>
      <p className="text-xs text-ink-muted">For a new client, or another project for a client you already have (it joins their account; nobody is invited). The type, and the service for a Done for You, Assessment or Monthly Service, set the starting Work Plan, Data Request and Sessions; the team can change all of it after.</p>
      {issued ? (
        <div role="status" className="space-y-2 border border-brand-line bg-brand-tint p-3 text-sm">
          <p className="font-semibold">{issued.name} is open.</p>
          {issued.url ? (
            <>
              <p className="text-ink-muted">{issued.sent ? "The invitation was emailed. The link is shown once here as well." : "Email is not set up yet: copy this link and send it to the client yourself. It is shown once."}</p>
              <div className="flex items-center gap-2"><input readOnly aria-label="Client invitation link" className={`${field} text-xs`} value={issued.url} /><CopyButton value={issued.url} label="Copy the client invitation link" /></div>
            </>
          ) : <p className="text-ink-muted">The client already has an account; the project is in their room now.</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" onClick={() => onCreated(issued.engagementId)}>Open the engagement</Button>
            <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" onClick={() => { setOpen(false); setIssued(null); setForm(blank); onDone?.(); }}>Close</Button>
          </div>
        </div>
      ) : (
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); submit(); }}>
          <div><label className={label} htmlFor="new-client">Client</label><select id="new-client" className={field} value={form.client} onChange={set("client")}><option value="new">A new client</option><option value="existing">An existing client</option></select></div>
          <div><label className={label} htmlFor="new-start">Start date</label><input id="new-start" type="date" className={field} value={form.startedOn} onChange={set("startedOn")} /></div>
          <div><label className={label} htmlFor="new-type">Type</label><select id="new-type" className={field} value={form.type} onChange={set("type")}>{ENGAGEMENT_TYPES.map(type => <option key={type} value={type}>{ENGAGEMENT_TYPE_LABELS[type]}</option>)}</select></div>
          {needsService && <div><label className={label} htmlFor="new-service">Service</label><select id="new-service" className={field} value={form.service} onChange={set("service")}><option value="">Choose the service</option>{services.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>}
          {existing ? (
            <div className="sm:col-span-2"><label className={label} htmlFor="new-existing">Business</label><select id="new-existing" className={field} value={form.businessId} onChange={set("businessId")}><option value="">Choose the client's business</option>{(clients.data ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          ) : (
            <>
              <div><label className={label} htmlFor="new-business">Business name</label><input id="new-business" className={field} value={form.businessName} onChange={set("businessName")} /></div>
              <div><label className={label} htmlFor="new-contact">Client name</label><input id="new-contact" className={field} value={form.contactName} onChange={set("contactName")} /></div>
              <div className="sm:col-span-2"><label className={label} htmlFor="new-email">Client email</label><input id="new-email" type="email" className={field} value={form.contactEmail} onChange={set("contactEmail")} /></div>
            </>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={create.isPending || !ready}>Open the engagement</Button>
            <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" onClick={() => { setOpen(false); onDone?.(); }}>Cancel</Button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * "Fix the next problem" on the desk's side: what clients asked for from their rooms. Open the engagement from a
 * request once it is paid (it fills the client, type and service), or decline it.
 */
function ServiceRequests({ onOpen }: { onOpen: (prefill: EngagementPrefill) => void }) {
  const utils = trpc.useUtils();
  const requests = trpc.engagement.staff.serviceRequests.useQuery();
  const handle = trpc.engagement.staff.handleRequest.useMutation({ onSuccess: () => { void utils.engagement.staff.serviceRequests.invalidate(); toast.success("Request closed."); }, onError: error => toast.error(error.message) });
  if (!requests.data?.length) return null;
  return (
    <section aria-labelledby="service-requests" className="space-y-2 border border-brand-line bg-brand-tint p-4">
      <h2 id="service-requests" className="text-sm font-semibold text-ink">Clients asking for another service ({requests.data.length})</h2>
      <p className="text-xs text-ink-muted">Confirm it with them and send the payment link; once paid, open the engagement from here.</p>
      <ul className="space-y-1">
        {requests.data.map(item => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-line pt-2 text-sm">
            <span><span className="font-medium">{item.businessName}</span> · {item.serviceName}<span className="text-ink-muted"> · {item.requestedBy} · {formatDate(item.createdAt)}</span>{item.note && <span className="block text-xs text-ink-600">“{item.note}”</span>}</span>
            <span className="flex gap-2">
              <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" onClick={() => onOpen({ requestId: item.id, businessId: item.businessId, type: item.type, service: item.service })}>Open the engagement</Button>
              <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={handle.isPending} onClick={() => handle.mutate({ requestId: item.id, status: "declined" })}>Decline</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

