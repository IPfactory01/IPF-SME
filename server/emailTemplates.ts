import { BRAND } from "../shared/brand";
import { ENV } from "./_core/env";
import { EMAIL_LOGO_CID, EMAIL_LOGO_SIZE } from "./emailLogo";
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeHref(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? escapeHtml(parsed.toString()) : "";
  } catch {
    return "";
  }
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
 * embedded in the email (cid:ipf-logo); resendRequestBody attaches it. It is the layout of every email the platform sends.
 */
/** Every IP Factory email says how to reach a person: replies go to the business support mailbox (Reply-To). */
export const REPLY_INVITATION = `Questions? Reply to this email or write to ${BRAND.businessSupportMailbox}.`;

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
  const footer = `<tr><td style="padding:18px 28px 22px;background:${C["brand-tint-softer"]};border-top:1px solid ${C.line};"><p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:19px;color:${C["ink-soft"]};">${REPLY_INVITATION}</p><p style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${C["ink-muted"]};">${escapeHtml(BRAND.productEndorsement)} &nbsp;|&nbsp; <a href="mailto:${BRAND.businessSupportMailbox}" style="color:${C["ink-muted"]};">${BRAND.businessSupportMailbox}</a></p><p style="margin:6px 0 0;font-family:${SANS};font-size:12px;line-height:18px;color:${C["ink-muted"]};">${escapeHtml(`${BRAND.organisationName}, ${BRAND.officeAddress.oneLine}`)}</p><p style="margin:6px 0 0;font-family:${SANS};font-size:12px;line-height:18px;color:${C["ink-muted"]};"><a href="${ENV.appOrigin}/terms" style="color:${C["ink-muted"]};">Terms &amp; Conditions</a> &nbsp;|&nbsp; <a href="${ENV.appOrigin}/privacy" style="color:${C["ink-muted"]};">Privacy Policy</a></p></td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:${C.paper};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${escapeHtml(title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.paper};"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background:${C["paper-raised"]};border:1px solid ${C.line};">${header}${rule}<tr><td style="padding:28px 28px 12px;">${greetingHtml}${content}</td></tr>${footer}</table></td></tr></table></body></html>`;
}
