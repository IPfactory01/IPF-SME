import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bookingTarget, isCalendlyBooking, calendlyEventUri } from "@shared/booking";

describe("booking the free discovery call", () => {
  it("embeds a Calendly link with the owner's name and email filled in", () => {
    const target = bookingTarget("https://calendly.com/ip-factory/discovery-call", { name: "Ada Example", email: "ada@example.com", host: "ipfactory.co" });
    expect(target.kind).toBe("calendly");
    if (target.kind !== "calendly") return;
    const embed = new URL(target.embedUrl);
    expect(embed.origin + embed.pathname).toBe("https://calendly.com/ip-factory/discovery-call");
    expect(Object.fromEntries(embed.searchParams)).toMatchObject({ name: "Ada Example", email: "ada@example.com", embed_domain: "ipfactory.co", embed_type: "Inline" });
  });

  it("also gives a plain link to the same Calendly page with the details filled in, for when the embed is blocked", () => {
    const target = bookingTarget("https://calendly.com/ipfactory-info/ipf-free-20-minute-discovery-call", { name: "Ada Example", email: "ada@example.com", host: "www.ipfactory.co" });
    if (target.kind !== "calendly") throw new Error("expected a Calendly target");
    const open = new URL(target.openUrl);
    expect(open.origin + open.pathname).toBe("https://calendly.com/ipfactory-info/ipf-free-20-minute-discovery-call");
    expect(open.searchParams.get("name")).toBe("Ada Example");
    expect(open.searchParams.get("email")).toBe("ada@example.com");
    // Embed settings belong to the inline calendar only.
    expect(open.searchParams.has("embed_type")).toBe(false);
    expect(open.searchParams.has("embed_domain")).toBe(false);
  });

  it("opens any other https booking page (Microsoft Bookings, Google, Cal.com) as a link", () => {
    expect(bookingTarget("https://outlook.office365.com/book/IPFactory@example.com/")).toEqual({ kind: "link", pageUrl: "https://outlook.office365.com/book/IPFactory@example.com/" });
  });

  it("treats a missing, malformed or non-https link as not configured", () => {
    for (const url of [undefined, "", "not a url", "http://calendly.com/x", "javascript:alert(1)"]) expect(bookingTarget(url).kind, String(url)).toBe("none");
  });

  it("only accepts the booking confirmation from Calendly itself", () => {
    const data = { event: "calendly.event_scheduled", payload: {} };
    expect(isCalendlyBooking({ origin: "https://calendly.com", data })).toBe(true);
    expect(isCalendlyBooking({ origin: "https://evil.example", data })).toBe(false);
    expect(isCalendlyBooking({ origin: "https://calendly.com", data: { event: "calendly.page_height" } })).toBe(false);
    expect(isCalendlyBooking({ origin: "https://calendly.com", data: null })).toBe(false);
  });

  it("allows the Calendly calendar in the site's content security policy, on Vercel and on the Node server", () => {
    const vercel = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
    const server = readFileSync(resolve(process.cwd(), "server/security.ts"), "utf8");
    for (const policy of [vercel, server]) expect(policy).toMatch(/frame-src [^;"]*https:\/\/calendly\.com/);
  });
});

describe("calendlyEventUri", () => {
  it("reads the booking's address from Calendly's message, and nothing else", () => {
    const uri = "https://api.calendly.com/scheduled_events/ABCDEF12-3456-7890";
    expect(calendlyEventUri({ event: "calendly.event_scheduled", payload: { event: { uri }, invitee: { uri: `${uri}/invitees/X` } } })).toBe(uri);
    expect(calendlyEventUri({ event: "calendly.event_scheduled" })).toBeUndefined();
    expect(calendlyEventUri({ payload: { event: { uri: "https://evil.example/x" } } })).toBeUndefined();
    expect(calendlyEventUri(null)).toBeUndefined();
  });
});
