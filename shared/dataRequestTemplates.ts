/**
 * Data Request templates, loaded into an engagement in one step (ET, 6 November 2026). The layout follows the firm's
 * Data Request sheets (section, reference, why we ask, format, priority, date by priority); the content is written for an
 * owner-run Nigerian business, asking only for what such a business has, in forms it can send: photos, voice notes,
 * WhatsApp exports. A client who arrives with their own list pastes it from Excel instead (parsePastedDataRequest).
 */
import type { EngagementTaskPriority } from "./engagement";
import { ASSESSMENT_TEMPLATE } from "./engagement";

export type TemplateItem = { section: string; ref: string; title: string; detail: string; informs: string; format: string; priority: EngagementTaskPriority };
export type DataRequestTemplate = { id: string; name: string; description: string; items: readonly TemplateItem[] };

/** Days from the day it is loaded, by priority: the spacing of the firm's sheets (high first). */
export const DUE_DAYS: Record<EngagementTaskPriority, number> = { high: 4, medium: 6, low: 7 };

const SMALL_BUSINESS_BASELINE: readonly TemplateItem[] = [
  { section: "1 The business today", ref: "1.1", priority: "high", title: "What you sell, and who buys it", detail: "A few lines, or a voice note: your main products or services, and your usual customers.", informs: "Where the money comes from", format: "A few lines or a voice note" },
  { section: "1 The business today", ref: "1.2", priority: "low", title: "CAC registration, if you have it", detail: "Certificate and status report. If the business is not registered yet, say so.", informs: "Funding and contracts later", format: "Photo or PDF" },
  { section: "1 The business today", ref: "1.3", priority: "medium", title: "Where you operate", detail: "Shop, office, market stall, online only, or several places; owned or rented.", informs: "Your costs and how you reach customers", format: "A few lines" },
  { section: "2 Sales and customers", ref: "2.1", priority: "high", title: "Your sales for the last 12 months", detail: "Month by month. A sales book, POS or till reports, or photos of your records all work.", informs: "How the business is really doing", format: "Photos, Excel or POS export" },
  { section: "2 Sales and customers", ref: "2.2", priority: "medium", title: "Your ten best customers", detail: "Who they are (names optional), what they buy and how often.", informs: "Who the business depends on", format: "A list" },
  { section: "2 Sales and customers", ref: "2.3", priority: "medium", title: "Where new customers come from", detail: "Instagram, WhatsApp, referrals, walk-ins, a marketplace: roughly how many from each.", informs: "Which channels to grow", format: "A few lines" },
  { section: "2 Sales and customers", ref: "2.4", priority: "low", title: "Customers who stopped buying, and why", detail: "Any you know of. A line each is enough.", informs: "What to fix to keep customers", format: "A few lines or a voice note" },
  { section: "3 Money", ref: "3.1", priority: "high", title: "Bank statements for the last 6 months", detail: "The business account, and any personal account that business money passes through.", informs: "Real cash in and out", format: "PDF from your bank app" },
  { section: "3 Money", ref: "3.2", priority: "high", title: "What you spend each month", detail: "Rent, salaries, stock, diesel and power, data, transport, loan repayments. A rough list is fine.", informs: "Your monthly cost and break-even", format: "A list or photos" },
  { section: "3 Money", ref: "3.3", priority: "medium", title: "Who owes you, and whom you owe", detail: "Customers who have not paid, supplier debts, loans and contributions (esusu, ajo).", informs: "Cash tied up and cash due", format: "A list" },
  { section: "3 Money", ref: "3.4", priority: "low", title: "Anything you already track", detail: "Notebooks, spreadsheets, app or POS reports. Send them as they are.", informs: "What we can build on", format: "Photos or files" },
  { section: "4 Prices", ref: "4.1", priority: "high", title: "Your price list", detail: "What you charge for each product or service, and the discounts you give.", informs: "Whether your prices still make money", format: "Photo or list" },
  { section: "4 Prices", ref: "4.2", priority: "medium", title: "What your main products cost you today", detail: "For your three to five best sellers: what you pay for them or for the materials, now.", informs: "Your margin on each", format: "A list" },
  { section: "4 Prices", ref: "4.3", priority: "low", title: "What competitors charge", detail: "Two or three you know of, for the same products.", informs: "Where your prices sit", format: "A list or screenshots" },
  { section: "5 People", ref: "5.1", priority: "medium", title: "Who works in the business", detail: "Each role, what they do and what they are paid. Names are optional.", informs: "Your team and its cost", format: "A list" },
  { section: "5 People", ref: "5.2", priority: "low", title: "Who decides what", detail: "Which decisions only you make, and which others make without you.", informs: "Whether the business can run without you", format: "A few lines or a voice note" },
  { section: "6 Plans", ref: "6.1", priority: "medium", title: "What you want in the next 12 months", detail: "Sales you want to reach, a new outlet, a loan, hiring: whatever matters most to you.", informs: "The goal we work towards", format: "A few lines or a voice note" },
  { section: "6 Plans", ref: "6.2", priority: "low", title: "What you have already tried", detail: "Changes you made to fix the problem, and what happened.", informs: "What not to repeat", format: "A few lines" },
];

/** The Business Review's own starting list (shared/engagement.ts), as a template the team can load again. */
const BUSINESS_REVIEW: readonly TemplateItem[] = ASSESSMENT_TEMPLATE.dataRequests.map((item, index) => ({
  section: item.week === 1 ? "Week 1" : "Week 2", ref: String(index + 1), title: item.title, detail: item.detail, informs: "", format: "Any", priority: item.week === 1 ? "high" as const : "medium" as const,
}));

export const DATA_REQUEST_TEMPLATES: readonly DataRequestTemplate[] = [
  { id: "small_business_baseline", name: "Small business baseline", description: "Eighteen items in six sections for an owner-run business: what you sell, sales, money, prices, people and plans.", items: SMALL_BUSINESS_BASELINE },
  { id: "business_review", name: "Business Review", description: "The Business Review's own list: six quick questions, then sales, costs, prices, people, bank statements and debts.", items: BUSINESS_REVIEW },
];

export const templateById = (id: string) => DATA_REQUEST_TEMPLATES.find(template => template.id === id);

export type ParsedItem = { section: string | null; ref: string | null; title: string; detail: string | null; informs: string | null; format: string | null; priority: EngagementTaskPriority | null; dueOn: string | null };

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
/** "12 Nov 2026", "2026-11-12" or "12/11/2026" (day first, as in Nigeria) as an ISO date; anything else is none. */
export function parseDate(text: string): string | null {
  const value = text.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return value;
  match = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(value);
  if (match && MONTHS[match[2]!.toLowerCase()]) return `${match[3]}-${MONTHS[match[2]!.toLowerCase()]}-${match[1]!.padStart(2, "0")}`;
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (match) return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  return null;
}

const COLUMN_NAMES: Record<keyof Omit<ParsedItem, "section">, RegExp> = {
  ref: /^(id|ref|reference|#|no\.?)$/i,
  title: /^(item|item requested|request|what we need|title)$/i,
  detail: /^(detail|details|description|notes?)$/i,
  informs: /^(what it informs|informs|why we ask|purpose)$/i,
  format: /^(format|form)$/i,
  priority: /^priority$/i,
  dueOn: /^(date required|due|due date|by|deadline)$/i,
};
const DEFAULT_ORDER: (keyof Omit<ParsedItem, "section">)[] = ["ref", "title", "detail", "informs", "format", "priority", "dueOn"];

/**
 * Rows copied from a Data Request sheet in Excel or Google Sheets (cells separated by tabs). A header row, if there is one,
 * sets the columns; otherwise they are taken as ID, item, detail, what it informs, format, priority, date. A row with
 * only its first cell filled ("2  Client portfolio") starts a section. Empty rows are skipped.
 */
export function parsePastedDataRequest(text: string): ParsedItem[] {
  const rows = text.replace(/\r/g, "").split("\n").map(line => line.split("\t").map(cell => cell.trim()));
  let order = DEFAULT_ORDER as (keyof Omit<ParsedItem, "section"> | null)[];
  let section: string | null = null;
  const items: ParsedItem[] = [];
  for (const cells of rows) {
    const filled = cells.filter(Boolean);
    if (!filled.length) continue;
    const header = cells.map(cell => (Object.keys(COLUMN_NAMES) as (keyof typeof COLUMN_NAMES)[]).find(key => COLUMN_NAMES[key].test(cell)) ?? null);
    if (header.filter(Boolean).length >= 2 && header.includes("title")) { order = header; continue; }
    if (filled.length === 1 && cells[0]) { section = cells[0].replace(/\s+/g, " "); continue; }
    const get = (key: keyof Omit<ParsedItem, "section">) => { const at = order.indexOf(key); return at >= 0 ? cells[at] ?? "" : ""; };
    const title = get("title");
    if (!title) continue;
    const priority = get("priority").toLowerCase();
    items.push({
      section, ref: get("ref") || null, title: title.slice(0, 200), detail: get("detail") || null, informs: get("informs") || null, format: get("format") || null,
      priority: priority === "high" || priority === "medium" || priority === "low" ? priority : null, dueOn: parseDate(get("dueOn")),
    });
  }
  return items;
}
