import { BRAND } from "../shared/brand";
import { ENV } from "./_core/env";
import { EMAIL_LOGO_CID, EMAIL_LOGO_SIZE } from "./emailLogo";
export type BrandedEmailDetails = {
  label: string;
  value: string;
};

export type BrandedEmailInput = {
  label?: string;
  title: string;
  preheader?: string;
  greeting?: string;
  paragraphs: string[];
  details?: BrandedEmailDetails[];
  callout?: string;
  cta?: { label: string; url: string };
  footerNote?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toParagraphHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function safeHref(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? escapeHtml(parsed.toString()) : "";
  } catch {
    return "";
  }
}

/**
 * Produces a conservative table-based email that renders reliably in Gmail and narrow mobile clients.
 * The responsive container and spacing are intentionally inline because major email clients strip CSS.
 */
export function buildBrandedEmailHtml(input: BrandedEmailInput) {
  const preheader = escapeHtml(input.preheader || input.title);
  const label = input.label ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;color:#B45309;font-weight:700;margin:0 0 12px;">${escapeHtml(input.label)}</div>` : "";
  const greeting = input.greeting ? `<p style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:28px;color:#18212D;">${toParagraphHtml(input.greeting)}</p>` : "";
  const paragraphs = input.paragraphs.map((paragraph) => `<p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#344154;word-break:normal;overflow-wrap:break-word;">${toParagraphHtml(paragraph)}</p>`).join("");
  const details = input.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 22px;background:#F8FAFC;border:1px solid #D8E2EC;border-radius:8px;">${input.details.map((detail) => `<tr><td style="padding:11px 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:17px;letter-spacing:.7px;text-transform:uppercase;color:#5F7083;font-weight:700;">${escapeHtml(detail.label)}</td></tr><tr><td style="padding:3px 14px 11px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:23px;color:#18212D;word-break:normal;overflow-wrap:break-word;">${toParagraphHtml(detail.value)}</td></tr>`).join("")}</table>`
    : "";
  const callout = input.callout ? `<div style="margin:0 0 22px;padding:15px 16px;background:#FFF7E7;border-left:4px solid #F59E0B;border-radius:0 8px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#5B4214;word-break:normal;overflow-wrap:break-word;">${toParagraphHtml(input.callout)}</div>` : "";
  const href = input.cta ? safeHref(input.cta.url) : "";
  const cta = input.cta && href
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td bgcolor="#F59E0B" style="border-radius:7px;"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:700;color:#172033;text-decoration:none;border-radius:7px;">${escapeHtml(input.cta.label)}</a></td></tr></table>`
    : "";
  const footerNote = input.footerNote ? `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#68778A;word-break:normal;overflow-wrap:break-word;">${toParagraphHtml(input.footerNote)}</p>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;padding:0;background:#F3F0EA;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${preheader}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#F3F0EA;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background:#FFFFFF;border-radius:12px;overflow:hidden;"><tr><td style="padding:24px 28px;background:${BRAND.colorBrand};"><div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:30px;font-weight:700;letter-spacing:.2px;color:#FFFFFF;">${BRAND.programmeName}</div><div style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;letter-spacing:1.15px;text-transform:uppercase;color:#DCE9F4;">Strategy &amp; Innovation Genius Track</div></td></tr><tr><td style="padding:30px 28px 24px;">${label}<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:29px;line-height:36px;font-weight:700;color:#18212D;word-break:normal;">${escapeHtml(input.title)}</h1>${greeting}${paragraphs}${details}${callout}${cta}${footerNote}</td></tr><tr><td style="padding:18px 28px 22px;background:#F8FAFC;border-top:1px solid #E1E8EF;"><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#68778A;">${BRAND.facilitatorName} &nbsp;|&nbsp; ${BRAND.programmeName} Strategy &amp; Innovation Genius Track</p></td></tr></table></td></tr></table></body></html>`;
}

/** Gives historic or admin-composed plain-text messages a readable HTML shell without changing their text fallback. */
export function buildPlainTextEmailHtml(body: string) {
  const blocks = body.trim().split(/\n\s*\n/).filter(Boolean);
  const first = blocks[0] || BRAND.programmeName;
  const greeting = /^dear\s+/i.test(first) ? first : undefined;
  return buildBrandedEmailHtml({
    label: `${BRAND.programmeName} communication`,
    title: greeting ? `A message from ${BRAND.facilitatorName}` : `${BRAND.programmeName} update`,
    greeting,
    paragraphs: greeting ? blocks.slice(1) : blocks,
  });
}

const URL_IN_TEXT = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/;
const SECTION_HEADING = /^(?:[A-Z][A-Z0-9 &'’,-]{2,40}|[^:]{1,60}:)$/;
const DETAIL_LINE = /^([A-Z][^:.?!]{0,39}):\s+(.+)$/;
const LINK_LINE = /^([^:]{1,60}):\s*(https?:\/\/\S+?)[.,;!?)]*$/;
const BULLET_LINE = /^[•*-]\s+/;

/** The site's theme tokens (BRAND.palette mirrors client/src/index.css), so email never drifts from the brand. */
const C = BRAND.palette;
const SANS = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";
const SERIF = "'Playfair Display',Georgia,'Times New Roman',serif";

/** Escapes text and turns any web address in it into a link. */
function linkify(text: string) {
  return text.split(URL_IN_TEXT).map((part, index) => {
    if (index % 2 === 0) return escapeHtml(part);
    const href = safeHref(part);
    return href ? `<a href="${href}" target="_blank" style="color:${C.brand};text-decoration:underline;">${escapeHtml(part)}</a>` : escapeHtml(part);
  }).join("");
}

/**
 * The HTML for IP Factory's business support email (business check summaries, office notices, call and report
 * requests). It is built from the plain-text body, so the text and HTML versions always say the same thing:
 * a "Dear …," opening becomes the greeting, CAPITALS or "Heading:" lines become section headings, runs of
 * "Label: value" lines a details table, "• " lines a list, and a lone "Label: https://…" line a button.
 *
 * It follows the site: the IP Factory logo beside "The Shift" as in the site header, the plum, crimson and cyan line
 * from the logo, crimson section labels, the cyan button with navy text, and only BRAND.palette colours. The logo is
 * embedded in the email (cid:ipf-logo); resendRequestBody attaches it. JUMP email keeps buildPlainTextEmailHtml.
 */
export function buildBusinessSupportEmailHtml(body: string) {
  const text = `font-family:${SANS};font-size:16px;line-height:25px;color:${C["ink-soft"]};word-break:normal;overflow-wrap:break-word;`;
  const blocks = body.trim().split(/\n\s*\n/).filter(Boolean);
  const greeting = blocks[0] && /^dear\s+/i.test(blocks[0]) ? blocks.shift()! : "";
  const title = blocks[0]?.split("\n")[0] ?? BRAND.productName;

  const renderBlock = (block: string) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const html: string[] = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      const link = line.match(LINK_LINE);
      if (link && safeHref(link[2])) {
        html.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr><td bgcolor="${C.highlight}" style="background:${C.highlight};"><a href="${safeHref(link[2])}" target="_blank" style="display:inline-block;padding:15px 26px;font-family:${SANS};font-size:13px;line-height:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C["brand-deep"]};text-decoration:none;">${escapeHtml(link[1].replace(/\s+here$/i, ""))}</a></td></tr></table>`);
        index += 1;
        continue;
      }
      if (SECTION_HEADING.test(line) && !BULLET_LINE.test(line)) {
        html.push(`<div style="margin:8px 0 8px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:1.6px;text-transform:uppercase;color:${C["highlight-ink"]};font-weight:700;">${escapeHtml(line.replace(/:$/, ""))}</div>`);
        index += 1;
        continue;
      }
      if (BULLET_LINE.test(line)) {
        const items: string[] = [];
        while (index < lines.length && BULLET_LINE.test(lines[index])) items.push(lines[index++].replace(BULLET_LINE, ""));
        html.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">${items.map((item) => `<tr><td valign="top" style="width:18px;padding:0 0 6px;${text}color:${C.highlight};font-weight:700;">&#8226;</td><td style="padding:0 0 6px;${text}">${linkify(item)}</td></tr>`).join("")}</table>`);
        continue;
      }
      // Two or more "Label: value" lines in a row read as a details table; one on its own stays a sentence.
      let end = index;
      while (end < lines.length && DETAIL_LINE.test(lines[end]) && !LINK_LINE.test(lines[end])) end += 1;
      if (end - index >= 2) {
        const rows = lines.slice(index, end).map((detail) => detail.match(DETAIL_LINE)!);
        html.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;background:${C["brand-tint-softer"]};border:1px solid ${C["brand-line"]};">${rows.map(([, label, value]) => `<tr><td valign="top" style="padding:10px 12px;width:34%;font-family:${SANS};font-size:12px;line-height:18px;letter-spacing:.4px;color:${C["brand-slate"]};font-weight:700;border-bottom:1px solid ${C["brand-line"]};">${escapeHtml(label)}</td><td style="padding:10px 12px;font-family:${SANS};font-size:14px;line-height:20px;color:${C.ink};border-bottom:1px solid ${C["brand-line"]};word-break:normal;overflow-wrap:break-word;">${linkify(value)}</td></tr>`).join("")}</table>`);
        index = end;
        continue;
      }
      const paragraph: string[] = [];
      while (index < lines.length) {
        const next = lines[index];
        const startsDetails = DETAIL_LINE.test(next) && index + 1 < lines.length && DETAIL_LINE.test(lines[index + 1]);
        if (paragraph.length && (LINK_LINE.test(next) || SECTION_HEADING.test(next) || BULLET_LINE.test(next) || startsDetails)) break;
        paragraph.push(linkify(next));
        index += 1;
      }
      html.push(`<p style="margin:0 0 18px;${text}">${paragraph.join("<br />")}</p>`);
    }
    return html.join("");
  };

  const greetingHtml = greeting ? `<p style="margin:0 0 18px;font-family:${SERIF};font-size:20px;line-height:28px;color:${C.ink};">${linkify(greeting)}</p>` : "";
  const content = blocks.map(renderBlock).join("");
  // The logo line: plum to crimson to cyan as in the logo; solid segments where a client ignores gradients.
  const rule = `<tr><td style="padding:0;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td height="4" bgcolor="${C["brand-plum"]}" style="height:4px;width:33%;background:${C["brand-plum"]};background-image:linear-gradient(90deg,${C["brand-plum"]},${C["highlight-ink"]});font-size:0;line-height:0;">&nbsp;</td><td height="4" bgcolor="${C["highlight-ink"]}" style="height:4px;width:34%;background:${C["highlight-ink"]};background-image:linear-gradient(90deg,${C["highlight-ink"]},${C.highlight});font-size:0;line-height:0;">&nbsp;</td><td height="4" bgcolor="${C.highlight}" style="height:4px;width:33%;background:${C.highlight};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;
  const header = `<tr><td style="padding:22px 28px 20px;background:${C["paper-raised"]};"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding:0 16px 0 0;"><img src="cid:${EMAIL_LOGO_CID}" width="${EMAIL_LOGO_SIZE.width}" height="${EMAIL_LOGO_SIZE.height}" alt="${escapeHtml(BRAND.organisationName)}" style="display:block;border:0;outline:none;text-decoration:none;width:${EMAIL_LOGO_SIZE.width}px;height:${EMAIL_LOGO_SIZE.height}px;font-family:${SANS};font-size:16px;font-weight:700;color:${C.brand};" /></td><td valign="middle" style="padding:4px 0 4px 16px;border-left:1px solid ${C.line};font-family:${SANS};font-size:12px;line-height:16px;letter-spacing:2.4px;text-transform:uppercase;font-weight:700;color:${C["ink-muted"]};">${escapeHtml(BRAND.productName)}</td></tr></table></td></tr>`;
  const footer = `<tr><td style="padding:18px 28px 22px;background:${C["brand-tint-softer"]};border-top:1px solid ${C.line};"><p style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${C["ink-muted"]};">${escapeHtml(BRAND.productEndorsement)} &nbsp;|&nbsp; <a href="mailto:${BRAND.businessSupportMailbox}" style="color:${C["ink-muted"]};">${BRAND.businessSupportMailbox}</a></p><p style="margin:6px 0 0;font-family:${SANS};font-size:12px;line-height:18px;color:${C["ink-muted"]};"><a href="${ENV.appOrigin}/terms" style="color:${C["ink-muted"]};">Terms &amp; Conditions</a> &nbsp;|&nbsp; <a href="${ENV.appOrigin}/privacy" style="color:${C["ink-muted"]};">Privacy Policy</a></p></td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:${C.paper};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${escapeHtml(title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.paper};"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background:${C["paper-raised"]};border:1px solid ${C.line};">${header}${rule}<tr><td style="padding:28px 28px 12px;">${greetingHtml}${content}</td></tr>${footer}</table></td></tr></table></body></html>`;
}

export function buildRegistrationConfirmationEmail(input: {
  fullName: string;
  businessName: string;
  businessModel: string;
  packageName: string;
}) {
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const subject = `${BRAND.programmeName} Registration Received — ${input.packageName} Package`;
  const body = `Dear ${input.fullName},\n\nThank you for registering for the ${BRAND.programmeFullName} (${input.packageName} Package).\n\nWe have received your registration details for ${input.businessName} (${input.businessModel}). Our review team is evaluating your submission, and you will receive a follow-up email regarding your acceptance and onboarding details shortly.\n\nThe participant platform was built specifically for this programme and is continually being improved. If anything does not work as expected, kindly take a screenshot and reply directly to this email. ${BRAND.facilitatorFirstName} reads every participant email and will have the technical team review it.\n\nWarm regards,\n${BRAND.facilitatorFormalName}\n${BRAND.programmeName} Programme Team`;
  return {
    subject,
    body,
    html: buildBrandedEmailHtml({
      label: `${input.packageName} package`,
      title: "Your registration has been received",
      preheader: `Thank you, ${firstName}. Your ${BRAND.programmeName} registration is safely with us.`,
      greeting: `Dear ${firstName},`,
      paragraphs: [
        `Thank you for registering for the ${BRAND.programmeFullName}. We have safely received your submission.`,
        `Our review team is now considering the context you provided for ${input.businessName}. We will write again shortly with the next stage of your acceptance and onboarding journey.`,
        "Kindly keep this email for your records. There is nothing further you need to do today.",
      ],
      details: [
        { label: "Business", value: input.businessName },
        { label: "Business model", value: input.businessModel },
        { label: "Selected pathway", value: input.packageName },
      ],
      callout: `This participant platform was built specifically for ${BRAND.programmeName} and is continually being improved. If anything does not work as expected, kindly take a screenshot and reply directly to this email. ${BRAND.facilitatorFirstName} reads every participant email and will have the technical team review it.`,
      footerNote: "If you need to correct a registration detail or need support, kindly reply directly to this email.",
    }),
  };
}

const engagementInvitationPackageCopy = {
  Foundation: {
    fee: "₦575,000",
    commitment: "₦230,000 (40%)",
    upfront: "₦517,500",
    distinction: "Foundation gives you the core five-class journey and the decisions, tools and language needed to strengthen how you build.",
  },
  "Engine Room": {
    fee: "₦875,000",
    commitment: "₦350,000 (40%)",
    upfront: "₦787,500",
    distinction: "Engine Room includes the Foundation journey together with deeper work around your commercial model, positioning, unit economics and operating choices.",
  },
  Boardroom: {
    fee: "₦1,500,000",
    commitment: "₦600,000 (40%)",
    upfront: "₦1,350,000",
    distinction: "Boardroom is the complete cumulative engagement, including Foundation and Engine Room work, three private 90-minute strategy sessions, and written action points after each one.",
  },
} as const;

export function buildEngagementBriefInvitationEmail(input: {
  fullName: string;
  businessName: string;
  packageName: "Foundation" | "Engine Room" | "Boardroom";
  portalUrl: string;
}) {
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const packageCopy = engagementInvitationPackageCopy[input.packageName];
  const subject = `${BRAND.programmeName} — Your ${input.packageName} Engagement Brief is ready`;
  const body = `Dear ${input.fullName},\n\nI trust this meets you well and in good health.\n\nThank you again for registering for ${BRAND.programmeName}. I am pleased to welcome you into the next stage for ${input.businessName}: your private participant portal and personalised ${input.packageName} Engagement Brief.\n\nWe have digitised this engagement so your brief, diagnostic, working materials and, as they become available, meeting recordings can live in one private place over the course of the programme. The portal works on mobile, but kindly use a laptop whenever possible for the most complete experience—especially when working through the diagnostic and programme materials.\n\nPlease use this secure link to set your participant password:\n${input.portalUrl}\n\nThis link is single-use and expires after 20 minutes. Once your password is set, return to the ${BRAND.programmeShortName} website and sign in normally using your registered email address and password. Your browser can remember your sign-in on this device for 30 days.\n\nYour Engagement Brief is the first thing you will see. It opens with my understanding of what you shared in your registration, the potential challenge it may point to, and the areas we will explore together. This is a starting hypothesis for our work—not a final diagnosis. It also presents the programme sessions once, with one clear explanation of how the engagement works. Kindly read it carefully and select “I have read and consent to the terms.”\n\n${packageCopy.distinction}\n\nYour private payment guidance is available alongside this brief. Kindly review your pathway-specific fee, instalment schedule, full-upfront option, and approved payment routes whenever you are ready. Once you acknowledge the brief, your Current State Assessment and programme tracker open immediately. You can begin the assessment before payment; it adds the detail I need to shape the advisory work around your business. It is an initial get-to-know-you diagnostic, not the full set of questions for the engagement. Before each class, I will ask further focused questions so the discussion, recommendations and materials can respond to the decisions then in front of you.\n\nThe programme is currently scheduled to begin on Friday, 4 September 2026. Every class will be recorded. Where an unforeseen adjustment is necessary, I will communicate at least 72 hours ahead and advise a replacement date.\n\nThis platform was built specifically for ${BRAND.programmeName} and is continually being improved. If you encounter any technical difficulty, kindly take a screenshot and email me directly. I read every participant email and will have the technical team look into it promptly.\n\nI look forward to the work ahead.\n\nWarm regards,\n\n${BRAND.facilitatorName}\nFacilitator, ${BRAND.programmeName} — Strategy & Innovation Genius Track`;

  return {
    subject,
    body,
    html: buildBrandedEmailHtml({
      label: `${input.packageName} engagement`,
      title: "Your Engagement Brief is ready",
      preheader: `Set your password to access your private ${BRAND.programmeName} ${input.packageName} Engagement Brief.`,
      greeting: `Dear ${firstName},\n\nI trust this meets you well and in good health.`,
      paragraphs: [
        `Thank you again for registering for ${BRAND.programmeName}. I am pleased to welcome you into the next stage for ${input.businessName}: your private participant portal and personalised Engagement Brief.`,
        "We have digitised this engagement so your brief, diagnostic, working materials and, as they become available, meeting recordings can live in one private place over the course of the programme. The portal works on mobile, but kindly use a laptop whenever possible for the most complete experience—especially when working through the diagnostic and programme materials.",
        "Your Engagement Brief is the first thing you will see. It opens with my understanding of what you shared, the potential challenge it may point to and the areas we will explore together. This is a starting hypothesis—not a final diagnosis. The programme sessions appear once, with one clear explanation of how the engagement works.",
        packageCopy.distinction,
        "Your private payment guidance is available alongside this brief. Kindly review your pathway-specific fee, instalment schedule, full-upfront option, and approved payment routes whenever you are ready. Once you acknowledge the brief, your Current State Assessment and programme tracker open immediately. You can begin the assessment before payment; it adds the detail I need to shape the advisory work around your business. It is an initial get-to-know-you diagnostic, not the full set of questions for the engagement. Before each class, I will ask further focused questions so the discussion, recommendations and materials can respond to the decisions then in front of you.",
        "The programme is currently scheduled to begin on Friday, 4 September 2026. Every class will be recorded. Where an unforeseen adjustment is necessary, I will communicate at least 72 hours ahead and advise a replacement date.",
      ],
      details: [{ label: "Selected pathway", value: input.packageName }],
      cta: { label: "Set my portal password", url: input.portalUrl },
      callout: "This secure password-setup link expires in 20 minutes and can be used once. Once your password is set, sign in normally with your registered email address and password.",
      footerNote: `This platform was built specifically for ${BRAND.programmeName} and is continually being improved. If you encounter any technical difficulty, kindly take a screenshot and email ${BRAND.facilitatorFirstName} directly. He will have the technical team review it promptly.`,
    }),
  };
}

export function buildInformationSessionInvitationEmail(input: {
  fullName: string;
  meetUrl: string;
}) {
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const subject = `${BRAND.programmeName} — Information Session & Briefing | Sunday, 23 August`;
  const body = `Dear ${input.fullName},\n\nI trust this meets you well and in good health.\n\nHaving interacted with some individuals already, I would like to give everyone an opportunity to be properly advised on the programme. I would therefore like to invite you to a ${BRAND.programmeName} Information Session & Briefing: a chance to bring the room together, answer your questions and allow you to meet the fellow entrepreneurs with whom you may share the journey.\n\nDate: Sunday, 23 August 2026\nTime: 7:00–8:00 pm (Lagos time)\nVenue: Google Meet\n\nDuring the session, I will set out what ${BRAND.programmeShortName} is designed to achieve, how the advisory journey is structured and how Foundation, Engine Room and Boardroom build on the shared core experience. We will also cover how to make the best use of your private portal, Current State Assessment, working materials and subsequent sessions. Most importantly, we will make time for your questions, so you can begin with context, clarity and confidence.\n\nIf you are already clear on what you want and ready to move forward, kindly feel free to continue with your registration steps, portal consent, payment and any scheduling made available to you. You are still very welcome to attend the Information Session; it is designed to help everyone begin well.\n\nYou will receive a Google Calendar invitation immediately after this email. Kindly use its Yes, No or Maybe response option to confirm your attendance.\n\nJoin the Information Session here:\n${input.meetUrl}\n\nIf you cannot attend live, kindly do not worry. The session will be recorded, and the recording will be shared in your private participant portal for you to revisit.\n\nPlease come with the practical questions that matter most to you: your business priorities, how the engagement will work, and how you can get the most value from the journey. There is no additional preparation required for this session.\n\nI look forward to meeting you properly and opening the journey together.\n\nWarm regards,\n\n${BRAND.facilitatorName}`;

  return {
    subject,
    body,
    html: buildBrandedEmailHtml({
      label: `A personal invitation from ${BRAND.facilitatorName}`,
      title: "Information Session & Briefing",
      preheader: `Join ${BRAND.facilitatorName} and the ${BRAND.programmeName} cohort on Sunday, 23 August at 7:00 pm Lagos time.`,
      greeting: `Dear ${firstName},\n\nI trust this meets you well and in good health.`,
      paragraphs: [
        `Having interacted with some individuals already, I would like to give everyone an opportunity to be properly advised on the programme. I would therefore like to invite you to a ${BRAND.programmeName} Information Session & Briefing: a chance to bring the room together, answer your questions and allow you to meet the fellow entrepreneurs with whom you may share the journey.`,
        `I will set out what ${BRAND.programmeShortName} is designed to achieve, how the advisory journey is structured and how Foundation, Engine Room and Boardroom build on the shared core experience. We will also cover how to make the best use of your private portal, Current State Assessment, working materials and subsequent sessions.`,
        "Most importantly, we will make time for your questions, so you can begin the programme with context, clarity and confidence. Please come with the practical questions that matter most to you: your business priorities, how the engagement will work, and how you can get the most value from the journey. There is no additional preparation required.",
        "If you are already clear on what you want and ready to move forward, kindly feel free to continue with your registration steps, portal consent, payment and any scheduling made available to you. You are still very welcome to attend the Information Session; it is designed to help everyone begin well.",
        "You will receive a Google Calendar invitation immediately after this email. Kindly use its Yes, No or Maybe response option to confirm your attendance.",
        "If you cannot attend live, kindly do not worry. The session will be recorded, and the recording will be shared in your private participant portal for you to revisit.",
      ],
      details: [
        { label: "Date", value: "Sunday, 23 August 2026" },
        { label: "Time", value: "7:00–8:00 pm (Lagos time)" },
        { label: "Venue", value: "Google Meet" },
      ],
      callout: `This is a live orientation and briefing for the ${BRAND.programmeName} community—not an additional assessment. Whether you are still considering your route or already ready to proceed, kindly join if you can; the recording will be available for those who miss it.`,
      cta: { label: "Join the Information Session", url: input.meetUrl },
      footerNote: `If you experience a technical issue, kindly take a screenshot and reply directly to this email. ${BRAND.facilitatorFirstName} reads participant emails and will have the technical team review it.`,
    }),
  };
}

export function buildDuplicatePathwayClarificationEmail(input: {
  fullName: string;
  businessName: string;
  packageName: "Foundation" | "Engine Room" | "Boardroom";
  portalUrl: string;
}) {
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const packageCopy = engagementInvitationPackageCopy[input.packageName];
  const subject = `${BRAND.programmeName} — Your ${input.packageName} registration is confirmed`;
  const body = `Dear ${input.fullName},\n\nI trust this meets you well and in good health.\n\nApologies: our system recognised two entries for ${input.businessName}. I have resolved this on the back end and retained your ${input.packageName} registration only. Please disregard the earlier lower-pathway email; there is nothing further you need to do in relation to it.\n\n${packageCopy.distinction}\n\nPlease use this secure link to set your ${input.packageName} participant password:\n${input.portalUrl}\n\nThis link is single-use and expires after 20 minutes. Once your password is set, return to the ${BRAND.programmeShortName} website and sign in normally with your registered email address and password.\n\nYour Engagement Brief is the first thing you will see. Kindly read it and select “I have read and consent to the terms.” You can then complete your Current State Assessment. This is an initial get-to-know-you diagnostic, not the full set of questions for the engagement. Before each class, I will ask further focused questions so the discussion, recommendations and materials can respond to the decisions then in front of you.\n\nThe portal works on mobile, but kindly use a laptop or desktop whenever possible for the most complete experience—especially when working through the diagnostic and programme materials.\n\nThis is now the one participant experience we will use for your ${input.packageName} engagement. If you encounter any technical difficulty, please take a screenshot and email me directly.\n\nWarm regards,\n\n${BRAND.facilitatorName}\nFacilitator, ${BRAND.programmeName} — Strategy & Innovation Genius Track`;

  return {
    subject,
    body,
    html: buildBrandedEmailHtml({
      label: `${input.packageName} registration confirmed`,
      title: `Your ${input.packageName} journey is confirmed`,
      preheader: `Your ${BRAND.programmeName} ${input.packageName} portal is now your single active participant experience.`,
      greeting: `Dear ${firstName},\n\nI trust this meets you well and in good health.`,
      paragraphs: [
        `Apologies: our system recognised two entries for ${input.businessName}. I have resolved this on the back end and retained your ${input.packageName} registration only. Please disregard the earlier lower-pathway email; there is nothing further you need to do in relation to it.`,
        packageCopy.distinction,
        "Your Engagement Brief is the first thing you will see. Kindly read it and select “I have read and consent to the terms.” You can then complete your Current State Assessment.",
        "This is an initial get-to-know-you diagnostic, not the full set of questions for the engagement. Before each class, I will ask further focused questions so the discussion, recommendations and materials can respond to the decisions then in front of you.",
        `Use the secure link to set your participant password. Once complete, sign in normally from the ${BRAND.programmeShortName} website with your registered email address and password.`,
        "The portal works on mobile, but kindly use a laptop or desktop whenever possible for the most complete experience—especially when working through the diagnostic and programme materials.",
      ],
      details: [{ label: "Active pathway", value: input.packageName }],
      cta: { label: "Set my participant password", url: input.portalUrl },
      callout: `This secure password-setup link expires in 20 minutes and can be used once. Once your password is set, sign in normally from the ${BRAND.programmeShortName} website.`,
      footerNote: `If you encounter any technical difficulty, kindly take a screenshot and email ${BRAND.facilitatorFirstName} directly. He will have the technical team review it promptly.`,
    }),
  };
}

export function buildWaitlistEmail(fullName: string) {
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  const subject = `${BRAND.programmeName} Boardroom Waitlist — ${fullName}`;
  const body = `Dear ${fullName},\n\nThank you for your interest in the ${BRAND.programmeName} Boardroom package. The 8 available places are currently full, so we have placed your registration on the Waitlist. The programme team will contact you if a place becomes available.\n\nWarm regards,\n${BRAND.programmeName} Programme Team`;
  return {
    subject,
    body,
    html: buildBrandedEmailHtml({
      label: "Boardroom package",
      title: "You have been added to the waitlist",
      preheader: "Your Boardroom interest has been recorded.",
      greeting: `Dear ${firstName},`,
      paragraphs: [
        `Thank you for your interest in the ${BRAND.programmeName} Boardroom package.`,
        "The eight available Boardroom places are currently full, so we have added your registration to the waitlist. We will contact you personally if a place becomes available.",
      ],
      callout: "Your registration has been safely recorded. No further action is needed at this time.",
      footerNote: "Kindly reply directly to this email if you have a question about your registration.",
    }),
  };
}

export function buildSessionReminderEmail(input: {
  fullName: string;
  sessionTitle: string;
  sessionDate: string;
  sessionTime: string;
  meetingUrl?: string;
  messageNotes?: string;
}) {
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const subject = `24-Hour Reminder: ${input.sessionTitle} — ${BRAND.programmeName}`;
  const meeting = input.meetingUrl || `Access via your ${BRAND.programmeShortName} participant portal`;
  const body = `Dear ${input.fullName},\n\nThis is your 24-hour reminder for the upcoming ${BRAND.programmeName} session: "${input.sessionTitle}".\n\nScheduled Date: ${input.sessionDate} at ${input.sessionTime}\nMeeting Link: ${meeting}\n\n${input.messageNotes ? `Facilitator Notes:\n${input.messageNotes}\n\n` : ""}We have attached a calendar invitation (ICS) to this email so you can add this session directly to your calendar.\n\nWarm regards,\n${BRAND.facilitatorFormalName}\nFacilitator, ${BRAND.programmeName}`;
  return {
    subject,
    body,
    html: buildBrandedEmailHtml({
      label: "24-hour session reminder",
      title: input.sessionTitle,
      preheader: `Your ${BRAND.programmeName} session is scheduled for ${input.sessionDate}.`,
      greeting: `Dear ${firstName},`,
      paragraphs: [`This is a kindly reminder about your upcoming ${BRAND.programmeName} session. Your calendar invitation is attached for convenience.`],
      details: [
        { label: "Date", value: input.sessionDate },
        { label: "Time", value: input.sessionTime },
        { label: "Joining details", value: input.meetingUrl ? "Use the button below to join the session." : meeting },
      ],
      callout: input.messageNotes ? `Facilitator notes:\n${input.messageNotes}` : undefined,
      cta: input.meetingUrl ? { label: "Join session", url: input.meetingUrl } : undefined,
      footerNote: "If you experience a difficulty, kindly reply directly to this email. The calendar invitation is attached for your records.",
    }),
  };
}
