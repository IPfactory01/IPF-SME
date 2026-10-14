import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import BusinessSupportConsole from "@/components/admin/BusinessSupportConsole";
import { Ban, CalendarDays, Check, CheckCircle2, CircleDollarSign, ClipboardList, Copy, ExternalLink, FileText, Layers3, Mail, MessageSquare, RefreshCw, Search, Shield, ShieldAlert, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ADMIN_PERMISSION_DEFINITIONS, type AdminPermission } from "../../../shared/adminPermissions";
import { toggleVisibleApplicantSelection } from "../../../shared/applicantSelection";
import { BRAND } from "@shared/brand";

const statusStyles: Record<string, string> = {
  Pending: "bg-health-watch-tint text-ink border-health-watch/40",
  Accepted: "bg-health-clear-tint text-ink border-health-clear/40",
  Rejected: "bg-danger-tint text-danger border-danger-line",
  Waitlisted: "bg-brand-tint text-brand-deep border-brand-line",
};

const packageLabels = ["All", "Foundation", "Engine Room", "Boardroom"];
const statusLabels = ["All", "Pending", "Accepted", "Rejected", "Waitlisted"];
const attendanceFilterLabels = ["All", "Confirmed"] as const;
type InboundReplyStatus = "New" | "Reviewed" | "Follow-up" | "Closed";
const FOUNDATION_CLASS_DATES = [
  { date: "Sunday 6 September 2026", time: "9:00 pm" },
  { date: "Sunday 13 September 2026", time: "9:00 pm" },
  { date: "Saturday 19 September 2026", time: "7:00 pm" },
  { date: "Sunday 27 September 2026", time: "9:00 pm" },
  { date: "Saturday 3 October 2026", time: "7:00 pm" },
] as const;

type InboundReply = {
  id: number;
  registrationId: number;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  preview: string;
  body: string;
  receivedAt: Date | string;
  status: InboundReplyStatus;
  participantName: string;
  package: "Foundation" | "Engine Room" | "Boardroom";
};

export default function Admin() {
  const [, setLocation] = useLocation();
  const access = trpc.adminAccess.status.useQuery(undefined, { retry: false });
  if (access.isLoading) return <div className="min-h-screen bg-paper flex items-center justify-center text-sm text-ink-muted">Verifying administrator access…</div>;
  if (!access.data?.passwordVerified) {
    return <div className="min-h-screen bg-paper flex items-center justify-center p-6"><Card className="w-full max-w-md rounded-none border-line-soft bg-white"><CardHeader><div className="mb-3 flex h-10 w-10 items-center justify-center bg-health-watch-tint text-ink"><ShieldAlert className="h-5 w-5" /></div><CardTitle className="font-serif text-2xl">Secure admin verification required</CardTitle></CardHeader><CardContent className="space-y-5"><p className="text-sm leading-6 text-ink-muted">Your Gmail account must be recognised and your separate {BRAND.programmeShortName} administrator password verified before the administration console can open.</p><Button onClick={() => setLocation("/admin/login")} className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">Continue to secure admin sign in</Button></CardContent></Card></div>;
  }
  return (
    <DashboardLayout>
      <div className="-m-4 min-h-screen bg-paper p-6 text-ink lg:p-10">
        <div className="mx-auto max-w-7xl">
          <BusinessSupportConsole
            access={access.data}
            team={<AdminTeamManagement />}
            jump={<JumpProgrammeConsole />}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

/** The earlier JUMP programme registration desk, unchanged, now inside the console as its own legacy section. */
function JumpProgrammeConsole() {
  const access = trpc.adminAccess.status.useQuery(undefined, { retry: false });
  const can = (permission: AdminPermission) => access.data?.isOwner === true || access.data?.permissions.includes(permission) === true;
  const canReviewParticipants = can("view_participants");
  const [packageFilter, setPackageFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [attendanceFilter, setAttendanceFilter] = useState<(typeof attendanceFilterLabels)[number]>("All");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedApplicantId, setSelectedApplicantId] = useState<number | null>(null);
  const [paymentInstructionRecipientId, setPaymentInstructionRecipientId] = useState<number | null>(null);
  const [paymentInstructionTemplateId, setPaymentInstructionTemplateId] = useState<"nigeria_access_bank" | "north_america" | "uk_wise">("nigeria_access_bank");
  const [paymentInstructionApproved, setPaymentInstructionApproved] = useState(false);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isSingleEmailOpen, setIsSingleEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [scheduleKind, setScheduleKind] = useState<"Decide" | "Learn" | "Apply">("Decide");
  const [activeTab, setActiveTab] = useState<"applicants" | "referrals">("applicants");
  const [emailSearch, setEmailSearch] = useState("");
  const [emailStatusFilter, setEmailStatusFilter] = useState("All");
  const [selectedEmailLog, setSelectedEmailLog] = useState<{ id: number; recipientEmail: string; subject: string; body: string; status: string; sentAt: Date | string } | null>(null);
  const [selectedInboundReply, setSelectedInboundReply] = useState<InboundReply | null>(null);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("Strategy & Innovation Masterclass");
  const [reminderDate, setReminderDate] = useState("2026-09-04");
  const [reminderTime, setReminderTime] = useState("09:00 AM UTC");
  const [reminderUrl, setReminderUrl] = useState("https://meet.google.com/abc-defg-hij");
  const [reminderNotes, setReminderNotes] = useState("Please review the pre-reading diagnostic materials prior to joining.");

  const filters = useMemo(() => ({ packageFilter, statusFilter, search }), [packageFilter, statusFilter, search]);
  const { data: registrations, isLoading, error } = trpc.registration.list.useQuery(filters, { enabled: canReviewParticipants });
  const informationSessionAttendance = trpc.informationSession.attendance.useQuery(undefined, { enabled: canReviewParticipants, retry: false });
  const paymentInstructionTemplates = trpc.paymentInstructions.templateLibrary.useQuery(undefined, { enabled: access.data?.isOwner === true, retry: false });
  const paymentInstructionPreview = trpc.paymentInstructions.preview.useQuery(
    { registrationId: paymentInstructionRecipientId ?? 0, templateId: paymentInstructionTemplateId },
    { enabled: paymentInstructionRecipientId !== null && access.data?.isOwner === true, retry: false },
  );
  const { data: scheduleSlots, isLoading: scheduleLoading } = trpc.scheduling.adminList.useQuery({ kind: scheduleKind }, { enabled: can("manage_scheduling") });
  const { data: allEmailLogs, isLoading: emailLogsLoading } = trpc.registration.getAllEmailLogs.useQuery(undefined, { enabled: can("view_communications") });
  const inboundReplyTracker = trpc.inboundReplies.list.useQuery(undefined, { enabled: can("view_communications") });
  const { data: selectedAssessment, isLoading: assessmentLoading } = trpc.participant.adminGetAssessment.useQuery(
    { registrationId: selectedApplicantId ?? 0 },
    { enabled: selectedApplicantId !== null && can("view_assessments") }
  );
  const { data: selectedAssignments, isLoading: assignmentsLoading } = trpc.participant.adminListAssignments.useQuery(
    { registrationId: selectedApplicantId ?? 0 },
    { enabled: selectedApplicantId !== null && can("view_documents") }
  );
  const { data: selectedPaymentReceipts, isLoading: paymentReceiptsLoading } = trpc.participant.adminListPaymentReceipts.useQuery(
    { registrationId: selectedApplicantId ?? 0 },
    { enabled: selectedApplicantId !== null && can("manage_payments") }
  );
  const { data: calendarConfiguration } = trpc.scheduling.configuration.useQuery();
  const utils = trpc.useUtils();

  const updateStatus = trpc.registration.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Applicant status updated.");
      utils.registration.list.invalidate();
      utils.registration.capacity.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const updatePayment = trpc.registration.updatePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment milestone updated.");
      utils.registration.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateCohort = trpc.registration.updateCohort.useMutation({
    onSuccess: () => {
      toast.success("Cohort assignment updated.");
      utils.registration.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const archiveRegistration = trpc.registration.archiveRegistration.useMutation({
    onSuccess: () => {
      toast.success("Application archived from the active desk. Its record has not been deleted.");
      setSelectedApplicantId(null);
      setSelectedIds([]);
      utils.registration.list.invalidate();
      utils.registration.capacity.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const sendEmail = trpc.registration.sendEmail.useMutation({
    onSuccess: (data) => {
      toast.success(data.status === "Simulated" ? "Email logged. Connect a delivery provider to send externally." : "Email sent.");
      setIsSingleEmailOpen(false);
      setEmailSubject("");
      setEmailBody("");
    },
    onError: (err) => toast.error(err.message),
  });
  const sendPaymentInstructions = trpc.paymentInstructions.send.useMutation({
    onSuccess: (data) => {
      toast.success(`Payment instructions sent to ${data.recipientEmail}.`);
      setPaymentInstructionRecipientId(null);
      setPaymentInstructionApproved(false);
      utils.registration.getAllEmailLogs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const syncInboundReplies = trpc.inboundReplies.sync.useMutation({
    onSuccess: (data) => {
      toast.success(`Reply tracker refreshed: ${data.matchedMessages} participant ${data.matchedMessages === 1 ? "reply" : "replies"} matched.`);
      inboundReplyTracker.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateInboundReplyStatus = trpc.inboundReplies.updateStatus.useMutation({
    onSuccess: () => inboundReplyTracker.refetch(),
    onError: (err) => toast.error(err.message),
  });
  const seedSchedule = trpc.scheduling.seed.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.inserted} ${scheduleKind} slot(s) added.`);
      utils.scheduling.adminList.invalidate({ kind: scheduleKind });
    },
    onError: (err) => toast.error(err.message),
  });
  const blockScheduleSlot = trpc.scheduling.block.useMutation({
    onSuccess: () => {
      toast.success("Schedule slot updated.");
      utils.scheduling.adminList.invalidate({ kind: scheduleKind });
    },
    onError: (err) => toast.error(err.message),
  });
  const sendBulkEmail = trpc.registration.sendBulkEmail.useMutation({
    onSuccess: (data) => {
      toast.success(data.failed > 0 ? `${data.sent} sent, ${data.failed} failed.` : data.status === "Sent" ? `${data.count} email(s) sent.` : `${data.count} email(s) recorded; delivery is pending provider configuration.`);
      setIsBulkEmailOpen(false);
      setEmailSubject("");
      setEmailBody("");
    },
    onError: (err) => toast.error(err.message),
  });
  const resendEmailLog = trpc.registration.resendEmailLog.useMutation({
    onSuccess: (data) => {
      toast.success(data.status === "Sent" ? "Email resent successfully." : `Delivery attempted; status: ${data.status}.`);
      utils.registration.getAllEmailLogs.invalidate();
      setSelectedEmailLog(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const sendSessionReminder = trpc.registration.sendSessionReminder.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setIsReminderModalOpen(false);
      utils.registration.getAllEmailLogs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const registrationsList = registrations ?? [];
  const attendanceByRegistrationId = useMemo(() => new Map((informationSessionAttendance.data?.responses ?? []).map((response) => [response.registrationId, response.status])), [informationSessionAttendance.data?.responses]);
  const list = useMemo(() => attendanceFilter === "Confirmed"
    ? registrationsList.filter((item) => attendanceByRegistrationId.get(item.id) === "Confirmed")
    : registrationsList,
  [attendanceFilter, attendanceByRegistrationId, registrationsList]);
  const selectedApplicant = registrationsList.find((item) => item.id === selectedApplicantId) ?? null;
  const visibleIds = useMemo(() => list.map((item) => item.id), [list]);
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const acceptedCount = list.filter((item) => item.status === "Accepted").length;
  const pendingCount = list.filter((item) => item.status === "Pending").length;
  const waitlistedCount = list.filter((item) => item.status === "Waitlisted").length;
  const completedAssessmentCount = list.filter((item) => item.journey.assessment === "Complete").length;
  const receiptsForReviewCount = list.filter((item) => item.journey.receipt === "Receipt submitted").length;
  const paymentConfirmedCount = list.filter((item) => item.journey.payment !== "Awaiting payment").length;
  const bottleneckCount = list.filter((item) => item.journey.nextAction.startsWith("Await") || item.journey.nextAction === "Review payment receipt").length;

  const toggleSelected = (id: number) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const selectAll = () => {
    setSelectedIds((current) => toggleVisibleApplicantSelection(current, visibleIds));
  };

  return (
    <>
      <div className="text-ink">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-brand mb-2">{BRAND.programmeName} / Legacy programme</p>
              <h2 className="font-serif text-3xl font-bold tracking-tight">Registration Desk</h2>
              <p className="text-sm text-ink-muted mt-2 max-w-xl">Review applications, track payment milestones, and shape the cohort after onboarding.</p>
            </div>
            <Button onClick={() => window.location.href = "/"} variant="outline" className="border-brand text-brand hover:bg-brand-tint rounded-none uppercase tracking-wider text-xs">View Public Page</Button>
          </div>

          {error ? (
            <Card className="border-danger-line bg-danger-tint text-danger-strong rounded-none">
              <CardContent className="p-6"><p className="font-semibold">This view is restricted to the programme owner.</p><p className="text-sm mt-1">Sign in with the owner account to review private registrations.</p></CardContent>
            </Card>
          ) : null}

          <div className="flex gap-2 border-b border-line pb-2">
            <Button
              variant={activeTab === "applicants" ? "default" : "outline"}
              onClick={() => setActiveTab("applicants")}
              className={`rounded-none text-xs uppercase tracking-wider ${activeTab === "applicants" ? "bg-brand text-paper" : "border-brand-line-strong text-brand"}`}
            >
              Registrations & Cohort
            </Button>
            <Button
              variant={activeTab === "referrals" ? "default" : "outline"}
              onClick={() => setActiveTab("referrals")}
              className={`rounded-none text-xs uppercase tracking-wider ${activeTab === "referrals" ? "bg-brand text-paper" : "border-brand-line-strong text-brand"}`}
            >
              Referrals & Credits
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total applications" value={list.length} icon={<Users className="w-4 h-4" />} />
            <MetricCard label="Pending review" value={pendingCount} icon={<Layers3 className="w-4 h-4" />} />
            <MetricCard label="Accepted" value={acceptedCount} icon={<CheckCircle2 className="w-4 h-4" />} />
            <MetricCard label="Waitlisted" value={waitlistedCount} icon={<CircleDollarSign className="w-4 h-4" />} />
          </div>

          <Card className="rounded-none border-brand-line bg-brand-tint shadow-none">
            <CardHeader className="flex flex-col gap-4 border-b border-brand-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle className="flex items-center gap-2 font-serif text-xl"><CalendarDays className="h-5 w-5 text-brand" />Scheduling desk</CardTitle><p className="mt-1 text-xs leading-relaxed text-brand-slate">Generate the dated availability windows, review capacity, and block a slot before applicants see it.</p></div>
              <div className="flex flex-col gap-2 sm:items-end"><Badge className={calendarConfiguration?.connected ? "border-health-clear/40 bg-health-clear-tint text-ink" : "border-health-watch/40 bg-health-watch-tint text-ink"}>{calendarConfiguration?.connected ? "Google Calendar connected" : "Calendar credentials pending"}</Badge><p className="max-w-xs text-right text-[11px] leading-relaxed text-brand-slate">{calendarConfiguration?.message}</p></div>
            </CardHeader>
            <CardContent className="space-y-4 px-6 py-5">
              <div className="border border-brand-line bg-paper p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">Foundation classes</p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">Confirmed participant-facing group-class dates. Times are Lagos time; meeting access is released separately.</p>
                  </div>
                  <Badge variant="outline" className="w-fit rounded-none border-brand-line-strong text-[10px] text-brand">5 classes</Badge>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {FOUNDATION_CLASS_DATES.map((session) => (
                    <div key={session.date} className="border border-line bg-white px-3 py-3">
                      <p className="text-sm font-semibold text-ink">{session.date}</p>
                      <p className="mt-1 text-xs text-ink-muted">{session.time} · Africa/Lagos</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-2">{(["Decide", "Learn", "Apply"] as const).map((kind) => <Button key={kind} type="button" variant="outline" onClick={() => setScheduleKind(kind)} className={`rounded-none text-xs uppercase tracking-wider ${scheduleKind === kind ? "border-brand bg-brand text-paper" : "border-brand-line-strong text-brand"}`}>{kind}</Button>)}</div><Button type="button" onClick={() => seedSchedule.mutate({ kind: scheduleKind })} disabled={seedSchedule.isPending} className="rounded-none bg-ink text-xs uppercase tracking-wider text-paper"><RefreshCw className={`mr-2 h-4 w-4 ${seedSchedule.isPending ? "animate-spin" : ""}`} />{seedSchedule.isPending ? "Generating..." : `Generate ${scheduleKind} dates`}</Button></div>
              {scheduleLoading ? <p className="py-6 text-sm text-brand-slate">Loading schedule...</p> : scheduleSlots?.length ? <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{scheduleSlots.slice(0, 12).map((slot) => <div key={slot.id} className={`border p-3 ${slot.status === "Blocked" ? "border-danger-line-soft bg-danger-tint" : slot.status === "Booked" ? "border-health-clear/40 bg-health-clear-tint" : "border-brand-line bg-paper"}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{new Date(slot.startAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p><p className="text-xs text-ink-muted">{new Date(slot.startAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })} · {slot.timezone}</p></div><Badge variant="outline" className="text-[10px]">{slot.status}</Badge></div><div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted"><span>{slot.bookedCount}/{slot.capacity} booked</span>{slot.bookedCount === 0 && <Button type="button" variant="ghost" size="sm" onClick={() => blockScheduleSlot.mutate({ slotId: slot.id, blocked: slot.status !== "Blocked" })} className="h-7 px-2 text-brand">{slot.status === "Blocked" ? <><Check className="mr-1 h-3 w-3" />Open</> : <><Ban className="mr-1 h-3 w-3" />Block</>}</Button>}</div></div>)}</div> : <div className="border border-dashed border-brand-line-strong bg-paper p-5 text-sm text-brand-slate">No {scheduleKind} dates have been generated yet. Generate the owner availability window to make dates visible to applicants.</div>}
            </CardContent>
          </Card>

          {activeTab === "referrals" ? (
            <Card className="rounded-none border-line bg-paper shadow-sm">
              <CardHeader className="border-b border-line px-6 py-4"><CardTitle className="font-serif text-xl">Referral review desk</CardTitle><p className="mt-1 text-xs leading-5 text-ink-muted">A referral becomes eligible only when the referred business is accepted and its first commitment payment is confirmed. Credits remain manual: approving one does not alter a payment balance.</p></CardHeader>
              <CardContent className="p-0"><ReferralReview /></CardContent>
            </Card>
          ) : (
            <>
              <Card className="rounded-none border-brand-line border-t-2 border-t-brand shadow-sm bg-paper">
                <CardContent className="p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-brand" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search applicant, business or email" className="pl-9 bg-paper-sunken border-line rounded-none" />
                  </div>
                  <Select value={packageFilter} onValueChange={setPackageFilter}>
                    <SelectTrigger className="lg:w-48 bg-paper-sunken border-line rounded-none"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-paper">{packageLabels.map((item) => <SelectItem key={item} value={item}>{item === "All" ? "All packages" : item}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="lg:w-48 bg-paper-sunken border-line rounded-none"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-paper">{statusLabels.map((item) => <SelectItem key={item} value={item}>{item === "All" ? "All statuses" : item}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={attendanceFilter} onValueChange={(value) => setAttendanceFilter(value as (typeof attendanceFilterLabels)[number])} disabled={informationSessionAttendance.isLoading || informationSessionAttendance.data?.available !== true}>
                    <SelectTrigger className="lg:w-52 bg-paper-sunken border-line rounded-none"><SelectValue placeholder={informationSessionAttendance.isLoading ? "Loading RSVPs…" : "Session attendance"} /></SelectTrigger>
                    <SelectContent className="bg-paper">{attendanceFilterLabels.map((item) => <SelectItem key={item} value={item}>{item === "All" ? "All session responses" : "Confirmed attendees"}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button disabled={selectedIds.length === 0} onClick={() => setIsBulkEmailOpen(true)} className="bg-ink text-paper hover:bg-charcoal rounded-none uppercase tracking-wider text-xs"><Mail className="w-4 h-4 mr-2" /> Email selected ({selectedIds.length})</Button>
                </CardContent>
              </Card>
              {informationSessionAttendance.data?.available ? <p className="-mt-5 text-[11px] leading-5 text-ink-muted">Information Session RSVP data is live from Google Calendar{informationSessionAttendance.data.refreshedAt ? ` · refreshed ${new Date(informationSessionAttendance.data.refreshedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.</p> : <p className="-mt-5 text-[11px] leading-5 text-ink">The confirmed-attendee filter is unavailable until Google Calendar RSVP data can be refreshed.</p>}

              <Card className="rounded-none border-line-warm bg-paper-muted shadow-none">
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">Participant journey overview</p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">The figures below reflect the applicants currently visible after your active filters.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <JourneyMetric label="Assessment complete" value={completedAssessmentCount} tone="blue" />
                    <JourneyMetric label="Receipt to review" value={receiptsForReviewCount} tone="amber" />
                    <JourneyMetric label="Payment confirmed" value={paymentConfirmedCount} tone="green" />
                    <JourneyMetric label="Needs follow-through" value={bottleneckCount} tone="rose" />
                  </div>
                </CardContent>
              </Card>

              {can("view_communications") ? <Card className="rounded-none border-brand-line bg-brand-tint-softest shadow-none">
                <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-brand-tint-line px-5 py-4">
                  <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand"><MessageSquare className="h-4 w-4" />Participant replies</p><CardTitle className="mt-2 font-serif text-xl">Inbox follow-through</CardTitle><p className="mt-1 text-xs leading-5 text-brand-slate-soft">Private participant replies matched to the {BRAND.programmeShortName} mailbox and their portal records.</p></div>
                  {access.data?.isOwner ? <Button type="button" variant="outline" size="sm" disabled={!inboundReplyTracker.data?.connected} onClick={() => syncInboundReplies.mutate()} className="rounded-none border-brand-line-strong bg-white text-xs font-semibold uppercase tracking-wider text-brand hover:bg-brand-tint"><RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh inbox</Button> : null}
                </CardHeader>
                <CardContent className="p-0">
                  {!inboundReplyTracker.data?.connected ? <div className="p-5 text-sm leading-6 text-brand-slate-soft"><strong className="font-semibold text-brand">Mailbox connection required.</strong> Connect the dedicated <span className="font-medium">{BRAND.programmeMailbox}</span> Gmail authorisation to enable live reply retrieval. Until then, no inbox content is collected or displayed here.</div> : null}
                  {inboundReplyTracker.data?.connected && !inboundReplyTracker.data.replies.length ? <div className="p-5 text-sm text-ink-muted">No participant replies have been synchronised yet. Select <strong>Refresh inbox</strong> to check the protected {BRAND.programmeShortName} mailbox.</div> : null}
                  {inboundReplyTracker.data?.replies.length ? <div className="divide-y divide-brand-tint-line">{inboundReplyTracker.data.replies.slice(0, 6).map((reply) => <div key={reply.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"><button onClick={() => setSelectedInboundReply(reply)} className="min-w-0 text-left"><p className="truncate text-sm font-semibold text-ink">{reply.participantName} <span className="font-normal text-ink-muted">· {reply.subject}</span></p><p className="mt-1 max-w-3xl truncate text-xs text-brand-slate-soft">{reply.preview}</p><p className="mt-1 text-[11px] text-ink-fainter">{reply.senderEmail} · {new Date(reply.receivedAt).toLocaleString()}</p></button><div className="flex shrink-0 items-center gap-2"><Select value={reply.status} onValueChange={(status) => updateInboundReplyStatus.mutate({ id: reply.id, status: status as InboundReplyStatus })}><SelectTrigger className="h-8 w-32 rounded-none border-brand-line bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent className="bg-white">{["New", "Reviewed", "Follow-up", "Closed"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" size="sm" onClick={() => setSelectedInboundReply(reply)} className="h-8 rounded-none border-brand-line-strong text-xs text-brand">Open</Button></div></div>)}</div> : null}
                </CardContent>
              </Card> : null}

              <Card className="rounded-none border-line shadow-sm bg-paper overflow-hidden">
                <CardHeader className="border-b border-line px-6 py-4 flex flex-row items-center justify-between">
                  <CardTitle className="font-serif text-xl">Applicants</CardTitle>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <span className="text-xs text-ink-muted">{list.length} visible</span>
                    <Button type="button" variant="outline" size="sm" disabled={list.length === 0} onClick={selectAll} className="h-8 rounded-none border-brand-line-strong px-3 text-[11px] font-semibold uppercase tracking-wider text-brand hover:bg-brand-tint">
                      {allVisibleSelected ? `Clear ${list.length} visible` : `Select all ${list.length} visible`}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-line hover:bg-transparent">
                          <TableHead className="w-12"><input type="checkbox" checked={allVisibleSelected} onChange={selectAll} aria-label={`Select all ${list.length} visible applicants`} /></TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Applicant</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Business model</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Package</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Session RSVP</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Payment</TableHead>
                          <TableHead className="min-w-[14rem] text-xs uppercase tracking-wider">Journey</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? <TableRow><TableCell colSpan={9} className="p-10 text-center text-sm text-ink-muted">Loading applications...</TableCell></TableRow> : null}
                        {!isLoading && list.length === 0 ? <TableRow><TableCell colSpan={9} className="p-10 text-center text-sm text-ink-muted">No registrations match these filters.</TableCell></TableRow> : null}
                        {list.map((applicant) => (
                          <TableRow key={applicant.id} className="border-line hover:bg-paper-sunken/70">
                            <TableCell><input type="checkbox" checked={selectedIds.includes(applicant.id)} onChange={() => toggleSelected(applicant.id)} aria-label={`Select ${applicant.fullName}`} /></TableCell>
                            <TableCell>
                              <button onClick={() => setSelectedApplicantId(applicant.id)} className="text-left hover:underline">
                                <p className="font-semibold text-sm">{applicant.fullName}</p>
                                <p className="text-xs text-ink-muted">{applicant.businessName}</p>
                              </button>
                            </TableCell>
                            <TableCell><Badge variant="outline" className="rounded-none text-[10px]">{applicant.businessModel}</Badge></TableCell>
                            <TableCell><span className="text-xs font-medium">{applicant.package}</span></TableCell>
                            <TableCell>
                              <Select value={applicant.status} onValueChange={(val: any) => updateStatus.mutate({ id: applicant.id, status: val })}>
                                <SelectTrigger className={`h-7 w-32 text-xs rounded-none border ${statusStyles[applicant.status] || ""}`}><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-paper">
                                  {["Pending", "Accepted", "Rejected", "Waitlisted"].map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell><InformationSessionAttendanceBadge status={attendanceByRegistrationId.get(applicant.id) ?? "Not invited"} /></TableCell>
                            <TableCell>
                              <div className="space-y-1 w-32">
                                <PaymentToggle label="40% Commitment" paid={applicant.depositPaid === "Paid"} onClick={() => updatePayment.mutate({ id: applicant.id, field: "depositPaid", value: applicant.depositPaid === "Paid" ? "Pending" : "Paid" })} />
                                <PaymentToggle label="30% Mid" paid={applicant.instalment1 === "Paid"} onClick={() => updatePayment.mutate({ id: applicant.id, field: "instalment1", value: applicant.instalment1 === "Paid" ? "Pending" : "Paid" })} />
                                <PaymentToggle label="30% Balance" paid={applicant.instalment2 === "Paid"} onClick={() => updatePayment.mutate({ id: applicant.id, field: "instalment2", value: applicant.instalment2 === "Paid" ? "Pending" : "Paid" })} />
                              </div>
                            </TableCell>
                            <TableCell><JourneyIndicators journey={applicant.journey} /></TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => setSelectedApplicantId(applicant.id)} className="text-xs text-brand hover:bg-brand-tint rounded-none">Review</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog open={selectedApplicantId !== null} onOpenChange={(open) => !open && setSelectedApplicantId(null)}>
        <DialogContent className="max-w-2xl bg-paper border-line text-ink max-h-[90vh] overflow-y-auto">
          {selectedApplicant ? <>
            <DialogHeader><DialogTitle className="font-serif text-3xl">{selectedApplicant.fullName}</DialogTitle><DialogDescription>{selectedApplicant.businessName} · {selectedApplicant.email}</DialogDescription></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
              <Detail label="Phone" value={selectedApplicant.phone} />
              <Detail label="Business model" value={selectedApplicant.businessModel} />
              <Detail label="Package" value={selectedApplicant.package} />
              <Detail label="Status" value={selectedApplicant.status} />
              <Detail label="Information Session RSVP" value={attendanceByRegistrationId.get(selectedApplicant.id) ?? "Not invited"} />
              <div className="sm:col-span-2"><Detail label="Business description" value={selectedApplicant.businessDescription} /></div>
              <div className="sm:col-span-2"><Detail label="Pre-submission question" value={selectedApplicant.question || "No question submitted."} /></div>
              {selectedApplicant.diagnosticStage ? <Detail label="Diagnostic stage" value={`${selectedApplicant.diagnosticStage} · ${selectedApplicant.diagnosticEngineRoom ?? "Engine Room pending"}`} /> : null}
              {selectedApplicant.diagnosticClasses ? <div className="sm:col-span-2"><Detail label="Recommended classes" value={selectedApplicant.diagnosticClasses} /></div> : null}
              {selectedApplicant.bookingToken ? <div className="sm:col-span-2 border border-brand-line bg-brand-tint p-4"><Detail label="Private scheduling link" value={`${window.location.origin}/schedule?token=${selectedApplicant.bookingToken}`} /><a href={`/schedule?token=${selectedApplicant.bookingToken}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold uppercase tracking-wider text-brand hover:underline">Open scheduling page</a><p className="mt-2 text-[11px] text-brand-slate">Share this only after the applicant is accepted and the 40% commitment payment is marked Paid.</p></div> : null}
              <div className="sm:col-span-2 border-t border-line pt-5"><AssessmentReviewPanel allowed={can("view_assessments")} loading={assessmentLoading} data={selectedAssessment} /></div>
              <div className="sm:col-span-2 border-t border-line pt-5"><PaymentReceiptPanel allowed={can("manage_payments")} loading={paymentReceiptsLoading} receipts={selectedPaymentReceipts} /></div>
              {access.data?.isOwner ? <div className="sm:col-span-2 border-t border-brand-line bg-brand-tint p-4"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Payment-instructions library</p><p className="mt-2 text-sm leading-6 text-brand-slate">Preview the approved Nigeria, North America, or U.K. template, then explicitly approve the personalised reply before it is delivered and logged.</p><Button onClick={() => { setPaymentInstructionRecipientId(selectedApplicant.id); setPaymentInstructionApproved(false); }} className="mt-3 rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover"><CircleDollarSign className="mr-2 h-4 w-4" />Send payment details</Button></div> : null}
              <div className="sm:col-span-2 border-t border-line pt-5"><SupportingDocumentsPanel allowed={can("view_documents")} loading={assignmentsLoading} assignments={selectedAssignments} /></div>
              <div className="sm:col-span-2 pt-4 border-t border-line">
                <BriefManagementSection registrationId={selectedApplicant.id} />
              </div>
              {access.data?.isOwner ? <div className="sm:col-span-2 border-t border-danger-line pt-5"><p className="text-xs font-semibold uppercase tracking-wider text-danger">Owner safeguard</p><p className="mt-2 text-xs leading-5 text-ink-muted">Archiving removes this application from the active desk, marks it rejected, and blocks future booking. It does not delete the registration, diagnostic, or email history.</p><Button variant="outline" disabled={archiveRegistration.isPending} onClick={() => { if (window.confirm(`Archive ${selectedApplicant.fullName}'s application from the active ${BRAND.programmeShortName} desk? The participant record will be retained for audit.`)) archiveRegistration.mutate({ id: selectedApplicant.id }); }} className="mt-3 rounded-none border-danger-line text-xs text-danger hover:bg-danger-tint"><Ban className="mr-2 h-3.5 w-3.5" />Archive application</Button></div> : null}
            </div>
          </> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={paymentInstructionRecipientId !== null} onOpenChange={(open) => { if (!open) { setPaymentInstructionRecipientId(null); setPaymentInstructionApproved(false); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-none border-line bg-paper text-ink">
          <DialogHeader><DialogTitle className="font-serif text-3xl">Send payment details</DialogTitle><DialogDescription>These private account details remain in the protected owner workflow. Kindly review the rendered message, then give explicit approval before sending.</DialogDescription></DialogHeader>
          <div className="space-y-5 pt-3">
            <div className="space-y-2"><Label htmlFor="payment-template">Payment route</Label><Select value={paymentInstructionTemplateId} onValueChange={(value) => { setPaymentInstructionTemplateId(value as "nigeria_access_bank" | "north_america" | "uk_wise"); setPaymentInstructionApproved(false); }}><SelectTrigger id="payment-template" className="rounded-none border-brand-line bg-white"><SelectValue /></SelectTrigger><SelectContent className="bg-paper">{paymentInstructionTemplates.data?.map((template) => <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>)}</SelectContent></Select></div>
            {paymentInstructionPreview.isLoading ? <p className="text-sm text-ink-muted">Preparing the personalised payment reply…</p> : null}
            {paymentInstructionPreview.data ? <><div className="border border-brand-line bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Recipient</p><p className="mt-1 text-sm font-medium">{paymentInstructionPreview.data.recipientName}</p><p className="text-xs text-ink-muted">{paymentInstructionPreview.data.recipientEmail}</p><Separator className="my-4 bg-line" /><p className="text-xs font-semibold uppercase tracking-wider text-brand">Subject</p><p className="mt-1 text-sm">{paymentInstructionPreview.data.subject}</p><Separator className="my-4 bg-line" /><p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">{paymentInstructionPreview.data.body}</p></div><label className="flex cursor-pointer items-start gap-3 border border-line bg-paper-muted p-3 text-sm text-brand-slate"><input type="checkbox" checked={paymentInstructionApproved} onChange={(event) => setPaymentInstructionApproved(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>I have reviewed this personalised payment reply and approve sending it from <strong>{BRAND.programmeMailbox}</strong> with the required administrator monitoring blind copy.</span></label><Button disabled={!paymentInstructionApproved || sendPaymentInstructions.isPending} onClick={() => paymentInstructionRecipientId && sendPaymentInstructions.mutate({ registrationId: paymentInstructionRecipientId, templateId: paymentInstructionTemplateId, ownerApproval: true })} className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">{sendPaymentInstructions.isPending ? "Sending approved reply…" : "Send approved payment reply"}</Button></> : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={selectedInboundReply !== null} onOpenChange={(open) => { if (!open) setSelectedInboundReply(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-none border-line bg-paper text-ink">
          <DialogHeader><DialogTitle className="font-serif text-3xl">Participant reply</DialogTitle><DialogDescription>{selectedInboundReply?.participantName} · {selectedInboundReply?.senderEmail}</DialogDescription></DialogHeader>
          {selectedInboundReply ? <div className="space-y-4 pt-3"><div className="border border-brand-line bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Subject</p><p className="mt-1 text-sm font-medium">{selectedInboundReply.subject}</p><p className="mt-3 text-xs text-ink-muted">Received {new Date(selectedInboundReply.receivedAt).toLocaleString()}</p></div><div className="border border-line bg-white p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">{selectedInboundReply.body}</p></div></div> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AdminTeamManagement() {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteeName, setInviteeName] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [invitePermissions, setInvitePermissions] = useState<AdminPermission[]>(["view_participants"]);
  const [editingAdmin, setEditingAdmin] = useState<{ userId: number; label: string; permissions: AdminPermission[] } | null>(null);
  const [latestInvitationUrl, setLatestInvitationUrl] = useState<string | null>(null);
  const access = trpc.adminAccess.status.useQuery(undefined, { retry: false });
  const isOwner = access.data?.isOwner === true;
  const { data: team, isLoading: teamLoading } = trpc.adminAccess.listTeam.useQuery(undefined, { enabled: isOwner, retry: false });
  const { data: invitations, isLoading: invitationsLoading } = trpc.adminAccess.listInvitations.useQuery(undefined, { enabled: isOwner, retry: false });
  const utils = trpc.useUtils();
  const inviteAdmin = trpc.adminAccess.inviteAdmin.useMutation({
    onSuccess: (data) => {
      toast.success(data.deliveryStatus === "Sent" ? "Administrator invitation sent." : "Invitation created; kindly copy the secure link below.");
      setLatestInvitationUrl(data.invitationUrl);
      setInviteeName("");
      setInviteeEmail("");
      setInvitePermissions(["view_participants"]);
      setIsInviteOpen(false);
      utils.adminAccess.listInvitations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const revokeAdmin = trpc.adminAccess.revokeAdmin.useMutation({
    onSuccess: () => {
      toast.success("Administrator access revoked and active admin sessions closed.");
      utils.adminAccess.listTeam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const updatePermissions = trpc.adminAccess.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("Administrator responsibilities updated.");
      setEditingAdmin(null);
      utils.adminAccess.listTeam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!isOwner) return <div className="p-8 text-sm text-ink-muted"><p className="font-semibold text-ink">Team administration is reserved for {BRAND.facilitatorFirstName}’s super-admin account.</p><p className="mt-1">Your administrator access remains active for the assigned {BRAND.programmeShortName} work.</p></div>;
  if (teamLoading || invitationsLoading) return <p className="p-8 text-sm text-ink-muted">Loading administrator access records...</p>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Administrator access</p><p className="mt-1 text-xs leading-5 text-ink-muted">Every administrator must use their invited Gmail identity and an individual {BRAND.programmeShortName} password. Invitations expire after seven days.</p></div><Button onClick={() => setIsInviteOpen(true)} className="rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover"><UserPlus className="mr-2 h-4 w-4" />Invite administrator</Button></div>
      {latestInvitationUrl ? <div className="border border-brand-line bg-brand-tint p-4"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Secure invitation link ready</p><p className="mt-2 break-all text-xs text-brand-ink">{latestInvitationUrl}</p><Button variant="outline" size="sm" className="mt-3 rounded-none border-brand-line-strong text-xs text-brand" onClick={async () => { await navigator.clipboard.writeText(latestInvitationUrl); toast.success("Invitation link copied."); }}><Copy className="mr-2 h-3.5 w-3.5" />Copy link</Button></div> : null}
      <div className="overflow-x-auto"><Table><TableHeader><TableRow className="border-line hover:bg-transparent"><TableHead className="text-xs uppercase tracking-wider">Administrator</TableHead><TableHead className="text-xs uppercase tracking-wider">Role</TableHead><TableHead className="text-xs uppercase tracking-wider">Last signed in</TableHead><TableHead className="text-right text-xs uppercase tracking-wider">Control</TableHead></TableRow></TableHeader><TableBody>{team?.map((admin) => { const owner = admin.isSuperAdmin; return <TableRow key={admin.id} className="border-b border-line"><TableCell><p className="text-sm font-semibold">{admin.name || `${BRAND.programmeShortName} administrator`}</p><p className="text-xs text-ink-muted">{admin.email}</p></TableCell><TableCell><Badge variant="default" className="rounded-none bg-brand text-[10px] text-white">{owner ? "Super administrator" : "Administrator"}</Badge></TableCell><TableCell className="text-xs text-ink-muted">{admin.lastSignedIn ? new Date(Number(admin.lastSignedIn)).toLocaleString() : "Never"}</TableCell><TableCell className="text-right">{owner ? <span className="text-xs text-ink-muted">Protected</span> : <Button variant="outline" size="sm" disabled={revokeAdmin.isPending} onClick={() => { if (window.confirm(`Revoke administrator access for ${admin.email}?`)) revokeAdmin.mutate({ userId: admin.id }); }} className="rounded-none border-danger-line text-xs text-danger hover:bg-danger-tint"><UserMinus className="mr-2 h-3.5 w-3.5" />Revoke</Button>}</TableCell></TableRow>; })}</TableBody></Table></div>
      <div className="border border-line bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Edit administrator responsibilities</p><p className="mt-1 text-xs leading-5 text-ink-muted">Select an active administrator to review or narrow their platform powers. Super Admin access remains protected.</p><div className="mt-3 flex flex-wrap gap-2">{team?.filter((admin) => !admin.isSuperAdmin).map((admin) => <Button key={admin.id} variant="outline" size="sm" onClick={() => setEditingAdmin({ userId: admin.id, label: admin.name || admin.email || "Administrator", permissions: (admin.permissions ?? []).filter((permission): permission is AdminPermission => ADMIN_PERMISSION_DEFINITIONS.some((definition) => definition.id === permission)) })} className="rounded-none border-brand-line-strong text-xs text-brand">Edit {admin.name || admin.email}</Button>)}{!team?.some((admin) => !admin.isSuperAdmin) ? <span className="text-xs text-ink-muted">No active administrators to configure yet.</span> : null}</div>{editingAdmin ? <div className="mt-5 border-t border-line pt-4"><div className="mb-3 flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">{editingAdmin.label}</p><p className="text-xs text-ink-muted">Select the responsibilities this administrator may use.</p></div><Button variant="ghost" size="sm" onClick={() => setEditingAdmin(null)} className="text-xs text-ink-muted">Close</Button></div><PermissionChecklist selected={editingAdmin.permissions} onChange={(permissions) => setEditingAdmin({ ...editingAdmin, permissions })} /><Button disabled={updatePermissions.isPending || editingAdmin.permissions.length === 0} onClick={() => updatePermissions.mutate({ userId: editingAdmin.userId, permissions: editingAdmin.permissions })} className="mt-4 rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">{updatePermissions.isPending ? "Saving responsibilities…" : "Save administrator powers"}</Button></div> : null}</div>
      <div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Invitation history</p><div className="overflow-x-auto"><Table><TableHeader><TableRow className="border-line hover:bg-transparent"><TableHead className="text-xs uppercase tracking-wider">Invitee</TableHead><TableHead className="text-xs uppercase tracking-wider">Status</TableHead><TableHead className="text-xs uppercase tracking-wider">Delivery</TableHead><TableHead className="text-xs uppercase tracking-wider">Expires</TableHead></TableRow></TableHeader><TableBody>{invitations?.length ? invitations.map((invitation) => <TableRow key={invitation.id} className="border-b border-line"><TableCell><p className="text-sm font-medium">{invitation.inviteeName || "Administrator invite"}</p><p className="text-xs text-ink-muted">{invitation.email}</p></TableCell><TableCell><Badge variant="outline" className="rounded-none text-[10px]">{invitation.displayStatus}</Badge></TableCell><TableCell className="text-xs text-ink-muted">{invitation.deliveryStatus}</TableCell><TableCell className="text-xs text-ink-muted">{new Date(Number(invitation.expiresAt)).toLocaleString()}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-7 text-center text-xs text-ink-muted">No administrator invitations have been issued.</TableCell></TableRow>}</TableBody></Table></div></div>
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-line-soft bg-paper"><DialogHeader><DialogTitle className="font-serif text-2xl">Invite an administrator</DialogTitle><DialogDescription>Only invite a person you trust. Select exactly the {BRAND.programmeShortName} responsibilities they need; you can revise these later.</DialogDescription></DialogHeader><form className="space-y-4 pt-2" onSubmit={(event) => { event.preventDefault(); inviteAdmin.mutate({ email: inviteeEmail, inviteeName: inviteeName || undefined, permissions: invitePermissions }); }}><div className="space-y-2"><Label htmlFor="invitee-name">Name</Label><Input id="invitee-name" value={inviteeName} onChange={(event) => setInviteeName(event.target.value)} placeholder="Administrator name" /></div><div className="space-y-2"><Label htmlFor="invitee-email">Gmail address</Label><Input id="invitee-email" type="email" value={inviteeEmail} onChange={(event) => setInviteeEmail(event.target.value)} placeholder="name@gmail.com" required /></div><PermissionChecklist selected={invitePermissions} onChange={setInvitePermissions} /><Button type="submit" disabled={inviteAdmin.isPending || invitePermissions.length === 0} className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">{inviteAdmin.isPending ? "Creating invitation…" : "Send secure invitation"}</Button></form></DialogContent></Dialog>
    </div>
  );
}

function PermissionChecklist({ selected, onChange }: { selected: AdminPermission[]; onChange: (permissions: AdminPermission[]) => void }) {
  const toggle = (permission: AdminPermission) => onChange(selected.includes(permission) ? selected.filter((entry) => entry !== permission) : [...selected, permission]);
  return <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-wider text-brand">Administrator responsibilities</legend><p className="text-xs leading-5 text-ink-muted">Super Admin retains every power, including access management and permanent programme settings.</p><div className="divide-y divide-line border-y border-line">{ADMIN_PERMISSION_DEFINITIONS.map((permission) => <label key={permission.id} className="flex cursor-pointer items-start gap-3 py-3"><input type="checkbox" checked={selected.includes(permission.id)} onChange={() => toggle(permission.id)} className="mt-0.5 h-4 w-4 accent-brand" /><span><span className="block text-sm font-medium text-ink">{permission.label}</span><span className="mt-0.5 block text-xs leading-5 text-ink-muted">{permission.description}</span></span></label>)}</div></fieldset>;
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <Card className="rounded-none border-line bg-paper-sunken shadow-none"><CardContent className="p-5"><div className="flex items-center justify-between text-ink-muted"><span className="text-xs uppercase tracking-wider">{label}</span>{icon}</div><p className="font-serif text-4xl font-bold mt-3">{value}</p></CardContent></Card>;
}

function ReferralReview() {
  const utils = trpc.useUtils();
  const { data: referrals, isLoading } = trpc.referrals.listForOwner.useQuery();
  const review = trpc.referrals.review.useMutation({
    onSuccess: (result) => {
      utils.referrals.listForOwner.invalidate();
      toast.success(result.decision === "Approved" ? `Referral credit approved at ${result.creditPercentage}%. Apply it manually to the outstanding balance when appropriate.` : `Referral marked ${result.decision.toLowerCase()}.`);
    },
    onError: (err) => toast.error(err.message),
  });

  return <div className="overflow-x-auto"><Table><TableHeader><TableRow className="border-line hover:bg-transparent"><TableHead className="text-xs uppercase tracking-wider">Introduction</TableHead><TableHead className="text-xs uppercase tracking-wider">Referred business</TableHead><TableHead className="text-xs uppercase tracking-wider">Eligibility</TableHead><TableHead className="text-xs uppercase tracking-wider">Review state</TableHead><TableHead className="text-right text-xs uppercase tracking-wider">Owner action</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-ink-muted">Loading referral records…</TableCell></TableRow> : null}{!isLoading && !referrals?.length ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-ink-muted">No referral applications have been recorded yet.</TableCell></TableRow> : null}{referrals?.map((referral) => { const eligible = referral.referredStatus === "Accepted" && referral.referredDepositPaid === "Paid"; const actionable = referral.status === "Registered" || referral.status === "Qualified"; return <TableRow key={referral.id} className="border-line align-top"><TableCell><p className="text-sm font-semibold">{referral.referrerName}</p><p className="text-xs text-ink-muted">{referral.referrerBusiness}</p></TableCell><TableCell><p className="text-sm font-semibold">{referral.referredName}</p><p className="text-xs text-ink-muted">{referral.referredBusiness} · {referral.referredPackage}</p></TableCell><TableCell><Badge variant="outline" className={`rounded-none text-[10px] ${eligible ? "border-health-clear/40 bg-health-clear-tint text-ink" : "border-health-watch/40 bg-health-watch-tint text-ink"}`}>{eligible ? "Accepted + 40% paid" : `${referral.referredStatus} · ${referral.referredDepositPaid}`}</Badge></TableCell><TableCell><div className="space-y-1"><Badge variant="outline" className="rounded-none text-[10px]">{referral.status}</Badge>{referral.creditPercentage > 0 ? <p className="text-xs font-semibold text-ink">{referral.creditPercentage}% manual credit approved</p> : null}</div></TableCell><TableCell className="text-right"><div className="flex flex-wrap justify-end gap-2">{referral.status === "Registered" ? <Button size="sm" variant="outline" disabled={!eligible || review.isPending} onClick={() => review.mutate({ id: referral.id, decision: "Qualified" })} className="rounded-none border-brand/30 text-xs text-brand">Qualify</Button> : null}{referral.status === "Qualified" ? <Button size="sm" disabled={review.isPending} onClick={() => { if (window.confirm(`Approve a 5% manual referral credit for ${referral.referrerName}? This does not alter any payment record automatically.`)) review.mutate({ id: referral.id, decision: "Approved" }); }} className="rounded-none bg-brand text-xs text-white hover:bg-brand-deep-hover">Approve 5% credit</Button> : null}{actionable ? <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => { if (window.confirm(`Decline this referral credit for ${referral.referrerName}?`)) review.mutate({ id: referral.id, decision: "Declined" }); }} className="rounded-none border-danger-line text-xs text-danger hover:bg-danger-tint">Decline</Button> : null}</div>{!eligible && referral.status === "Registered" ? <p className="mt-2 max-w-xs text-right text-[10px] leading-4 text-ink-muted">Eligible after acceptance and a recorded first commitment payment.</p> : null}</TableCell></TableRow>; })}</TableBody></Table></div>;
}

function PaymentToggle({ label, paid, onClick }: { label: string; paid: boolean; onClick: () => void }) {
  const stateClass = paid ? "bg-health-clear-tint border-health-clear/40 text-ink" : "bg-transparent border-line text-ink-muted";
  return <button onClick={onClick} title={paid ? `${label} — click to mark Pending` : `${label} — click to mark Paid`} className={"w-full flex items-center justify-between gap-2 border px-2 py-1 text-left text-[11px] transition-colors " + stateClass}><span>{label}</span><span className="font-semibold">{paid ? "Paid" : "Pending"}</span></button>;
}

function JourneyMetric({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "green" | "rose" }) {
  const toneClasses = {
    blue: "border-brand-line bg-brand-tint text-brand",
    amber: "border-health-watch/40 bg-health-watch-tint text-ink",
    green: "border-health-clear/40 bg-health-clear-tint text-ink",
    rose: "border-danger-line bg-danger-tint text-danger",
  };
  return <div className={`min-w-[8.5rem] border px-3 py-2 ${toneClasses[tone]}`}><p className="text-lg font-semibold leading-none">{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider">{label}</p></div>;
}

function JourneyIndicators({ journey }: { journey: { assessment: string; receipt: string; payment: string; nextAction: string } }) {
  const assessmentTone = journey.assessment === "Complete" ? "border-health-clear/40 bg-health-clear-tint text-ink" : journey.assessment === "In progress" ? "border-health-watch/40 bg-health-watch-tint text-ink" : "border-line-strong bg-paper-muted text-ink-muted";
  const receiptTone = journey.receipt === "Receipt confirmed" ? "border-health-clear/40 bg-health-clear-tint text-ink" : journey.receipt === "Receipt submitted" ? "border-health-watch/40 bg-health-watch-tint text-ink" : journey.receipt === "Receipt declined" ? "border-danger-line bg-danger-tint text-danger" : "border-line-strong bg-paper-muted text-ink-muted";
  const paymentTone = journey.payment === "Paid in full" || journey.payment === "Part payment confirmed" || journey.payment === "Deposit confirmed" ? "border-health-clear/40 bg-health-clear-tint text-ink" : "border-line-strong bg-paper-muted text-ink-muted";
  return <div className="min-w-[13rem] space-y-2"><div className="flex flex-wrap gap-1.5"><Badge variant="outline" className={`rounded-none px-1.5 text-[9px] ${assessmentTone}`} title={`Assessment: ${journey.assessment}`}>A · {journey.assessment}</Badge><Badge variant="outline" className={`rounded-none px-1.5 text-[9px] ${receiptTone}`} title={`Receipt: ${journey.receipt}`}>R · {journey.receipt}</Badge><Badge variant="outline" className={`rounded-none px-1.5 text-[9px] ${paymentTone}`} title={`Payment: ${journey.payment}`}>P · {journey.payment}</Badge></div><p className="max-w-[14rem] truncate text-[11px] font-medium text-brand-slate" title={`Next action: ${journey.nextAction}`}>Next: {journey.nextAction}</p></div>;
}

function InformationSessionAttendanceBadge({ status }: { status: string }) {
  const tone = status === "Confirmed" ? "border-health-clear/40 bg-health-clear-tint text-ink" : status === "Tentative" ? "border-health-watch/40 bg-health-watch-tint text-ink" : status === "Declined" ? "border-danger-line bg-danger-tint text-danger" : status === "Awaiting response" ? "border-brand-line bg-brand-tint text-brand" : "border-line-strong bg-paper-muted text-ink-muted";
  return <Badge variant="outline" className={`rounded-none text-[10px] ${tone}`}>{status}</Badge>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-widest text-ink-muted mb-1">{label}</p><p className="text-sm leading-relaxed">{value}</p></div>;
}

function AssessmentReviewPanel({ allowed, loading, data }: { allowed: boolean; loading: boolean; data: any }) {
  if (!allowed) return <RestrictedParticipantRecord label="Current State Assessment" detail="Your assigned role does not include access to assessment answers." />;
  if (loading) return <ReviewSectionShell icon={<ClipboardList className="h-4 w-4" />} title="Current State Assessment"><p className="text-sm text-ink-muted">Loading saved assessment responses…</p></ReviewSectionShell>;
  if (!data?.assessment || !data?.draft) return <ReviewSectionShell icon={<ClipboardList className="h-4 w-4" />} title="Current State Assessment"><p className="text-sm leading-6 text-ink-muted">This participant has not started a Current State Assessment yet.</p></ReviewSectionShell>;
  const draft = data.draft;
  const answer = (value?: string | string[]) => Array.isArray(value) ? value.join(", ") : value || "Not provided";
  const sections = [
    ["01 · What we already know", [["Business name", draft.section1.businessName], ["Business age", draft.section1.businessAge], ["Operating engine", draft.section1.engine], ["Primary constraint", draft.section1.primaryConstraint], ["Business context", draft.section1.businessDescription]]],
    ["02 · Shape of the business", [["Who pays", draft.section2.payers], ["Legal structure", draft.section2.legalStructure], ["Ownership", draft.section2.ownership], ["Payment approval", draft.section2.paymentApproval], ["Full-time team", draft.section2.fullTimeTeam], ["Part-time team", draft.section2.partTimeTeam], ["Contractors", draft.section2.contractors]]],
    ["03 · Numbers", [["Revenue stage", draft.section3.revenueStage], ["Annual revenue band", draft.section3.annualRevenueBand], ["Confidence", draft.section3.revenueConfidence], ["Evidence source", draft.section3.materialNumberSource], ["Cash runway", draft.section3.cashRunway], ["Number note", draft.section3.materialNumberNote]]],
    ["04 · Founder", [["Capacity", draft.section4.founderCapacity], ["Decision style", draft.section4.decisionStyle], ["Energy", draft.section4.founderEnergy], ["Leadership constraint", draft.section4.leadershipConstraint]]],
    ["05 · Future direction", [["Planning horizon", draft.section5.futureHorizon], ["Success measures", draft.section5.successMeasures], ["Strategic priority", draft.section5.strategicPriority], ["Success description", draft.section5.successDescription]]],
  ] as const;
  return <ReviewSectionShell icon={<ClipboardList className="h-4 w-4" />} title="Current State Assessment" action={<Badge variant="outline" className="rounded-none text-[10px]">{data.progress?.completed ?? 0}/{data.progress?.total ?? 5} sections complete</Badge>}><div className="flex flex-wrap items-center gap-2"><Badge className="rounded-none bg-brand text-[10px] text-white">{data.assessment.status}</Badge><span className="text-xs text-ink-muted">Last saved {new Date(data.assessment.updatedAt).toLocaleString()}</span></div><div className="mt-4 space-y-3">{sections.map(([title, answers]) => <details key={title} className="border border-line bg-paper-raised p-3" open={draft.completedSections?.length === 5}><summary className="cursor-pointer text-sm font-semibold text-brand">{title}</summary><dl className="mt-3 space-y-3">{answers.map(([label, value]) => <div key={label}><dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</dt><dd className="mt-1 text-sm leading-6 text-ink">{answer(value)}</dd></div>)}</dl></details>)}</div>{data.workingReport ? <div className="mt-4 border border-health-clear/40 bg-health-clear-tint p-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink"><FileText className="h-4 w-4" />Working diagnostic report available</p><p className="mt-1 text-xs leading-5 text-ink">A private evidence-grounded working report has been generated from this participant’s assessment responses.</p></div> : null}</ReviewSectionShell>;
}

function SupportingDocumentsPanel({ allowed, loading, assignments }: { allowed: boolean; loading: boolean; assignments: any[] | undefined }) {
  if (!allowed) return <RestrictedParticipantRecord label="Supporting documents" detail="Your assigned role does not include access to participant-uploaded materials." />;
  return <ReviewSectionShell icon={<FileText className="h-4 w-4" />} title="Supporting documents">{loading ? <p className="text-sm text-ink-muted">Loading supporting documents…</p> : assignments?.length ? <div className="space-y-2">{assignments.map((assignment) => <a key={assignment.id} href={assignment.fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 border border-line bg-paper-raised p-3 text-sm transition-colors hover:bg-paper-sunken"><span><span className="block font-medium">{assignment.fileName}</span><span className="mt-1 block text-xs text-ink-muted">{assignment.notes || "Optional supporting document"} · {new Date(assignment.createdAt).toLocaleDateString()}</span></span><ExternalLink className="h-4 w-4 shrink-0 text-brand" /></a>)}</div> : <p className="text-sm leading-6 text-ink-muted">No optional supporting documents have been uploaded by this participant.</p>}</ReviewSectionShell>;
}

function PaymentReceiptPanel({ allowed, loading, receipts }: { allowed: boolean; loading: boolean; receipts: any[] | undefined }) {
  if (!allowed) return <RestrictedParticipantRecord label="Payment receipt evidence" detail="Your assigned role does not include payment-evidence review." />;
  const statusTone = (status: string) => status === "Confirmed" ? "border-health-clear/40 bg-health-clear-tint text-ink" : status === "Declined" ? "border-danger-line bg-danger-tint text-danger" : "border-health-watch/40 bg-health-watch-tint text-ink";
  return <ReviewSectionShell icon={<CircleDollarSign className="h-4 w-4" />} title="Payment receipt evidence" action={receipts?.length ? <Badge variant="outline" className="rounded-none text-[10px]">{receipts.length} submitted</Badge> : undefined}>{loading ? <p className="text-sm text-ink-muted">Loading submitted payment receipts…</p> : receipts?.length ? <div className="space-y-2">{receipts.map((receipt) => <div key={receipt.id} className="border border-line bg-paper-raised p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{receipt.paymentMilestone} payment receipt</p><p className="mt-1 text-xs text-ink-muted">Submitted {new Date(receipt.createdAt).toLocaleString()}</p></div><Badge variant="outline" className={`rounded-none text-[10px] ${statusTone(receipt.status)}`}>{receipt.status}</Badge></div>{receipt.participantNote ? <p className="mt-3 text-sm leading-6 text-brand-slate">{receipt.participantNote}</p> : null}{receipt.reviewNote ? <p className="mt-3 border-l-2 border-brand-line-strong pl-3 text-xs leading-5 text-brand-slate">Review note: {receipt.reviewNote}</p> : null}<a href={receipt.fileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand hover:underline"><ExternalLink className="h-3.5 w-3.5" />Open submitted receipt</a></div>)}</div> : <p className="text-sm leading-6 text-ink-muted">No payment receipt has been submitted by this participant yet.</p>}</ReviewSectionShell>;
}

function ReviewSectionShell({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="border border-brand-line bg-brand-tint p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2 text-brand">{icon}<p className="text-xs font-semibold uppercase tracking-wider">{title}</p></div>{action}</div><div className="mt-3">{children}</div></section>;
}

function RestrictedParticipantRecord({ label, detail }: { label: string; detail: string }) {
  return <section className="border border-dashed border-line-strong bg-paper-muted p-4"><p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p><p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p></section>;
}

function BriefManagementSection({ registrationId }: { registrationId: number }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const utils = trpc.useUtils();

  const { data: briefs } = trpc.participant.listBriefs.useQuery({ registrationId });
  const uploadBrief = trpc.participant.uploadBrief.useMutation({
    onSuccess: () => {
      toast.success("Engagement brief attached successfully.");
      setTitle("");
      setDescription("");
      setFileUrl("");
      utils.participant.listBriefs.invalidate({ registrationId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-widest text-brand font-semibold">Participant Briefs & Documents</p>
      {briefs && briefs.length > 0 ? (
        <div className="space-y-2">
          {briefs.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-3 bg-paper-sunken border border-line text-sm">
              <div>
                <p className="font-medium">{b.title}</p>
                {b.description && <p className="text-xs text-ink-muted">{b.description}</p>}
              </div>
              <a href={b.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand hover:underline">
                View PDF
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">No engagement briefs or documents attached for this participant yet.</p>
      )}

      <div className="bg-paper-sunken p-4 border border-line space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink">Upload New Brief</p>
        <Input
          placeholder="Brief Title (e.g. Bespoke Growth Roadmap)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-white border-line rounded-none text-xs"
        />
        <Input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-white border-line rounded-none text-xs"
        />
        <Input
          placeholder="Document Public URL (e.g. Google Drive link or S3 URL)"
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          className="bg-white border-line rounded-none text-xs"
        />
        <Button
          onClick={() => {
            if (!title.trim() || !fileUrl.trim()) {
              toast.error("Please provide a title and document URL.");
              return;
            }
            uploadBrief.mutate({
              registrationId,
              title,
              description: description || undefined,
              fileUrl,
              fileKey: fileUrl,
            });
          }}
          disabled={uploadBrief.isPending}
          className="w-full bg-brand hover:bg-brand-deep text-white rounded-none uppercase tracking-wider text-xs"
        >
          {uploadBrief.isPending ? "Attaching..." : "Publish Brief to Portal"}
        </Button>
      </div>
    </div>
  );
}
