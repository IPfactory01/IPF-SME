/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { sampleIntake } from "../../fixtures/reportIntake";

const api = vi.hoisted(() => ({
  form: undefined as unknown,
  formError: undefined as { message: string } | undefined,
  submitCalls: [] as unknown[],
  downloadCalls: [] as unknown[],
  saved: [] as unknown[],
}));

vi.mock("@/lib/savePdf", () => ({ savePdf: (...args: unknown[]) => api.saved.push(args) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    fullReport: {
      form: { useQuery: () => ({ data: api.form, isLoading: false, error: api.formError }) },
      submit: {
        useMutation: (options: { onSuccess?: (value: unknown) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.submitCalls.push(input);
            options.onSuccess?.({ delivered: true, deliveryStatus: "Simulated", fileName: "Adunni-Fabrics-full-business-check-report.pdf", pdf: "JVBERi0=" });
          },
        }),
      },
      download: {
        useMutation: (options: { onSuccess?: (value: unknown) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.downloadCalls.push(input);
            options.onSuccess?.({ fileName: "report.pdf", pdf: "JVBERi0=" });
          },
        }),
      },
    },
  },
}));

import FullReportPage from "@/pages/FullReportPage";

const renderPage = () => {
  const { hook } = memoryLocation({ path: "/report/TOKEN123" });
  return render(<Router hook={hook}><Route path="/report/:token" component={FullReportPage} /></Router>);
};
const group = (name: string) => within(screen.getByRole("radiogroup", { name }));
const choose = (name: string, label: string) => fireEvent.click(group(name).getByRole("radio", { name: label }));
const tick = (name: string, label: string) => fireEvent.click(within(screen.getByRole("group", { name })).getByRole("checkbox", { name: label }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** Answers the form as the fictional fabric retailer in test/fixtures/reportIntake.ts. */
function fill() {
  type("Where you sell from", sampleIntake.location);
  choose("Registration", "A registered business name (CAC)");
  sampleIntake.products.forEach((product, index) => {
    type(`Product or service ${index + 1}`, product.name);
    if (product.basis === "varies") choose(`How you charge for product or service ${index + 1}`, "It varies");
    if (product.price !== null) type(`Price of product or service ${index + 1}`, String(product.price));
  });
  type("Your best customer", sampleIntake.bestCustomer);
  sampleIntake.competitors.forEach((name, index) => type(`Competitor ${index + 1}`, name));
  choose("Your prices against competitors", "Lower than theirs");
  choose("Top earner", "Lace fabric (5 yards)");
  choose("Direct cost share", "₦50 to ₦75");
  choose("Share from three biggest customers", "A fifth to a half");
  tick("Where new customers come from", "Word of mouth");
  tick("Where new customers come from", "Walk-ins to a shop or office");
  tick("Where new customers come from", "Social media (Instagram, TikTok, Facebook, WhatsApp status)");
  choose("Enquiries a month", "50 to 200");
  fireEvent.change(screen.getByLabelText("How many of every 10 buy"), { target: { value: "3" } });
  choose("Do customers come back", "Most come back, but not often");
  type("Who does what", sampleIntake.roles);
  tick("Tools", "WhatsApp for orders or the team");
  tick("Tools", "Paper records");
  type("Money in last month", "2,400,000");
  type("Running costs last month", "2150000");
  choose("Biggest cost", "Stock or materials");
  choose("Cash in the bank today", "₦500,000 to ₦2 million");
  choose("Money customers owe you", "Less than ₦1 million");
  choose("Loans", "None");
  type("Your goal for the next 12 months", sampleIntake.goal);
}

beforeEach(() => {
  api.form = { status: "awaiting_intake", fullName: "Adunni Example", businessName: "Adunni Fabrics", email: "adunni@example.com", deliveredAt: null };
  api.formError = undefined;
  api.submitCalls = [];
  api.downloadCalls = [];
  api.saved = [];
});
afterEach(cleanup);

describe("the report form", () => {
  it("says so when the link is not valid", () => {
    api.form = undefined;
    api.formError = { message: "This report link is not valid. Use the link in your payment confirmation email, or reply to it for help." };
    renderPage();
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeTruthy();
  });

  it("tells the owner what happens, and numbers all 17 questions", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Adunni, seventeen questions and your report is done");
    expect(screen.getByText(/emailed to/).textContent).toContain("adunni@example.com");
    expect(screen.getByText(/the moment you finish/)).toBeTruthy();
    expect(screen.getAllByRole("group").filter(element => element.tagName === "FIELDSET")).toHaveLength(17);
    expect(screen.getByText("of 17 answered").textContent).toContain("0 of 17 answered");
  });

  it("names the question to fix, and sends nothing until the form is complete", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    expect(screen.getByRole("alert").textContent).toBe("Question 1: Tell us where you sell from.");
    expect(api.submitCalls).toEqual([]);
  });

  it("asks for competitors, or an explicit don't know", () => {
    renderPage();
    fill();
    sampleIntake.competitors.forEach((_, index) => type(`Competitor ${index + 1}`, ""));
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    expect(screen.getByRole("alert").textContent).toBe("Question 5: Name at least one competitor, or tick that you don't know who they are.");
    fireEvent.click(screen.getByLabelText("I don't know who they are"));
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    expect(api.submitCalls).toEqual([{ token: "TOKEN123", intake: { ...sampleIntake, competitors: [] } }]);
  });

  it("sends exactly what the owner answered, then offers the report to download", () => {
    renderPage();
    fill();
    expect(screen.getByText("of 17 answered").textContent).toContain("17 of 17 answered");
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    expect(api.submitCalls).toEqual([{ token: "TOKEN123", intake: sampleIntake }]);
    expect(screen.getByRole("heading", { name: "Your report is on its way" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /download your report/i }));
    expect(api.saved).toEqual([["Adunni-Fabrics-full-business-check-report.pdf", "JVBERi0="]]);
  });

  it("asks how each product is charged, and names the one whose price is missing", () => {
    renderPage();
    fill();
    type("Price of product or service 2", "");
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    expect(screen.getByRole("alert").textContent).toBe("Question 3: Enter the price of Lace fabric (5 yards), or choose It varies.");
    expect(api.submitCalls).toEqual([]);
    // The charge choice shows for a line only once it has a name.
    type("Product or service 3", "");
    expect(screen.queryByRole("radiogroup", { name: "How you charge for product or service 3" })).toBeNull();
  });

  it("takes a percentage of the deal for a commission or success fee, and asks the money questions about fees", () => {
    renderPage();
    fill();
    expect(screen.getByRole("group", { name: "Out of every ₦100 a customer pays you, how much goes on materials, stock or the direct labour to deliver it?" })).toBeTruthy();
    type("Product or service 1", "Deal advisory for mining buyers");
    choose("How you charge for product or service 1", "A percentage of the deal");
    expect(screen.queryByLabelText("Price of product or service 1")).toBeNull();
    fireEvent.change(screen.getByLabelText("Percentage of the deal for product or service 1"), { target: { value: "2.5%" } });
    type("Typical deal size for product or service 1", "50,000,000");
    expect(screen.getByRole("group", { name: "Out of every ₦100 you earn in commission and fees, how much goes on delivering the deal?" })).toBeTruthy();
    expect(screen.getByText(/Count only your commission and fees, not the deal money you pass on to others/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    const [{ intake }] = api.submitCalls as { intake: typeof sampleIntake }[];
    expect(intake.products[0]).toEqual({ name: "Deal advisory for mining buyers", basis: "percent", price: null, percent: 2.5, dealSize: 50_000_000 });
  });

  it("asks for the percentage when a line is charged by the deal", () => {
    renderPage();
    fill();
    choose("How you charge for product or service 1", "A percentage of the deal");
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    expect(screen.getByRole("alert").textContent).toBe("Question 3: Enter the percentage of the deal you earn on Ankara fabric (6 yards).");
  });

  it("lets the owner type a margin instead of choosing a band, and picks the band for them", () => {
    renderPage();
    fill();
    fireEvent.change(screen.getByLabelText("Your margin"), { target: { value: "20" } });
    expect(group("Direct cost share").getByRole("radio", { name: "More than ₦75" }).getAttribute("aria-checked")).toBe("true");
    // Choosing a band clears the typed margin; typing a margin chooses the band again.
    choose("Direct cost share", "₦25 to ₦50");
    expect((screen.getByLabelText("Your margin") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Your margin"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /send me my report/i }));
    expect(api.submitCalls).toEqual([{ token: "TOKEN123", intake: { ...sampleIntake, costShare: "over_75", marginPercent: 20 } }]);
  });

  it("offers the report again once it has been sent", () => {
    api.form = { status: "delivered", fullName: "Adunni Example", businessName: "Adunni Fabrics", email: "adunni@example.com", deliveredAt: new Date() };
    renderPage();
    expect(screen.getByRole("heading", { name: "Your report has been sent" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /send me my report/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /download your report/i }));
    expect(api.downloadCalls).toEqual([{ token: "TOKEN123" }]);
    expect(api.saved).toEqual([["report.pdf", "JVBERi0="]]);
  });
});
