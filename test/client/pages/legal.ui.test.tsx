/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { BRAND } from "@shared/brand";

// No server is mocked: the legal pages need no sign-in, so they must render without any API at all.
import { PrivacyPage, TermsPage } from "@/pages/LegalPage";

afterEach(cleanup);

const renderAt = (path: string) =>
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
    </Router>,
  );

const source = (name: string) => readFileSync(resolve(__dirname, "../../../docs/legal", name), "utf8");

describe("the legal pages", () => {
  it("shows the approved Terms & Conditions publicly, with every numbered section heading", () => {
    renderAt("/terms");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("IP Factory Terms & Conditions");
    expect(document.querySelector("article p")?.textContent).toBe("Effective date: 14 October 2026 | Contact: info@ipfactory.co");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toHaveLength(25);
    expect(headings[0]).toBe("1. About IP Factory");
    expect(headings).toContain("8. Refund, Cancellation and Service Credit Policy");
    expect(headings.at(-1)).toBe("25. Contact");
    expect(document.title).toBe("Terms & Conditions | The Shift, by IP Factory");
  });

  it("shows the approved Privacy Policy publicly, with its sections and subsections", () => {
    renderAt("/privacy");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("IP Factory Privacy Policy");
    expect(document.querySelector("article p")?.textContent).toBe("Effective date: 14 October 2026 | Privacy contact: info@ipfactory.co");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toHaveLength(24);
    expect(headings).toContain("16. Your Rights");
    expect(headings.at(-1)).toBe("24. Complaints and Contact");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "3.1 Personal and contact information", "3.2 Business information", "3.3 Account and security information",
      "3.4 Payment information", "3.5 Scheduling information", "3.6 Technical information",
    ]);
    expect(document.title).toBe("Privacy Policy | The Shift, by IP Factory");
  });

  it.each([["terms.md", "/terms"], ["privacy.md", "/privacy"]])("puts every sentence of %s on the page, unchanged", (file, path) => {
    renderAt(path);
    const page = (document.querySelector("article")?.textContent ?? "").replace(/\s+/g, " ");
    const lines = source(file).split("\n").map((line) => line.replace(/^(#{1,3} |- |> )/, "").replace(/\s+$/, "")).filter((line) => line && !line.startsWith("<!--"));
    expect(lines.length).toBeGreaterThan(40);
    for (const line of lines) expect(page).toContain(line.replace(/\s+/g, " "));
  });

  it("links to the other policy and the contact address in the footer, and offers no sign-in", () => {
    renderAt("/terms");
    const footer = document.querySelector("footer") as HTMLElement;
    expect(within(footer).getByRole("link", { name: "Terms & Conditions" }).getAttribute("href")).toBe("/terms");
    expect(within(footer).getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
  });

  it.each([["terms.md", "25. Contact"], ["privacy.md", "24. Complaints and Contact"]])("ends the contact section of %s with IP Factory's office address and mailbox", (file, heading) => {
    const contact = source(file).split(`## ${heading}`)[1];
    expect(contact).toContain(`IP Factory\n${BRAND.officeAddress.oneLine}\n${BRAND.businessSupportMailbox}`);
  });
});
