import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { savePdf } from "@/lib/savePdf";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { FULL_REPORT } from "@shared/businessSupport";
import {
  BIGGEST_COST, CASH, CHANNELS, CHARGE_BASIS, COST_SHARE, costShareForMargin, earnsByDeal, ENQUIRIES, INTAKE_QUESTIONS, intakeSchema, intakeWording, LOANS, OWED, PRICE_POSITION,
  REGISTRATION, REPEAT, TOOLS, TOP_CUSTOMER_SHARE,
} from "@shared/fullReport/intake";
import { CheckCircle2, Download, FileText } from "lucide-react";
import React, { useState, type FormEvent } from "react";
import { useParams } from "wouter";

/**
 * The Report Intake, reached only through the link in the report payment confirmation. The server checks the link on
 * every call. When the owner submits, the report is built by fixed rules and emailed at once; this page then offers
 * the same PDF to download.
 */

type Choice = readonly { value: string; label: string }[];

type DraftProduct = { name: string; basis: string; price: string; percent: string; dealSize: string };

type Draft = {
  location: string;
  registration: string;
  products: DraftProduct[];
  bestCustomer: string;
  competitors: string[];
  competitorsUnknown: boolean;
  pricePosition: string;
  topEarner: string;
  costShare: string;
  marginPercent: string;
  topCustomerShare: string;
  channels: string[];
  enquiries: string;
  conversion: string;
  repeat: string;
  roles: string;
  tools: string[];
  lastMonthRevenue: string;
  revenueUnknown: boolean;
  monthlyCosts: string;
  costsUnknown: boolean;
  biggestCost: string;
  cash: string;
  owed: string;
  loans: string;
  goal: string;
};

const EMPTY_PRODUCT: DraftProduct = { name: "", basis: "price", price: "", percent: "", dealSize: "" };
const EMPTY: Draft = {
  location: "", registration: "", products: [EMPTY_PRODUCT, EMPTY_PRODUCT, EMPTY_PRODUCT], bestCustomer: "", competitors: ["", "", ""], competitorsUnknown: false,
  pricePosition: "", topEarner: "", costShare: "", marginPercent: "", topCustomerShare: "", channels: [], enquiries: "", conversion: "", repeat: "", roles: "", tools: [],
  lastMonthRevenue: "", revenueUnknown: false, monthlyCosts: "", costsUnknown: false, biggestCost: "", cash: "", owed: "", loans: "", goal: "",
};

const digits = (value: string) => value.replace(/[^\d]/g, "");
const grouped = (value: string) => (value ? Number(value).toLocaleString("en-GB") : "");
const amount = (value: string) => (value ? Number(value) : null);
/** A percentage as typed: up to three whole digits and two decimals. */
const decimal = (value: string) => {
  const [whole, ...rest] = value.replace(/[^\d.]/g, "").split(".");
  return rest.length ? `${whole.slice(0, 3)}.${rest.join("").slice(0, 2)}` : whole.slice(0, 3);
};

/** The draft as the server expects it. Blank money answers stay blank (undefined) so the form can ask for them. */
function toIntake(draft: Draft): unknown {
  const products = draft.products.filter((product) => product.name.trim()).map((product) => ({
    name: product.name.trim(),
    basis: product.basis,
    price: product.basis === "price" ? amount(product.price) : null,
    percent: product.basis === "percent" && product.percent ? Number(product.percent) : null,
    dealSize: product.basis === "percent" ? amount(product.dealSize) : null,
  }));
  return {
    location: draft.location,
    registration: draft.registration || undefined,
    products,
    bestCustomer: draft.bestCustomer,
    competitors: draft.competitorsUnknown ? [] : draft.competitors.map((name) => name.trim()).filter(Boolean),
    pricePosition: draft.pricePosition || undefined,
    topEarner: draft.topEarner === "" ? undefined : draft.topEarner === "not_sure" ? null : Number(draft.topEarner),
    costShare: draft.costShare || undefined,
    marginPercent: draft.marginPercent ? Number(draft.marginPercent) : null,
    topCustomerShare: draft.topCustomerShare || undefined,
    channels: draft.channels,
    enquiries: draft.enquiries || undefined,
    conversion: draft.conversion === "" ? undefined : draft.conversion === "not_sure" ? null : Number(draft.conversion),
    repeat: draft.repeat || undefined,
    roles: draft.roles,
    tools: draft.tools,
    lastMonthRevenue: draft.revenueUnknown ? null : draft.lastMonthRevenue === "" ? undefined : amount(draft.lastMonthRevenue),
    monthlyCosts: draft.costsUnknown ? null : draft.monthlyCosts === "" ? undefined : amount(draft.monthlyCosts),
    biggestCost: draft.biggestCost || undefined,
    cash: draft.cash || undefined,
    owed: draft.owed || undefined,
    loans: draft.loans || undefined,
    goal: draft.goal,
  };
}

/** The question number a validation problem belongs to, so the message can say where to look. */
const FIELD_QUESTION: Record<string, string> = {
  monthlyCosts: "lastMonthRevenue", biggestCost: "lastMonthRevenue", conversion: "enquiries", owed: "cash", loans: "cash", marginPercent: "costShare",
};
function problemOf(draft: Draft): string | null {
  const competitors = INTAKE_QUESTIONS.findIndex((item) => item.id === "competitors") + 1;
  const parsed = intakeSchema.safeParse(toIntake(draft));
  if (parsed.success && !draft.competitorsUnknown && !draft.competitors.some((name) => name.trim())) return `Question ${competitors}: Name at least one competitor, or tick that you don't know who they are.`;
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const field = String(issue.path[0] ?? "");
  const question = FIELD_QUESTION[field] ?? field;
  const number = INTAKE_QUESTIONS.findIndex((item) => item.id === question) + 1;
  const message = issue.code === "invalid_value" || issue.code === "invalid_type" || /expected/i.test(issue.message) ? "Please choose or enter an answer." : issue.message;
  return number > 0 ? `Question ${number}: ${message}` : message;
}

function Options({ name, options, value, onChange }: { name: string; options: Choice; value: string; onChange: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={`border px-3 py-2 text-left text-sm transition-colors ${value === option.value ? "border-brand bg-brand-tint text-ink" : "border-line bg-paper-raised text-ink-soft hover:border-brand-line-strong"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Many({ name, options, values, onChange }: { name: string; options: Choice; values: string[]; onChange: (values: string[]) => void }) {
  const toggle = (value: string) => {
    if (value === "none") return onChange(values.includes("none") ? [] : ["none"]);
    const next = values.includes(value) ? values.filter((item) => item !== value) : [...values.filter((item) => item !== "none"), value];
    onChange(next);
  };
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={option.value} type="button" role="checkbox" aria-checked={values.includes(option.value)} onClick={() => toggle(option.value)}
          className={`border px-3 py-2 text-left text-sm transition-colors ${values.includes(option.value) ? "border-brand bg-brand-tint text-ink" : "border-line bg-paper-raised text-ink-soft hover:border-brand-line-strong"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Naira({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <div className={`flex h-11 items-stretch border border-input bg-paper-raised ${disabled ? "opacity-50" : ""}`}>
      <span aria-hidden className="flex items-center border-r border-input px-3 text-sm font-medium text-ink-muted">₦</span>
      <input id={id} aria-label={label} inputMode="numeric" disabled={disabled} value={grouped(value)} onChange={(event) => onChange(digits(event.target.value).slice(0, 12))}
        className="w-0 min-w-0 flex-1 bg-transparent px-3 text-base tabular-nums outline-none md:text-sm" />
    </div>
  );
}

function Percent({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex h-11 w-28 items-stretch border border-input bg-paper-raised">
      <input id={id} aria-label={label} inputMode="decimal" value={value} onChange={(event) => onChange(decimal(event.target.value))}
        className="w-0 min-w-0 flex-1 bg-transparent px-3 text-base tabular-nums outline-none md:text-sm" />
      <span aria-hidden className="flex items-center border-l border-input px-3 text-sm font-medium text-ink-muted">%</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div aria-hidden className="h-1 bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-center gap-4">
          <img src={BRAND.logoUrl} alt={BRAND.organisationName} className="h-14 w-auto" />
          <span className="border-l border-line pl-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">{BRAND.productName}</span>
        </header>
        {children}
      </div>
    </main>
  );
}

export default function FullReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const form = trpc.fullReport.form.useQuery({ token }, { retry: false, refetchOnWindowFocus: false });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<{ fileName: string; pdf: string } | null>(null);
  const submit = trpc.fullReport.submit.useMutation({
    onSuccess: (result) => setSent({ fileName: result.fileName, pdf: result.pdf }),
    onError: (error) => setProblem(error.message),
  });
  const download = trpc.fullReport.download.useMutation({ onSuccess: (result) => savePdf(result.fileName, result.pdf), onError: (error) => setProblem(error.message) });

  if (form.isLoading) return <Shell><p className="text-sm text-ink-muted">Opening your report form…</p></Shell>;
  if (form.error || !form.data) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl font-bold">This link is not valid</h1>
        <p className="mt-3 text-ink-soft">{form.error?.message ?? "Use the link in your payment confirmation email, or reply to it for help."}</p>
      </Shell>
    );
  }

  const { fullName, businessName, email } = form.data;
  const firstName = fullName.trim().split(/\s+/)[0];
  if (sent || form.data.status === "delivered") {
    return (
      <Shell>
        <div className="space-y-4">
          <CheckCircle2 className="h-10 w-10 text-highlight-ink" aria-hidden />
          <h1 className="font-serif text-3xl font-bold">{sent ? "Your report is on its way" : "Your report has been sent"}</h1>
          <p className="text-ink-soft">We have emailed your full business check report{businessName ? ` for ${businessName}` : ""} to <span className="font-medium text-ink">{email}</span>. You can also download it here.</p>
          <Button type="button" className="h-12 rounded-none bg-ink px-6 text-sm font-semibold uppercase tracking-wider text-paper hover:bg-charcoal" disabled={download.isPending}
            onClick={() => (sent ? savePdf(sent.fileName, sent.pdf) : download.mutate({ token }))}>
            <Download className="mr-2 h-4 w-4" aria-hidden /> Download your report
          </Button>
          {problem && <p role="alert" className="text-sm text-danger-strong">{problem}</p>}
          <p className="text-sm text-ink-muted">If you would like help with the plan in your report, reply to the email or book a free 20-minute call.</p>
        </div>
      </Shell>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setProblem(null);
  };
  const answered = [
    draft.location.trim(), draft.registration, draft.products.some((product) => product.name.trim()), draft.bestCustomer.trim(), draft.competitorsUnknown || draft.competitors.some((name) => name.trim()), draft.pricePosition, draft.topEarner,
    draft.costShare, draft.topCustomerShare, draft.channels.length, draft.enquiries && draft.conversion, draft.repeat, draft.roles.trim(), draft.tools.length,
    (draft.lastMonthRevenue || draft.revenueUnknown) && (draft.monthlyCosts || draft.costsUnknown) && draft.biggestCost, draft.cash && draft.owed && draft.loans, draft.goal.trim(),
  ].filter(Boolean).length;
  const named = draft.products.map((product, index) => ({ value: String(index), label: product.name.trim() })).filter((option) => option.label);
  // A business paid by the deal is asked about its fees, not the deal money it passes on.
  const byDeal = earnsByDeal(draft.products.filter((product) => product.name.trim()));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = problemOf(draft);
    if (found) return setProblem(found);
    submit.mutate({ token, intake: toIntake(draft) });
  };

  const question = (id: (typeof INTAKE_QUESTIONS)[number]["id"], body: React.ReactNode) => {
    const index = INTAKE_QUESTIONS.findIndex((item) => item.id === id);
    const { prompt, hint } = intakeWording(INTAKE_QUESTIONS[index], byDeal);
    return (
      <fieldset key={id} className="space-y-3 border-t border-line pt-5">
        <legend className="sr-only">{prompt}</legend>
        <p className="flex gap-3 font-medium text-ink"><span className="w-6 shrink-0 font-semibold tabular-nums text-highlight-ink">{index + 1}</span><span>{prompt}</span></p>
        {hint && <p className="pl-9 text-sm text-ink-muted">{hint}</p>}
        <div className="pl-9">{body}</div>
      </fieldset>
    );
  };
  const groups = INTAKE_QUESTIONS.map((item) => item.group).filter((group, index, all) => all.indexOf(group) === index);

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">Your report form</p>
      <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">{firstName ? `${firstName}, seventeen questions` : "Seventeen questions"} and your report is done</h1>
      <p className="mt-3 text-ink-soft">
        About {FULL_REPORT.formMinutes} minutes. Your full business check report{businessName ? ` for ${businessName}` : ""} is built from these answers and your business check, and emailed to <span className="font-medium text-ink">{email}</span> the moment you finish. Estimates are fine.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-10">
        {groups.map((group) => (
          <section key={group} aria-label={group} className="space-y-5">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-brand">{group}</h2>
            {INTAKE_QUESTIONS.filter((item) => item.group === group).map((item) => {
              switch (item.id) {
                case "location": return question(item.id, <Input aria-label="Where you sell from" value={draft.location} maxLength={120} onChange={(event) => set("location", event.target.value)} className="h-11 rounded-none" />);
                case "registration": return question(item.id, <Options name="Registration" options={REGISTRATION} value={draft.registration} onChange={(value) => set("registration", value)} />);
                case "products": return question(item.id, (
                  <div className="space-y-4">
                    {draft.products.map((product, index) => {
                      const number = index + 1;
                      const change = (patch: Partial<DraftProduct>) => set("products", draft.products.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));
                      return (
                        <div key={index} className="space-y-2">
                          <Input aria-label={`Product or service ${number}`} placeholder={index === 0 ? "e.g. Lace fabric, 5 yards" : "Optional"} value={product.name} maxLength={80}
                            onChange={(event) => change({ name: event.target.value })} className="h-11 rounded-none" />
                          {(index === 0 || product.name.trim()) && (
                            <div className="space-y-2">
                              <Options name={`How you charge for product or service ${number}`} options={CHARGE_BASIS} value={product.basis} onChange={(basis) => change({ basis })} />
                              {product.basis === "price" && <div className="w-48"><Naira id={`price-${index}`} label={`Price of product or service ${number}`} value={product.price} onChange={(price) => change({ price })} /></div>}
                              {product.basis === "percent" && (
                                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                                  <Percent id={`percent-${index}`} label={`Percentage of the deal for product or service ${number}`} value={product.percent} onChange={(percent) => change({ percent })} />
                                  <span>of a typical deal of</span>
                                  <div className="w-48"><Naira id={`deal-${index}`} label={`Typical deal size for product or service ${number}`} value={product.dealSize} onChange={(dealSize) => change({ dealSize })} /></div>
                                  <span className="text-ink-muted">(deal size optional)</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ));
                case "bestCustomer": return question(item.id, <Textarea aria-label="Your best customer" rows={2} maxLength={200} value={draft.bestCustomer} onChange={(event) => set("bestCustomer", event.target.value)} className="rounded-none" />);
                case "competitors": return question(item.id, (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {draft.competitors.map((name, index) => (
                        <Input key={index} aria-label={`Competitor ${index + 1}`} value={name} maxLength={80} disabled={draft.competitorsUnknown} onChange={(event) => set("competitors", draft.competitors.map((item, at) => (at === index ? event.target.value : item)))} className="h-11 rounded-none" />
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-ink-muted">
                      <input type="checkbox" checked={draft.competitorsUnknown} onChange={(event) => set("competitorsUnknown", event.target.checked)} /> I don't know who they are
                    </label>
                  </div>
                ));
                case "pricePosition": return question(item.id, <Options name="Your prices against competitors" options={PRICE_POSITION} value={draft.pricePosition} onChange={(value) => set("pricePosition", value)} />);
                case "topEarner": return question(item.id, named.length
                  ? <Options name="Top earner" options={[...named, { value: "not_sure", label: "I'm not sure" }]} value={draft.topEarner} onChange={(value) => set("topEarner", value)} />
                  : <p className="text-sm text-ink-muted">Name your products in question 3 first.</p>);
                case "costShare": return question(item.id, (
                  <div className="space-y-3">
                    <Options name="Direct cost share" options={COST_SHARE} value={draft.costShare} onChange={(value) => { setDraft((current) => ({ ...current, costShare: value, marginPercent: "" })); setProblem(null); }} />
                    <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
                      <span>Or type your margin</span>
                      <Percent id="margin" label="Your margin" value={draft.marginPercent}
                        onChange={(value) => { setDraft((current) => ({ ...current, marginPercent: value, costShare: value ? costShareForMargin(Number(value)) : current.costShare })); setProblem(null); }} />
                    </div>
                    <p className="text-sm text-ink-muted">{byDeal ? "Your margin is the part of your fees you keep after these costs." : "Your margin is the part of the selling price you keep after paying for the goods or materials. Selling for ₦100 what cost you ₦80 is a 20% margin."}</p>
                  </div>
                ));
                case "topCustomerShare": return question(item.id, <Options name="Share from three biggest customers" options={TOP_CUSTOMER_SHARE} value={draft.topCustomerShare} onChange={(value) => set("topCustomerShare", value)} />);
                case "channels": return question(item.id, <Many name="Where new customers come from" options={CHANNELS} values={draft.channels} onChange={(values) => set("channels", values)} />);
                case "enquiries": return question(item.id, (
                  <div className="space-y-3">
                    <Options name="Enquiries a month" options={ENQUIRIES} value={draft.enquiries} onChange={(value) => set("enquiries", value)} />
                    <label className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                      Of every 10 who ask, how many buy?
                      <select aria-label="How many of every 10 buy" value={draft.conversion} onChange={(event) => set("conversion", event.target.value)} className="h-10 border border-input bg-paper-raised px-2 text-sm text-ink">
                        <option value="">Choose</option>
                        {Array.from({ length: 11 }, (_, count) => <option key={count} value={String(count)}>{count}</option>)}
                        <option value="not_sure">I'm not sure</option>
                      </select>
                    </label>
                  </div>
                ));
                case "repeat": return question(item.id, <Options name="Do customers come back" options={REPEAT} value={draft.repeat} onChange={(value) => set("repeat", value)} />);
                case "roles": return question(item.id, <Textarea aria-label="Who does what" rows={3} maxLength={400} value={draft.roles} onChange={(event) => set("roles", event.target.value)} className="rounded-none" />);
                case "tools": return question(item.id, <Many name="Tools" options={TOOLS} values={draft.tools} onChange={(values) => set("tools", values)} />);
                case "lastMonthRevenue": return question(item.id, (
                  <div className="space-y-3">
                    {([["lastMonthRevenue", "revenueUnknown", "Money in last month"], ["monthlyCosts", "costsUnknown", "Running costs last month"]] as const).map(([key, unknown, label]) => (
                      <div key={key} className="space-y-1.5">
                        <p className="text-sm text-ink-soft">{label}</p>
                        <Naira id={key} label={label} value={draft[key]} disabled={draft[unknown]} onChange={(value) => set(key, value)} />
                        <label className="flex items-center gap-2 text-sm text-ink-muted">
                          <input type="checkbox" checked={draft[unknown]} onChange={(event) => set(unknown, event.target.checked)} /> I'm not sure
                        </label>
                      </div>
                    ))}
                    <p className="text-sm text-ink-soft">Your biggest cost</p>
                    <Options name="Biggest cost" options={BIGGEST_COST} value={draft.biggestCost} onChange={(value) => set("biggestCost", value)} />
                  </div>
                ));
                case "cash": return question(item.id, (
                  <div className="space-y-3">
                    {([["cash", "Cash in the bank today", CASH], ["owed", "Money customers owe you", OWED], ["loans", "Loans", LOANS]] as const).map(([key, label, options]) => (
                      <div key={key} className="space-y-1.5">
                        <p className="text-sm text-ink-soft">{label}</p>
                        <Options name={label} options={options} value={draft[key]} onChange={(value) => set(key, value)} />
                      </div>
                    ))}
                  </div>
                ));
                case "goal": return question(item.id, <Textarea aria-label="Your goal for the next 12 months" rows={3} maxLength={300} value={draft.goal} onChange={(event) => set("goal", event.target.value)} className="rounded-none" />);
                default: return null;
              }
            })}
          </section>
        ))}

        <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur">
          <p className="text-sm text-ink-muted"><span className="font-semibold tabular-nums text-ink">{answered}</span> of 17 answered</p>
          {problem && <p role="alert" className="text-sm text-danger-strong">{problem}</p>}
          <Button type="submit" disabled={submit.isPending} className="h-12 w-full rounded-none bg-highlight-ink text-sm font-semibold uppercase tracking-widest text-paper hover:opacity-90">
            <FileText className="mr-2 h-4 w-4" aria-hidden /> {submit.isPending ? "Building your report…" : "Send me my report"}
          </Button>
        </div>
      </form>
    </Shell>
  );
}
