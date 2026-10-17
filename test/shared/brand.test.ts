import { bookingTarget } from "@shared/booking";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND } from "@shared/brand";

describe("brand settings", () => {
  it("derives composite names from their parts so a rebrand stays consistent", () => {
    expect(BRAND.programmeFullName).toBe(`${BRAND.programmeName} ${BRAND.programmeTrack}`);
    expect(BRAND.senderDisplayName).toBe(`${BRAND.facilitatorName} | ${BRAND.programmeName}`);
    expect(BRAND.facilitatorFormalName).toContain(BRAND.facilitatorName);
  });

  it("uses well-formed mailbox addresses for programme and administration email", () => {
    for (const address of [BRAND.programmeMailbox, BRAND.administrationMailbox]) {
      expect(address).toMatch(/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });

  it("keeps the email/PDF brand colours in step with the UI colour tokens", () => {
    const css = readFileSync(new URL("../../client/src/index.css", import.meta.url), "utf8");
    const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase();
    expect(token("brand")).toBe(BRAND.colorBrand.toUpperCase());
    expect(token("brand-deep")).toBe(BRAND.colorBrandDeep.toUpperCase());
    for (const [name, value] of Object.entries(BRAND.palette)) {
      expect(token(name), `--color-${name}`).toBe(value.toUpperCase());
    }
  });
});

describe("product name", () => {
  const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

  it("is The Shift, written in full with its maker", () => {
    expect(BRAND.productName).toBe("The Shift");
    expect(BRAND.productEndorsement).toBe(`${BRAND.productName}, by ${BRAND.organisationName}`);
  });

  it("names the product in the page title and search description, without the retired headline", () => {
    const page = read("client/index.html");
    expect(page).toContain(`<title>${BRAND.productEndorsement} · Support for business owners</title>`);
    expect(page).toMatch(/<meta name="description" content="[^"]*The Shift, by IP Factory/);
    expect(page).not.toContain("You know what your business needs");
  });

  it("never puts \"your\" or \"a\" directly before the name, which already starts with \"The\"", () => {
    for (const file of ["client/src/pages/Home.tsx", "client/src/components/home/HomeSections.tsx", "client/src/pages/BusinessCheck.tsx"]) {
      expect(read(file), file).not.toMatch(/\b(your|a|an|the)\s+\{BRAND\.productName\}/i);
    }
    expect(read("client/src/pages/Home.tsx") + read("client/src/components/home/HomeSections.tsx")).not.toContain("Operating Partner");
  });
});

describe("discovery call booking page", () => {
  it("is IP Factory's Calendly event, so the result page embeds the calendar", () => {
    expect(BRAND.discoveryCallUrl).toBe("https://calendly.com/ipfactory-info/ipf-free-20-minute-discovery-call");
    const target = bookingTarget(BRAND.discoveryCallUrl, { name: "Ada Example", email: "ada@example.com" });
    expect(target.kind).toBe("calendly");
  });
});

describe("Business Support inbox", () => {
  it("sends business check notifications to info@ipfactory.co, separate from the JUMP programme mailbox", () => {
    expect(BRAND.businessSupportMailbox).toBe("info@ipfactory.co");
    expect(BRAND.businessSupportMailbox).not.toBe(BRAND.administrationMailbox);
  });
});
