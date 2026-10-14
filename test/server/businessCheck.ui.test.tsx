/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { evaluate } from "@shared/businessCheck/engine";
import { completeWith } from "../fixtures/businessCheckProfiles";

MotionGlobalConfig.skipAnimations = true;
// jsdom has no IntersectionObserver; scroll-triggered motion just needs it to exist.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;

const TOKEN = "t".repeat(32);

/** Each mutation records its inputs; start answers with a token, like the server. */
const api = vi.hoisted(() => {
  const calls: Record<string, unknown[]> = { start: [], saveProgress: [], submit: [], requestNext: [], payStart: [] };
  const replies: Record<string, ((input: unknown) => unknown) | undefined> = {};
  const mutation = (name: string) => (options?: { onSuccess?: (data: unknown) => void }) => ({
    isPending: false,
    isError: false,
    error: null,
    reset: () => undefined,
    mutate: (input: unknown) => {
      calls[name].push(input);
      const reply = replies[name]?.(input);
      if (reply !== undefined) options?.onSuccess?.(reply);
    },
  });
  return { calls, replies, mutation };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    businessCheck: {
      start: { useMutation: api.mutation("start") },
      saveProgress: { useMutation: api.mutation("saveProgress") },
      submit: { useMutation: api.mutation("submit") },
      requestNext: { useMutation: api.mutation("requestNext") },
    },
    onlinePayment: {
      start: { useMutation: api.mutation("payStart") },
    },
  },
}));
/** Leaving for Paystack is a full-page navigation, which jsdom cannot do: the page's call is recorded instead. */
const payOnline = vi.hoisted(() => ({ openCheckout: vi.fn(), rememberPayPage: vi.fn() }));
vi.mock("@/lib/payOnline", () => payOnline);

import BusinessCheck, { ANSWER_PAUSE_MS, SCREEN_SPRING } from "@/pages/BusinessCheck";

const STORAGE_KEY = "ipf-business-check-v1";
const pick = async (label: RegExp | string) => {
  fireEvent.click(await screen.findByRole("button", { name: label }));
};
const type = async (label: RegExp | string, value: string) => {
  fireEvent.change(await screen.findByRole("textbox", { name: label }), { target: { value } });
};
const preload = (state: Record<string, unknown>) =>
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ started: true, seen: [], history: [], contact: { fullName: "Ada Example", email: "ada@example.com", whatsapp: "", heardFrom: "" }, ...state }));

async function giveDetails() {
  await pick(/take the business check/i);
  expect(await screen.findByText("First, who are we talking to?")).toBeTruthy();
  const boxes = screen.getAllByRole("textbox");
  fireEvent.change(boxes[0], { target: { value: "Ada Example" } });
  fireEvent.change(boxes[1], { target: { value: "ada@example.com" } });
  await pick(/start the business check/i);
}

// The idea-stage test walks a whole question path in jsdom and takes about 4.5 s even on a quiet machine, so the default
// 5 s ceiling flaps with CPU load. Assertions are unchanged; this only stops a slow machine failing a correct test.
describe("business check page", { timeout: 20_000 }, () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.scrollTo = vi.fn();
    for (const name of Object.keys(api.calls)) api.calls[name] = [];
    api.replies.start = () => ({ token: TOKEN });
    api.replies.submit = undefined;
    api.replies.requestNext = (input) => ({ success: true, choice: (input as { choice: string }).choice });
    api.replies.payStart = () => ({ alreadyPaid: false, url: "https://checkout.paystack.com/TS-R-000001-1a2b3c4d" });
    payOnline.openCheckout.mockClear();
    payOnline.rememberPayPage.mockClear();
  });
  afterEach(cleanup);

  it("asks who the owner is first, records them as a lead, then starts the questions", async () => {
    render(React.createElement(BusinessCheck));
    await pick(/take the business check/i);
    expect(await screen.findByText("First, who are we talking to?")).toBeTruthy();
    expect(screen.getByText(/so our team can follow up if you don't finish/)).toBeTruthy();
    const start = screen.getByRole("button", { name: /start the business check/i }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    const boxes = screen.getAllByRole("textbox");
    fireEvent.change(boxes[0], { target: { value: " Ada Example " } });
    fireEvent.change(boxes[1], { target: { value: "ada@example.com" } });
    // Nigeria is preselected, so the owner types the local number; the first 0 is dropped and +234 added.
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "0800 000 0000" } });
    fireEvent.change(screen.getByLabelText("How did you hear about us?"), { target: { value: "LinkedIn" } });
    fireEvent.click(start);

    expect(api.calls.start).toEqual([{ fullName: "Ada Example", email: "ada@example.com", whatsapp: "+2348000000000", heardFrom: "LinkedIn" }]);
    expect(await screen.findByText("What this means")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).token).toBe(TOKEN);
  });

  describe("the WhatsApp number", () => {
    const fillRequired = () => {
      const boxes = screen.getAllByRole("textbox");
      fireEvent.change(boxes[0], { target: { value: "Ada Example" } });
      fireEvent.change(boxes[1], { target: { value: "ada@example.com" } });
    };
    const number = () => screen.getByLabelText("WhatsApp number") as HTMLInputElement;
    const country = () => screen.getByLabelText("Country code") as HTMLSelectElement;
    const startButton = () => screen.getByRole("button", { name: /start the business check/i }) as HTMLButtonElement;

    it("shows Nigeria's flag and +234 in the same box by default, with Nigeria first in the list", async () => {
      render(React.createElement(BusinessCheck));
      await pick(/take the business check/i);
      await screen.findByText("First, who are we talking to?");
      expect(country().value).toBe("NG");
      expect(number().closest("div")!.textContent).toContain("🇳🇬+234");
      expect(country().options[0].textContent).toBe("🇳🇬 Nigeria (+234)");
      expect(number().placeholder).toBe("803 123 4567");
    });

    it("drops a leading 0 as it is typed and says why", async () => {
      render(React.createElement(BusinessCheck));
      await pick(/take the business check/i);
      await screen.findByText("First, who are we talking to?");
      fireEvent.change(number(), { target: { value: "08031234567" } });
      expect(number().value).toBe("8031234567");
      expect(screen.getByText("No need for the first 0: +234 replaces it.")).toBeTruthy();
    });

    it("sends the number with the chosen country's code", async () => {
      render(React.createElement(BusinessCheck));
      await pick(/take the business check/i);
      await screen.findByText("First, who are we talking to?");
      fillRequired();
      fireEvent.change(country(), { target: { value: "GB" } });
      expect(number().closest("div")!.textContent).toContain("+44");
      fireEvent.change(number(), { target: { value: "07700 900123" } });
      fireEvent.click(startButton());
      expect(api.calls.start).toEqual([{ fullName: "Ada Example", email: "ada@example.com", whatsapp: "+447700900123", heardFrom: undefined }]);
    });

    it("blocks a Nigerian number of the wrong length, and still lets the owner skip the number", async () => {
      render(React.createElement(BusinessCheck));
      await pick(/take the business check/i);
      await screen.findByText("First, who are we talking to?");
      fillRequired();
      fireEvent.change(number(), { target: { value: "803123" } });
      fireEvent.blur(number());
      expect(startButton().disabled).toBe(true);
      expect(screen.getByRole("alert").textContent).toBe("Nigerian numbers have 10 digits after +234, e.g. 803 123 4567.");
      fireEvent.change(number(), { target: { value: "" } });
      expect(startButton().disabled).toBe(false);
      fireEvent.click(startButton());
      expect(api.calls.start).toEqual([{ fullName: "Ada Example", email: "ada@example.com", whatsapp: undefined, heardFrom: undefined }]);
    });

    it("reads a number saved before the country picker existed", async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ started: true, seen: [], history: [], answers: {}, contact: { fullName: "Ada Example", email: "ada@example.com", whatsapp: "+44 7700 900123", heardFrom: "" } }));
      render(React.createElement(BusinessCheck));
      await screen.findByText("First, who are we talking to?");
      expect(country().value).toBe("GB");
      expect(number().value).toBe("7700900123");
    });
  });

  it("asks the business's name and what it does inside the check, worded for an idea, and uses the name", async () => {
    render(React.createElement(BusinessCheck));
    await giveDetails();
    await pick(/questions/i);

    await pick(/I have an idea and haven't started/);
    await type("What will the business be called?", "Zobo Express");
    await pick(/^Continue/);
    expect(await screen.findByText("How will the business make money?")).toBeTruthy();
    expect(screen.getByText("Outline for Zobo Express")).toBeTruthy();
    await pick(/We make things/);
    await pick("Food and drink");
    expect(await screen.findByText("In one line, what is the idea?")).toBeTruthy();
    // Required: there is no Skip, and Continue waits for an answer.
    expect(screen.queryByRole("button", { name: /^Skip/ })).toBeNull();
    expect((screen.getByRole("button", { name: /^Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    await type("In one line, what is the idea?", "Zobo drinks delivered to offices in Lekki");
    await pick(/^Continue/);

    // Founder readiness opens with its meaning and an example for someone leaving a job.
    expect(await screen.findByText("Founder readiness", { selector: "h2" })).toBeTruthy();
    expect(screen.getByText(/do well in a job/)).toBeTruthy();
    await pick(/questions/i);
    await pick(/Take charge/);
    await pick(/Direct and results-driven/);
    await pick("On my own");
    await pick(/comes naturally/);
    await pick(/learned by doing/);
    await pick(/Read a profit and loss statement/);
    await pick(/^Continue/);
    await pick(/^5 or more/);

    expect(await screen.findByText("Strategic intent: your idea", { selector: "h2" })).toBeTruthy();
    expect(screen.getByText(/juice brand/)).toBeTruthy();
    expect(screen.queryByText("How long has it been trading?")).toBeNull();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).answers;
    expect(saved).toMatchObject({ p_stage: "idea", p_name: "Zobo Express", p_description: "Zobo drinks delivered to offices in Lekki" });
  });

  it("saves progress to the server shortly after each answer", async () => {
    render(React.createElement(BusinessCheck));
    await giveDetails();
    await pick(/questions/i);
    await pick(/I run my business full-time/);
    await waitFor(() => expect(api.calls.saveProgress.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(api.calls.saveProgress.at(-1)).toEqual({ token: TOKEN, answers: { p_stage: "operating" } });
  });

  it("moves on to the next question almost at once, on a spring that does not bounce", async () => {
    expect(ANSWER_PAUSE_MS).toBeLessThanOrEqual(150);
    expect(SCREEN_SPRING).toMatchObject({ type: "spring", bounce: 0 });
    render(React.createElement(BusinessCheck));
    await giveDetails();
    await pick(/questions/i);
    const option = await screen.findByRole("button", { name: /I run my business full-time/ });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(option);
      expect(option.getAttribute("aria-pressed")).toBe("true");
      act(() => { vi.advanceTimersByTime(ANSWER_PAUSE_MS); });
      expect(screen.getByText("What is the business called?")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats the phone's back gesture as Back: one question back, not out of the check", async () => {
    render(React.createElement(BusinessCheck));
    await giveDetails();
    await pick(/questions/i);
    await pick(/I run my business full-time/);
    await screen.findByText("What is the business called?");
    expect((window.history.state as Record<string, unknown>).shiftBusinessCheck).toBe(true);
    act(() => { window.dispatchEvent(new PopStateEvent("popstate", { state: null })); });
    expect(await screen.findByText("Which best describes you today?")).toBeTruthy();
    await waitFor(() => expect((window.history.state as Record<string, unknown> | null)?.shiftBusinessCheck).toBe(true));
  });

  it("goes back to the previous question", async () => {
    render(React.createElement(BusinessCheck));
    await giveDetails();
    await pick(/questions/i);
    await pick(/I run my business full-time/);
    await screen.findByText("What is the business called?");
    await pick(/back/i);
    expect(await screen.findByText("Which best describes you today?")).toBeTruthy();
  });

  it("steps back through every earlier answer and forward again in order, so no answer becomes unreachable", async () => {
    render(React.createElement(BusinessCheck));
    await giveDetails();
    await pick(/questions/i);
    await pick(/I have an idea and haven't started/);
    await type("What will the business be called?", "Zobo Express");
    await pick(/^Continue/);
    await pick(/We make things/);
    await pick("Food and drink");
    expect(await screen.findByText("In one line, what is the idea?")).toBeTruthy();

    // Back, one question at a time, all the way to the first.
    await pick(/back/i);
    expect(await screen.findByText("Which sector is it in?")).toBeTruthy();
    await pick(/back/i);
    expect(await screen.findByText("How will the business make money?")).toBeTruthy();
    await pick(/back/i);
    expect(await screen.findByText("What will the business be called?")).toBeTruthy();
    await pick(/back/i);
    expect(await screen.findByText("Which best describes you today?")).toBeTruthy();

    // Changing nothing and going forward again visits each answered question in turn, with its answer kept.
    await pick(/I have an idea and haven't started/);
    expect(await screen.findByText("What will the business be called?")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "What will the business be called?" }) as HTMLInputElement).value).toBe("Zobo Express");
    await pick(/^Continue/);
    expect(await screen.findByText("How will the business make money?")).toBeTruthy();
    await pick(/We make things/);
    expect(await screen.findByText("Which sector is it in?")).toBeTruthy();
    // And back from here still reaches the earlier ones.
    await pick(/back/i);
    expect(await screen.findByText("How will the business make money?")).toBeTruthy();
    await pick(/We make things/);
    await pick("Food and drink");
    expect(await screen.findByText("In one line, what is the idea?")).toBeTruthy();
  });

  it("asks for the details first when resuming a check started before they were given", async () => {
    preload({ answers: { p_stage: "operating" }, history: ["p_stage"], seen: ["profile"] });
    render(React.createElement(BusinessCheck));
    expect(await screen.findByText("First, who are we talking to?")).toBeTruthy();
  });

  it("sends the check straight after the last question, with no form at the end", async () => {
    const answers = completeWith({ p_stage: "operating", p_type: "trader", p_sector: "retail", p_age: "2to5", p_staff: "3to5", p_revenue: "3to5m", p_trend: "flat" });
    preload({ token: TOKEN, answers, history: Object.keys(answers), seen: ["profile", "founder", "intent", "market", "offer", "model", "sales", "operations", "finance", "risk"] });
    render(React.createElement(BusinessCheck));
    expect(await screen.findByText("Reading your answers")).toBeTruthy();
    await waitFor(() => expect(api.calls.submit).toEqual([{ token: TOKEN, answers }]));
    expect(screen.queryByText("Where should we send your summary?")).toBeNull();
  });

  const resultFor = (discoveryCallUrl = "") => {
    const answers = { p_stage: "operating", p_name: "Ada Foods", p_type: "maker", p_age: "2to5", p_staff: "6to10", p_revenue: "3to5m", f_instinct: "I", f_seen: "C", f_team: "solo", f_tough: "nobody", f_education: "degree", f_finance: ["pl", "cash"], f_hours: "lt2", s7_status: "tight_guess" };
    const result = evaluate(answers);
    const response = { token: TOKEN, result, summary: { found: "Found text for the test.", think: "Think text for the test.", next: "Book the free call.", offerings: [{ id: "financial-performance", name: "Financial Performance & Decision Support", why: "Your prices are guesses." }] }, summarySource: "AI", discoveryCallUrl, emailStatus: "Sent" };
    preload({ token: TOKEN, answers, response });
    render(React.createElement(BusinessCheck));
  };

  it("shows the summary, the outline, founder readiness in words and the services that fit", () => {
    resultFor();
    expect(screen.getByText("Findings")).toBeTruthy();
    expect(screen.getByText(/Your Business Check · Ada Foods/)).toBeTruthy();
    expect(screen.getByText("Think text for the test.")).toBeTruthy();
    expect(screen.getByText("7. Financials")).toBeTruthy();
    expect(screen.getByText("Finance & Capital")).toBeTruthy();
    // Founder readiness reads as sentences built from the answers, not abstract bars.
    expect(screen.getByText(/^Intermediate \(\d of 6\)$/)).toBeTruthy();
    expect(screen.getByText("You are confident with 2 of the 4 money basics. Cost per unit and margin are the ones to strengthen.")).toBeTruthy();
    expect(screen.getByText(/Others see you as careful and precise \(Analyst\)/)).toBeTruthy();
    expect(screen.queryByText(/ a analyst/i)).toBeNull();
    expect(screen.getByText(/Nobody in the business reliably makes the hard call/)).toBeTruthy();
  });

  it("shows the areas the check left out, greyed with the reason, so the whole method is visible", () => {
    resultFor();
    expect(screen.getByText("9. Exit and value")).toBeTruthy();
    expect(screen.getByText("Asked once the business has traded for five years.")).toBeTruthy();
    expect(screen.getByText("10. Owner transition")).toBeTruthy();
    expect(screen.getAllByText("Not assessed")).toHaveLength(2);
    expect(screen.getByText("Areas marked not assessed weren't part of this Business Check for your business. The Current State Assessment looks at all ten.")).toBeTruthy();
    const rows = Array.from(document.querySelectorAll("li")).map((item) => item.textContent ?? "").filter((text) => /^\d+\. /.test(text));
    expect(rows.map((text) => Number(text.split(".")[0]))).toEqual([...rows.map((text) => Number(text.split(".")[0]))].sort((a, b) => a - b));
  });

  it("links the Terms & Conditions and Privacy Policy before the owner gives their details, and before paying for the Full Report", async () => {
    render(React.createElement(BusinessCheck));
    await pick(/take the business check/i);
    expect(await screen.findByText("First, who are we talking to?")).toBeTruthy();
    const privacy = screen.getAllByRole("link", { name: "Privacy Policy" })[0];
    expect(privacy.getAttribute("href")).toBe("/privacy");
    // Leaving the form would lose what has been typed, so the policy opens beside it.
    expect(privacy.getAttribute("target")).toBe("_blank");
    expect(screen.getAllByRole("link", { name: "Terms & Conditions" })[0].getAttribute("href")).toBe("/terms");
    cleanup();
    resultFor();
    expect(screen.getByText(/By proceeding with payment, you agree to the/).textContent).toContain("acknowledge the Privacy Policy");
    expect(screen.getAllByRole("link", { name: "Terms & Conditions" }).some((link) => link.getAttribute("href") === "/terms")).toBe(true);
  });

  it("gives the ₦100,000 full report its own offer, with what is inside, and opens Paystack straight away", async () => {
    resultFor();
    expect(screen.getByText("The Business Check summary tells you where you stand. The Full Report tells you what to do about it.")).toBeTruthy();
    expect(screen.getByText("Your Full Report")).toBeTruthy();
    expect(screen.getByText("₦100,000", { selector: "p" })).toBeTruthy();
    expect(screen.getByText(/The root cause behind each red and amber/)).toBeTruthy();
    expect(screen.getByText("You pay securely on Paystack, by card, bank transfer or USSD, and come straight back.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /get my full report/i }));
    // Paystack is the only way to pay: no payment details email to wait for, no bank details, no proof to send.
    expect(api.calls.payStart).toEqual([{ token: TOKEN, item: "full_report" }]);
    expect(api.calls.requestNext).toEqual([]);
    expect(payOnline.rememberPayPage).toHaveBeenCalledWith(`/pay/${TOKEN}/full_report`);
    expect(payOnline.openCheckout).toHaveBeenCalledWith("https://checkout.paystack.com/TS-R-000001-1a2b3c4d");
    expect(await screen.findByRole("button", { name: /opening paystack/i })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/bank details|proof of payment|payment details are on their way/i);
  });

  it("says the Full Report is already paid instead of opening Paystack again", async () => {
    api.replies.payStart = () => ({ alreadyPaid: true });
    resultFor();
    fireEvent.click(screen.getByRole("button", { name: /get my full report/i }));
    expect(await screen.findByText("Your Full Report is already paid. The link to your Report Intake is in your email at ada@example.com.")).toBeTruthy();
    expect(payOnline.openCheckout).not.toHaveBeenCalled();
  });

  it("without a booking page configured, records the call request and never promises a WhatsApp call-back", async () => {
    resultFor("");
    // With no booking page, the button says what it does: it requests a call, it does not book one.
    expect(screen.queryByRole("button", { name: /book my free discovery call/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /request my free discovery call/i }));
    expect(api.calls.requestNext).toEqual([{ token: TOKEN, choice: "call" }]);
    expect(await screen.findByText("Thank you. Your request has been sent to the IPF team. We'll email you to agree a time.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/WhatsApp/);
  });

  it("books the call in an embedded Calendly calendar, and counts it as booked only when Calendly confirms", async () => {
    resultFor("https://calendly.com/ip-factory/discovery-call");
    fireEvent.click(screen.getByRole("button", { name: /book my free discovery call/i }));
    const calendar = (await screen.findByTitle("Book your free Discovery Call")) as HTMLIFrameElement;
    const src = new URL(calendar.src);
    expect(src.origin + src.pathname).toBe("https://calendly.com/ip-factory/discovery-call");
    expect(src.searchParams.get("name")).toBe("Ada Example");
    expect(src.searchParams.get("email")).toBe("ada@example.com");
    expect(api.calls.requestNext).toEqual([]);

    window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { event: "calendly.event_scheduled" } }));
    expect(api.calls.requestNext).toEqual([]);
    // Calendly's message names the booking; the server reads its time from Calendly.
    const uri = "https://api.calendly.com/scheduled_events/ABCDEF12-3456-7890";
    window.dispatchEvent(new MessageEvent("message", { origin: "https://calendly.com", data: { event: "calendly.event_scheduled", payload: { event: { uri }, invitee: { uri: `${uri}/invitees/X` } } } }));
    await waitFor(() => expect(api.calls.requestNext).toEqual([{ token: TOKEN, choice: "call", calendlyEventUri: uri }]));
    expect(await screen.findByText("Booked. The confirmation is on its way to ada@example.com.")).toBeTruthy();
  });

  it("offers the same calendar in a new tab when the embedded one is blocked, and records the request without claiming a booking", async () => {
    resultFor("https://calendly.com/ip-factory/discovery-call");
    fireEvent.click(screen.getByRole("button", { name: /book my free discovery call/i }));
    const link = (await screen.findByRole("link", { name: "Calendar not showing? Open it in a new tab" })) as HTMLAnchorElement;
    const href = new URL(link.href);
    expect(href.origin + href.pathname).toBe("https://calendly.com/ip-factory/discovery-call");
    expect(href.searchParams.get("name")).toBe("Ada Example");
    expect(href.searchParams.get("email")).toBe("ada@example.com");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(api.calls.requestNext).toEqual([]);

    fireEvent.click(link);
    expect(api.calls.requestNext).toEqual([{ token: TOKEN, choice: "call" }]);
    expect(await screen.findByText("We've opened the calendar in a new tab. Pick a time there and Calendly will email your confirmation to ada@example.com.")).toBeTruthy();
    expect(screen.queryByText(/^Booked\./)).toBeNull();
  });

  describe("result page, honest about email and about the call", () => {
    const answers = { p_stage: "operating", p_name: "Ada Foods", p_type: "maker", p_age: "2to5", p_staff: "6to10", p_revenue: "3to5m", f_instinct: "S", f_seen: "S", f_team: "solo", f_tough: "nobody", f_hours: "lt2", s7_status: "tight_guess" };
    const responseWith = (extra: Record<string, unknown>) => ({ token: TOKEN, result: evaluate(answers), summary: { found: "Found.", think: "Think.", next: "Next.", offerings: [] }, summarySource: "Rules", discoveryCallUrl: "", ...extra });

    it("says a copy was sent only when the email was actually sent", () => {
      preload({ token: TOKEN, answers, response: responseWith({ emailStatus: "Sent" }) });
      render(React.createElement(BusinessCheck));
      expect(screen.getByText(/A copy has been sent to/)).toBeTruthy();
      expect(screen.queryByText(/Email delivery is not active yet/)).toBeNull();
    });

    it.each([["Simulated"], ["Failed"], [undefined]])("does not claim an email was sent when delivery was %s", status => {
      preload({ token: TOKEN, answers, response: responseWith({ emailStatus: status }) });
      render(React.createElement(BusinessCheck));
      expect(screen.getByText("Your result has been saved. Email delivery is not active yet.")).toBeTruthy();
      expect(screen.queryByText(/on its way/)).toBeNull();
      expect(screen.queryByText(/A copy has been sent/)).toBeNull();
    });

    it("confirms the request without claiming a time has been booked", async () => {
      preload({ token: TOKEN, answers, response: responseWith({ emailStatus: "Simulated" }) });
      api.replies.requestNext = () => ({ success: true, choice: "call" });
      render(React.createElement(BusinessCheck));
      fireEvent.click(screen.getByRole("button", { name: /request my free discovery call/i }));
      expect(await screen.findByText("Thank you. Your request has been sent to the IPF team. We'll email you to agree a time.")).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/within one working day|your slot|is booked|has been booked|WhatsApp/i);
    });
  });
});
