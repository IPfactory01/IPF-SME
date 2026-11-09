import { describe, expect, it } from "vitest";
import { BRAND } from "@shared/brand";
import { buildBusinessSupportEmailHtml } from "@server/emailTemplates";

describe("business support email layout", () => {
  const body = [
    "Dear Ada,",
    "",
    "Thank you for taking the IP Factory Business Health Check. Here is your summary.",
    "",
    "FINDINGS",
    "Sales are steady but cash is tight.",
    "",
    "YOUR BUSINESS OUTLINE",
    "• Strategy: clear",
    "• Money: stuck",
    "",
    "NEXT STEP",
    "Book the free call.",
    "Pick a time here: https://calendly.com/example/discovery.",
    "",
    "Name: Ada <script>alert(1)</script>",
    "Business: Example Stores",
    "",
    "Read more at https://example.com/shop?a=1&b=2.",
    "Here is the point: one line on its own stays a sentence.",
    "",
    "Bad link: javascript:alert(1)",
  ].join("\n");
  const html = buildBusinessSupportEmailHtml(body);

  it("shows the IP Factory logo beside The Shift, with the greeting and a preview line", () => {
    expect(html).toMatch(/<img src="cid:ipf-logo" width="96" height="90" alt="IP Factory"/);
    expect(html).toContain(">The Shift<");
    expect(html).toContain("The Shift, by IP Factory");
    expect(html).toContain("mailto:info@ipfactory.co");
    expect(html).toContain("<title>Thank you for taking the IP Factory Business Health Check. Here is your summary.</title>");
    expect(html).toMatch(/Georgia[^>]*>Dear Ada,<\/p>/);
    expect(html).not.toMatch(/JUMP|Genius Track|Emmanuel Tarfa/);
  });

  it("tells the owner how to reach a person: reply, or write to info@ipfactory.co", () => {
    expect(html).toContain("Questions? Reply to this email or write to info@ipfactory.co.");
  });

  it("uses only the brand palette: crimson labels, the cyan button with navy text and the logo's colour line", () => {
    const used = new Set(html.match(/#[0-9A-Fa-f]{6}/g)!.map((hex) => hex.toUpperCase()));
    const palette = new Set(Object.values(BRAND.palette).map((hex) => hex.toUpperCase()));
    expect([...used].filter((hex) => !palette.has(hex))).toEqual([]);
    expect(html).toMatch(new RegExp(`color:${BRAND.palette["highlight-ink"]};font-weight:700;">FINDINGS<`));
    expect(html).toMatch(new RegExp(`bgcolor="${BRAND.palette.highlight}"[^>]*><a [^>]*color:${BRAND.palette["brand-deep"]};[^>]*>Pick a time<`));
    for (const colour of [BRAND.palette["brand-plum"], BRAND.palette["highlight-ink"], BRAND.palette.highlight]) {
      expect(html).toContain(`height="4" bgcolor="${colour}"`);
    }
  });

  it("turns capitals into headings, bullets into a list and a lone address line into a button", () => {
    expect(html).toMatch(/text-transform:uppercase;[^>]*>FINDINGS<\/div>/);
    expect(html).toMatch(/&#8226;<\/td><td[^>]*>Strategy: clear<\/td>/);
    expect(html).toMatch(/<a href="https:\/\/calendly\.com\/example\/discovery"[^>]*>Pick a time<\/a>/);
  });

  it("puts runs of label lines in a table, escapes what people typed and links only web addresses", () => {
    expect(html).toMatch(/>Name<\/td><td[^>]*>Ada &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/td>/);
    expect(html).toContain('<a href="https://example.com/shop?a=1&amp;b=2"');
    expect(html).toContain("b=2</a>.");
    expect(html).not.toContain("<script>");
    expect(html).toMatch(/>Business<\/td><td[^>]*>Example Stores<\/td>/);
    expect(html).toContain("b=2</a>.<br />Here is the point: one line on its own stays a sentence.</p>");
    expect(html).not.toContain('href="javascript:');
  });
});
