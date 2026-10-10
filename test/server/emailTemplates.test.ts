import { describe, expect, it } from "vitest";
import { BRAND } from "@shared/brand";
import { buildBusinessSupportEmailHtml, buildDuplicatePathwayClarificationEmail, buildEngagementBriefInvitationEmail, buildInformationSessionInvitationEmail, buildRegistrationConfirmationEmail } from "@server/emailTemplates";

describe("registration confirmation presentation", () => {
  it("includes the screenshot-support guidance in both the plain-text and branded HTML variants", () => {
    const email = buildRegistrationConfirmationEmail({
      fullName: "Amina Founder",
      businessName: "Amina Ventures",
      businessModel: "Expert",
      packageName: "Foundation",
    });

    expect(email.body).toContain("kindly take a screenshot");
    expect(email.body).toContain("reply directly to this email");
    expect(email.html).toContain("kindly take a screenshot");
    expect(email.html).toContain("JUMP 2026");
  });
});

describe("Engagement Brief invitation presentation", () => {
  it("uses a secure password-setup link and screenshot-support guidance without exposing payment figures in the email", () => {
    const email = buildEngagementBriefInvitationEmail({
      fullName: "Amina Founder",
      businessName: "Amina Ventures",
      packageName: "Engine Room",
      portalUrl: "https://emmanueltarfa.com/portal",
    });

    expect(email.subject).toContain("Engine Room Engagement Brief");
    expect(email.body).not.toContain("₦875,000");
    expect(email.body).not.toContain("₦350,000 (40%)");
    expect(email.body).not.toContain("30% by the end of September");
    expect(email.body).toContain("set your participant password");
    expect(email.body).toContain("expires after 20 minutes");
    expect(email.body).toContain("starting hypothesis");
    expect(email.body).toContain("Your private payment guidance is available alongside this brief");
    expect(email.body).toContain("You can begin the assessment before payment");
    expect(email.body).toContain("initial get-to-know-you diagnostic");
    expect(email.body).toContain("Before each class, I will ask further focused questions");
    expect(email.body).toContain("We have digitised this engagement");
    expect(email.body).toContain("kindly use a laptop whenever possible");
    expect(email.html).toContain("Set my portal password");
    expect(email.html).toContain("potential challenge");
    expect(email.html).toContain("kindly take a screenshot");
    expect(email.html).toContain("https://emmanueltarfa.com/portal");
    expect(email.html).not.toContain("₦875,000");
    expect(email.html).not.toContain("₦350,000 (40%)");
    expect(email.html).toContain("meeting recordings can live in one private place");
    expect(email.html).toContain("initial get-to-know-you diagnostic");
    expect(email.html).toContain("Before each class, I will ask further focused questions");
    expect(email.html).toContain("expires in 20 minutes");
  });

  it("reconciles duplicate pathway entries into one clear Boardroom-only participant instruction", () => {
    const email = buildDuplicatePathwayClarificationEmail({
      fullName: "Tobi Adeyemi",
      businessName: "Tobi Bloom Studio",
      packageName: "Boardroom",
      portalUrl: "https://emmanueltarfa.com/portal/access?token=boardroom-only",
    });

    expect(email.subject).toContain("Boardroom registration is confirmed");
    expect(email.body).toContain("recognised two entries");
    expect(email.body).toContain("retained your Boardroom registration only");
    expect(email.body).toContain("Please disregard the earlier lower-pathway email");
    expect(email.body).toContain("initial get-to-know-you diagnostic");
    expect(email.body).toContain("laptop or desktop");
    expect(email.html).toContain("Boardroom journey is confirmed");
    expect(email.html).toContain("Set my participant password");
    expect(email.body).toContain("expires after 20 minutes");
  });

  it("describes the Engagement Brief portal link as a time-limited password setup action", () => {
    const email = buildEngagementBriefInvitationEmail({
      fullName: "Amina Founder",
      businessName: "Amina Ventures",
      packageName: "Foundation",
      portalUrl: "https://emmanueltarfa.com/portal/access?token=personal-token",
    });

    expect(email.body).toContain("sign in normally");
    expect(email.html).toContain("Set my portal password");
    expect(email.body).not.toContain("opens your portal directly");
  });
});

describe("Information Session invitation presentation", () => {
  it("sets the confirmed Lagos date, Meet route, attendance response, personal purpose and recording assurance", () => {
    const email = buildInformationSessionInvitationEmail({
      fullName: "Amina Founder",
      meetUrl: "https://meet.google.com/abc-defg-hij",
    });

    expect(email.subject).toContain("Information Session & Briefing");
    expect(email.body).toContain("Sunday, 23 August 2026");
    expect(email.body).toContain("7:00–8:00 pm (Lagos time)");
    expect(email.body).toContain("Google Calendar invitation");
    expect(email.body).toContain("Yes, No or Maybe");
    expect(email.body).toContain("session will be recorded");
    expect(email.body).toContain("private participant portal");
    expect(email.body).toContain("Having interacted with some individuals already");
    expect(email.body).toContain("already clear on what you want and ready to move forward");
    expect(email.body).not.toContain("instance of the JUMP Admin Team");
    expect(email.html).toContain("Join the Information Session");
    expect(email.html).toContain("https://meet.google.com/abc-defg-hij");
    expect(email.html).toContain("JUMP 2026 community");
    expect(email.html).toContain("A personal invitation from Emmanuel Tarfa");
  });
});

describe("business support email layout", () => {
  const body = [
    "Dear Ada,",
    "",
    "Thank you for taking the IP Factory Business Check. Here is your summary.",
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
    expect(html).toContain("<title>Thank you for taking the IP Factory Business Check. Here is your summary.</title>");
    expect(html).toMatch(/Georgia[^>]*>Dear Ada,<\/p>/);
    expect(html).not.toMatch(/JUMP|Genius Track|Emmanuel Tarfa/);
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
