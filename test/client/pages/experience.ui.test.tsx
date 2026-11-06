/** @vitest-environment jsdom */

import { cleanup, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVOIDED_WORDS, renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: ExperiencePage } = await import("@/pages/ExperiencePage");
const { BRAND } = await import("@shared/brand");

afterEach(cleanup);

describe("Experience (/experience)", () => {
  it("states the track record from the brand settings", () => {
    renderAt("/experience", ExperiencePage);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("We have done this before, many times.");
    const record = screen.getByRole("region", { name: "Our track record" });
    for (const text of ["250+", "clients advised", "50+", "years of partner experience", "Since 2011", `${BRAND.trackRecord.sectors.length}`, "sectors of the economy"]) expect(record.textContent).toContain(text);
  });

  it("names the parent firm and the sectors, links the firm when its address is set, and never names a partner", () => {
    const { container } = renderAt("/experience", ExperiencePage);
    const section = container.querySelector("#experience")!;
    expect(section.textContent).toContain(`the delivery and method arm of ${BRAND.trackRecord.groupName}, an established Nigerian management consulting firm`);
    expect(section.textContent).toContain("The same method we use with larger clients. Run at the size and the price that fits your business.");
    const sectors = within(screen.getByRole("list", { name: "Sectors we have worked in" })).getAllByRole("listitem").map((item) => item.textContent);
    expect(sectors).toEqual(BRAND.trackRecord.sectors);
    const link = screen.queryByRole("link", { name: BRAND.trackRecord.groupName });
    if (BRAND.trackRecord.groupUrl) {
      expect(link?.getAttribute("href")).toBe(BRAND.trackRecord.groupUrl);
      expect(link?.getAttribute("rel")).toContain("noopener");
    } else expect(link).toBeNull();
    expect(container.textContent).not.toMatch(/Tarfa|Anago|Kurumi/i);
  });

  it("shows the client logos once, each file on the site and named for screen readers, as work done rather than an endorsement", () => {
    renderAt("/experience", ExperiencePage);
    const list = screen.getByRole("list", { name: "Client logos" });
    expect(within(list).getAllByRole("img").map((logo) => logo.getAttribute("aria-label"))).toEqual(BRAND.trackRecord.clientLogos.map((client) => client.name));
    for (const tile of within(list).getAllByRole("listitem")) expect(tile.querySelector("img")!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText(`The team behind ${BRAND.productName} has worked with`)).toBeTruthy();
    expect(list.parentElement!.textContent).not.toMatch(/trusted|partner|endorse/i);
    expect(new Set(BRAND.trackRecord.clientLogos.map((client) => client.name)).size).toBe(BRAND.trackRecord.clientLogos.length);
    for (const client of BRAND.trackRecord.clientLogos) {
      for (const file of [client.src, client.mono]) {
        const path = resolve(process.cwd(), "client/public", file.slice(1));
        expect(existsSync(path)).toBe(true);
        // width and height must be the file's real pixel size, or the optical sizing is wrong (PNG header, IHDR).
        const header = readFileSync(path);
        expect([header.readUInt32BE(16), header.readUInt32BE(20)]).toEqual([client.width, client.height]);
      }
    }
  });

  it("backs the method with sourced research, in the site's words", () => {
    const { container } = renderAt("/experience", ExperiencePage);
    const research = container.querySelector("#research")!.textContent!;
    for (const source of ["PwC MSME Survey, 2024", "World Bank, Nigeria, 2022", "Field trial of 852 owners, 2018"]) expect(research).toContain(source);
    expect(container.textContent).not.toMatch(AVOIDED_WORDS);
    expect(`${research} ${container.querySelector("#experience")!.textContent}`).not.toMatch(/\b(framework|strategic|solutions?|leverage|holistic)\b/i);
  });
});
