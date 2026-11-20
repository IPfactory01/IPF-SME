/**
 * /pulse — Pulse entry screen (PRD §7.1, Phase 4 contact-first flow).
 *
 * Captures the respondent's name, company name and email — plus
 * an explicit privacy acknowledgement — BEFORE the session is created and
 * the 24-question wizard begins. Light organisation context (country,
 * industry, size) from the controlled lists is captured in the same step.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import PulseLayout from "@/components/pulse/PulseLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, Clock, ShieldCheck, Timer, UserCheck, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Any working email is accepted, a personal mailbox included (ET, 20 November 2026). */
function classifyEmail(email: string): "valid" | "invalid-format" {
  return EMAIL_PATTERN.test(email) ? "valid" : "invalid-format";
}

export default function PulseStart() {
  const [, navigate] = useLocation();
  // Referral tracking: /pulse?ref=<sessionId> or the compact /pulse?ic=<code>
  // alias of the respondent who invited this one.
  const [referralToken] = useState<string | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref") ?? "";
    if (/^[A-Za-z0-9_-]{20,32}$/.test(raw)) return raw;
    const code = params.get("ic") ?? "";
    if (/^[A-Za-z0-9]{5,12}$/.test(code)) return `ic:${code.toUpperCase().trim()}`;
    return undefined;
  });
  // Compact invite codes are resolved server-side to the referrer's session id.
  const inviteCode = useMemo(() => (referralToken?.startsWith("ic:") ? referralToken.slice(3) : undefined), [referralToken]);
  const inviteCodeQuery = trpc.pulse.resolveInviteCode.useQuery(
    { code: inviteCode ?? "" },
    { enabled: Boolean(inviteCode), staleTime: 5 * 60 * 1000 },
  );
  const resolvedReferral = inviteCode
    ? (inviteCodeQuery.data?.sessionId ?? undefined)
    : referralToken;
  const versionQuery = trpc.pulse.getActiveVersion.useQuery();
  const createSession = trpc.pulse.createSession.useMutation({
    onSuccess: (data) => {
      sessionStorage.setItem("pulse.sessionId", data.sessionId);
      sessionStorage.setItem("pulse.assessmentVersion", data.assessmentVersion);
      // Mark a brand-new session so the wizard never shows a "resume draft"
      // prompt right after starting.
      sessionStorage.setItem("pulse.assessmentStarted", data.sessionId);
      sessionStorage.removeItem("pulse.assessmentFinished");
      sessionStorage.removeItem("pulse.resumeHintShown");
      navigate(`/pulse/assessment?session=${encodeURIComponent(data.sessionId)}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const controls = useMemo(() => versionQuery.data?.controlled_lists ?? [], [versionQuery.data]);
  const countries = controls.find((c) => c.field === "country")?.values ?? ["Nigeria"];
  const industries = controls.find((c) => c.field === "industry")?.values ?? [];
  const employeeRanges = controls.find((c) => c.field === "employee_range")?.values ?? [];

  // Phase 4 contact-first fields
  const [respondentName, setRespondentName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [touchedName, setTouchedName] = useState(false);
  const [touchedCompany, setTouchedCompany] = useState(false);

  // Organisation context
  const [country, setCountry] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");
  const [otherIndustry, setOtherIndustry] = useState<string>("");
  const [touchedOtherIndustry, setTouchedOtherIndustry] = useState(false);
  // Match the live controlled-list value; keep the legacy "other" id as a
  // backward-compatibility fallback for older stored selections.
  const isOtherIndustry =
    industry === "Other (please specify)" ||
    industry === "other" ||
    /\bother\b/i.test(industry);
  const [employeeRange, setEmployeeRange] = useState<string>("");

  useEffect(() => {
    const c = controls.find((x) => x.field === "country");
    if (c && c.values.length > 0 && !country) setCountry(c.default_value ?? c.values[0]);
    const e = controls.find((x) => x.field === "employee_range");
    if (e && e.values.length > 0 && !employeeRange) setEmployeeRange(e.default_value ?? e.values[0]);
  }, [controls, country, employeeRange]);

  const emailStatus = classifyEmail(email);
  const loading = versionQuery.isLoading;
  const error = versionQuery.error;

  const canStart =
    respondentName.trim().length >= 2 &&
    companyName.trim().length >= 2 &&
    emailStatus === "valid" &&
    privacyAcknowledged &&
    !loading &&
    !createSession.isPending;

  const start = () => {
    setTouchedEmail(true);
    setTouchedName(true);
    setTouchedCompany(true);
    if (!canStart) {
      if (email && emailStatus !== "valid") {
        toast.error("Kindly enter a valid email address.");
      }
      if (!respondentName.trim()) toast.error("Please enter the respondent's name.");
      if (!companyName.trim()) toast.error("Please enter the company name.");
      if (!privacyAcknowledged) toast.error("Please acknowledge the privacy notice to continue.");
      if (isOtherIndustry && !otherIndustry.trim()) {
        toast.error("Please specify your industry in the text field.");
      }
      return;
    }
    createSession.mutate({
      respondentName: respondentName.trim(),
      companyName: companyName.trim(),
      email: email.trim().toLowerCase(),
      privacyNoticeVersion: "v1",
      privacyAcknowledged: true,
      country: country || undefined,
      industry: industry || undefined,
      employeeRange: employeeRange || undefined,
      otherIndustry: isOtherIndustry ? otherIndustry.trim() || undefined : undefined,
      referredBy: resolvedReferral,
    });
  };

  return (
    <PulseLayout>
      <section className="bg-gradient-to-br from-brand-deep to-brand-plum relative overflow-hidden text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 20%, white 1px, transparent 1px), radial-gradient(circle at 75% 60%, white 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />
        <div className="container relative grid items-start gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <div className="fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium uppercase tracking-widest">
              <UserCheck className="h-3.5 w-3.5" /> Free · Contact-first · No account needed
            </span>
            <h1 className="font-display mt-6 text-4xl font-semibold leading-[1.08] sm:text-5xl">
              The AI &amp; Workflow Readiness <span className="text-brand-line">Pulse</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              A 24-question check-up for Nigerian businesses. In about ten to
              fifteen minutes you get your <strong>readiness score (0–100)</strong>, a
              plain-English classification, and the specific foundations your
              business should strengthen before investing in AI.
            </p>
            <ul className="mt-8 grid max-w-lg gap-3 text-sm text-white/85">
              <li className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-brand-line" /> 24 short questions across 7 sections of the business — six scored areas plus an opportunity review that shapes your pathway
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand-line" /> Your contact details are collected once, with your consent, before the assessment begins
              </li>
              <li className="flex items-center gap-2.5">
                <Timer className="h-4 w-4 shrink-0 text-brand-line" /> Progress is saved for 24 hours if you need to pause
              </li>
              <li className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 shrink-0 text-brand-line" /> Score, classification and 90-day plan on screen — free, immediately
              </li>
            </ul>
          </div>

          <Card className="bg-paper-raised text-ink p-6 shadow-xl border-0 fade-up">
            <p className="text-sm font-semibold text-brand uppercase tracking-widest">
              Before we begin
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">
              Your contact details so we can identify your results. Your
              assessment answers are still scored anonymously against the
              approved methodology.
            </p>

            <div className="mt-5 space-y-4">
              {/* Respondent name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-ink/80" htmlFor="pulse-name">
                  Name of respondent <span className="text-danger">*</span>
                </Label>
                <Input
                  id="pulse-name"
                  value={respondentName}
                  onChange={(e) => setRespondentName(e.target.value)}
                  onBlur={() => setTouchedName(true)}
                  placeholder="e.g. Adaobi Okonkwo"
                  autoComplete="name"
                  aria-invalid={touchedName && respondentName.trim().length < 2}
                  className={`bg-paper-raised ${touchedName && respondentName.trim().length < 2 ? "border-danger" : ""}`}
                />
                {touchedName && respondentName.trim().length < 2 && (
                  <p className="text-xs text-danger">Please enter the respondent's full name.</p>
                )}
              </div>

              {/* Company name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-ink/80" htmlFor="pulse-company">
                  Company name <span className="text-danger">*</span>
                </Label>
                <Input
                  id="pulse-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onBlur={() => setTouchedCompany(true)}
                  placeholder="e.g. Lagos Foods Limited"
                  autoComplete="organization"
                  aria-invalid={touchedCompany && companyName.trim().length < 2}
                  className={`bg-paper-raised ${touchedCompany && companyName.trim().length < 2 ? "border-danger" : ""}`}
                />
                {touchedCompany && companyName.trim().length < 2 && (
                  <p className="text-xs text-danger">Please enter your company name.</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-ink/80" htmlFor="pulse-email">
                  Email <span className="text-danger">*</span>
                </Label>
                <Input
                  id="pulse-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouchedEmail(true)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  aria-invalid={touchedEmail && emailStatus !== "valid"}
                  className={`bg-paper-raised ${
                    touchedEmail && email && emailStatus === "invalid-format"
                      ? "border-danger"
                      : ""
                  }`}
                />
                {touchedEmail && email && emailStatus === "invalid-format" && (
                  <p className="text-xs text-danger">Please enter a valid email address.</p>
                )}
              </div>

              {/* Organisation context — kept optional, helps tailor the result */}
              <div className="grid grid-flow-row-dense grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-ink/80" htmlFor="pulse-country">
                    Country
                  </Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger id="pulse-country" className="w-full bg-paper-raised">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="border-line bg-paper-raised text-ink shadow-lg">
                      {countries.map((v) => (
                        <SelectItem key={v} value={v} className="focus:bg-brand-tint focus:text-brand-deep">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-medium text-ink/80" htmlFor="pulse-industry">
                    Industry
                  </Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger id="pulse-industry" className="w-full bg-paper-raised">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent className="border-line bg-paper-raised text-ink shadow-lg">
                      {industries.map((v) => (
                        <SelectItem key={v} value={v} className="focus:bg-brand-tint focus:text-brand-deep">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isOtherIndustry && (
                    <div className="pt-1">
                      <Input
                        id="pulse-other-industry"
                        value={otherIndustry}
                        onChange={(e) => setOtherIndustry(e.target.value)}
                        onBlur={() => setTouchedOtherIndustry(true)}
                        placeholder="e.g. FinTech, Real Estate, Renewable Energy"
                        maxLength={128}
                        className="bg-paper-raised"
                      />
                      {touchedOtherIndustry && !otherIndustry.trim() && (
                        <p className="mt-1 text-xs text-danger">Please specify your industry.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-ink/80" htmlFor="pulse-size">
                    Business size
                  </Label>
                  <Select value={employeeRange} onValueChange={setEmployeeRange}>
                    <SelectTrigger id="pulse-size" className="w-full bg-paper-raised">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent className="border-line bg-paper-raised text-ink shadow-lg">
                      {employeeRanges.map((v) => (
                        <SelectItem key={v} value={v} className="focus:bg-brand-tint focus:text-brand-deep">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Privacy acknowledgement */}
              <div className="flex items-start gap-3 rounded-lg border border-line bg-paper-muted/40 p-3.5">
                <Checkbox
                  id="pulse-privacy"
                  checked={privacyAcknowledged}
                  onCheckedChange={(v) => setPrivacyAcknowledged(v === true)}
                  aria-label="I acknowledge the privacy notice"
                />
                <label htmlFor="pulse-privacy" className="text-xs leading-relaxed text-ink-muted">
                  <span className="text-ink/90 font-medium">Privacy acknowledgement.</span>{" "}
                  By starting, you consent to IPF storing your name, company name and email
                  together with your anonymous assessment session, for the purposes of
                  identifying your results, emailing your report on request, and following up
                  on consultation requests. Your individual answers remain anonymous in
                  aggregate reporting. Details: name/company/email + session reference only
                  (privacy notice v1).
                </label>
              </div>

              <Button
                className="bg-brand text-white hover:bg-brand-deep disabled:bg-line-strong disabled:text-ink-muted w-full h-11 text-base font-semibold"
                size="lg"
                disabled={!canStart}
                onClick={start}
              >
                {createSession.isPending ? (
                  "Starting…"
                ) : error ? (
                  "Unable to start — please try again"
                ) : loading ? (
                  "Loading assessment…"
                ) : (
                  <>
                    Start the Pulse <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-center text-[11px] text-ink-muted leading-relaxed">
                Name, company and email are required. Your readiness score,
                classification, 90-day plan and indicative pathway are free —
                deeper professional entry services are optional and only
                proceed at your request.
              </p>
            </div>
          </Card>
        </div>
      </section>
    </PulseLayout>
  );
}
