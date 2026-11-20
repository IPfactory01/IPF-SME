/**
 * IPF AI Readiness Assessment Content
 * 15 questions across 6 dimensions, each response weighted 0–5.
 * Composite score normalized to the AI Maturity Index (0–100).
 */

export type DimensionId =
  | "infrastructure"
  | "governance"
  | "workforce"
  | "salesOps"
  | "financial"
  | "strategic";

export interface Dimension {
  id: DimensionId;
  title: string;
  description: string;
}

export const DIMENSIONS: Dimension[] = [
  { id: "infrastructure", title: "Infrastructure & Stack", description: "Your current utilization of cloud tools, accounting software, and databases." },
  { id: "governance", title: "Governance & Security", description: "Formal policies regarding data sharing with external AI models." },
  { id: "workforce", title: "Workforce Capability", description: "Employee proficiency and frequency of AI tool usage." },
  { id: "salesOps", title: "Sales & Customer Operations", description: "Automation of lead scoring, support ticketing, and customer analytics." },
  { id: "financial", title: "Financial Visibility", description: "AI-driven expense tracking, reconciliation, and forecasting." },
  { id: "strategic", title: "Strategic Alignment", description: "Management commitment and budget for digital transformation." },
];

export interface AnswerOption {
  label: string;
  /** Weight for this option, 0–5 */
  score: number;
  /** Optional risk flag surfaced in vulnerability highlights */
  riskFlag?: "shadow-ai" | "data-exposure" | "manual-bottleneck";
}

export interface Question {
  id: number;
  dimension: DimensionId;
  dimensionTitle: string;
  text: string;
  subtext?: string;
  options: AnswerOption[];
}

export const QUESTIONS: Question[] = [
  // Dimension 1: Infrastructure & Stack (3 questions)
  {
    id: 1, dimension: "infrastructure", dimensionTitle: "Infrastructure & Stack",
    text: "How would you describe your core business tools today (accounting, CRM, inventory)?",
    options: [
      { label: "Mostly paper records and spreadsheets", score: 0, riskFlag: "manual-bottleneck" },
      { label: "Standalone desktop software, no integration", score: 1, riskFlag: "manual-bottleneck" },
      { label: "Some cloud tools (Google Workspace, QuickBooks) used departmentally", score: 2 },
      { label: "Integrated cloud stack across finance, sales, and operations", score: 4 },
      { label: "Fully integrated cloud stack with APIs and shared data across teams", score: 5 },
    ],
  },
  {
    id: 2, dimension: "infrastructure", dimensionTitle: "Infrastructure & Stack",
    text: "How is your business data stored and accessed?",
    options: [
      { label: "Scattered across personal devices and email attachments", score: 0 },
      { label: "Central shared drives, but no structure or access controls", score: 1 },
      { label: "Organized cloud storage (Drive, Dropbox, SharePoint) with basic folders", score: 3 },
      { label: "Centralized database or ERP with role-based access", score: 4 },
      { label: "Single source of truth: structured database/ERP accessible to authorized teams", score: 5 },
    ],
  },
  {
    id: 3, dimension: "infrastructure", dimensionTitle: "Infrastructure & Stack",
    text: "How reliable is your internet and hardware infrastructure for digital work?",
    options: [
      { label: "Frequent outages; workarounds are the norm", score: 0 },
      { label: "Adequate for email and browsing, struggles with cloud apps", score: 2 },
      { label: "Reliable connectivity with redundant power backup (generator/solar/inverter)", score: 4 },
      { label: "Enterprise-grade connectivity with full redundancy and IT support", score: 5 },
    ],
  },
  // Dimension 2: Governance & Security (2 questions)
  {
    id: 4, dimension: "governance", dimensionTitle: "Governance & Security",
    text: "Do you have a written policy on the use of AI tools (ChatGPT, Claude, etc.) by employees?",
    options: [
      { label: "No policy — employees use whatever tools they like", score: 0, riskFlag: "shadow-ai" },
      { label: "Informal verbal guidance only", score: 1, riskFlag: "shadow-ai" },
      { label: "Draft policy exists but is not enforced or communicated", score: 2, riskFlag: "shadow-ai" },
      { label: "Written Acceptable Use Policy, shared with staff", score: 4 },
      { label: "Formal AI governance policy with training, enforcement, and audit reviews", score: 5 },
    ],
  },
  {
    id: 5, dimension: "governance", dimensionTitle: "Governance & Security",
    text: "How are sensitive business and customer data handled when staff use online tools?",
    options: [
      { label: "Customer data is routinely entered into public AI chatbots and free online tools", score: 0, riskFlag: "data-exposure" },
      { label: "No rules; each employee decides individually", score: 1, riskFlag: "data-exposure" },
      { label: "Guidance exists to avoid pasting confidential data, but no enforcement", score: 2, riskFlag: "data-exposure" },
      { label: "Data classification rules with approved vs. restricted tools", score: 4 },
      { label: "Enforced data-handling rules, sanctioned AI tools with privacy safeguards", score: 5 },
    ],
  },
  // Dimension 3: Workforce Capability (2 questions)
  {
    id: 6, dimension: "workforce", dimensionTitle: "Workforce Capability",
    text: "How often do your employees use AI tools (ChatGPT, Claude, Copilot) in their work?",
    options: [
      { label: "Never — AI is not used", score: 0 },
      { label: "Rarely — a few individuals experiment occasionally", score: 1 },
      { label: "Some teams use AI weekly for writing, research, and analysis", score: 3 },
      { label: "Regular use across multiple departments", score: 4 },
      { label: "AI is embedded in daily workflows with defined use cases per role", score: 5 },
    ],
  },
  {
    id: 7, dimension: "workforce", dimensionTitle: "Workforce Capability",
    text: "Has your business provided any structured training on AI tools or digital skills?",
    options: [
      { label: "No training at all", score: 0 },
      { label: "Occasional informal sharing (e.g. someone showed a colleague a trick)", score: 1 },
      { label: "One-off workshop or external training session", score: 2 },
      { label: "Regular training program with practical, role-specific AI use cases", score: 4 },
      { label: "Continuous upskilling program with internal AI champions in each department", score: 5 },
    ],
  },
  // Dimension 4: Sales & Customer Operations (3 questions)
  {
    id: 8, dimension: "salesOps", dimensionTitle: "Sales & Customer Operations",
    text: "How do you capture and follow up on sales leads and customer enquiries?",
    options: [
      { label: "Notebooks, memory, and ad-hoc WhatsApp chats", score: 0, riskFlag: "manual-bottleneck" },
      { label: "A shared spreadsheet updated manually", score: 1, riskFlag: "manual-bottleneck" },
      { label: "A CRM (e.g. HubSpot, Zoho, Pipedrive) used by the sales team", score: 4 },
      { label: "CRM used company-wide with automated follow-up sequences", score: 5 },
    ],
  },
  {
    id: 9, dimension: "salesOps", dimensionTitle: "Sales & Customer Operations",
    text: "How are customer support enquiries and complaints handled?",
    options: [
      { label: "Handled case-by-case by whoever is available", score: 0, riskFlag: "manual-bottleneck" },
      { label: "Central inbox/email with manual tracking", score: 1 },
      { label: "Ticketing system or helpdesk with basic response tracking", score: 3 },
      { label: "Helpdesk with response SLAs and knowledge base", score: 4 },
      { label: "AI-assisted support (chatbots, auto-triage) with human escalation and SLA reporting", score: 5 },
    ],
  },
  {
    id: 10, dimension: "salesOps", dimensionTitle: "Sales & Customer Operations",
    text: "How do you understand customer buying patterns and demand?",
    options: [
      { label: "Gut feeling and intuition", score: 0 },
      { label: "End-of-month sales tallies reviewed occasionally", score: 1 },
      { label: "Monthly reports with basic dashboards", score: 3 },
      { label: "Regular analytics with trend and segment views", score: 4 },
      { label: "Predictive analytics or AI-driven insights informing stock and pricing decisions", score: 5 },
    ],
  },
  // Dimension 5: Financial Visibility (3 questions)
  {
    id: 11, dimension: "financial", dimensionTitle: "Financial Visibility",
    text: "How do you track expenses and reconcile transactions?",
    options: [
      { label: "Paper receipts and mental tally", score: 0, riskFlag: "manual-bottleneck" },
      { label: "Manual spreadsheet updated at irregular intervals", score: 1, riskFlag: "manual-bottleneck" },
      { label: "Accounting software (QuickBooks, Sage) with monthly entry", score: 3 },
      { label: "Accounting software with near-real-time entries and reconciliation", score: 4 },
      { label: "Automated bank feeds, AI-assisted categorization, and continuous reconciliation", score: 5 },
    ],
  },
  {
    id: 12, dimension: "financial", dimensionTitle: "Financial Visibility",
    text: "How do you produce financial forecasts and budgets?",
    options: [
      { label: "No formal forecasting", score: 0 },
      { label: "Simple annual targets set informally", score: 1 },
      { label: "Spreadsheet-based budgets updated periodically", score: 2 },
      { label: "Structured annual budget with quarterly re-forecasting", score: 4 },
      { label: "Data-driven rolling forecasts, potentially AI-assisted", score: 5 },
    ],
  },
  {
    id: 13, dimension: "financial", dimensionTitle: "Financial Visibility",
    text: "How quickly can management get an accurate picture of the company's financial health?",
    options: [
      { label: "Weeks — requires manual compilation", score: 0 },
      { label: "At month-end after closing the books", score: 2 },
      { label: "Within days, using accounting reports", score: 3 },
      { label: "Live dashboards showing cash position, receivables, and margins", score: 5 },
    ],
  },
  // Dimension 6: Strategic Alignment (2 questions)
  {
    id: 14, dimension: "strategic", dimensionTitle: "Strategic Alignment",
    text: "How committed is senior management to adopting AI and digital tools?",
    options: [
      { label: "No discussion or interest", score: 0 },
      { label: "Occasional curiosity, no plans", score: 1 },
      { label: "Leadership acknowledges AI's importance but has no roadmap", score: 2 },
      { label: "Digital transformation is on the agenda with an informal roadmap", score: 4 },
      { label: "AI is a stated strategic priority with an owner, roadmap, and milestones", score: 5 },
    ],
  },
  {
    id: 15, dimension: "strategic", dimensionTitle: "Strategic Alignment",
    text: "Is there a dedicated budget for digital transformation or AI adoption this year?",
    options: [
      { label: "No budget allocated", score: 0 },
      { label: "Budget covered only if urgent issues arise", score: 1 },
      { label: "Small ad-hoc budget for software subscriptions", score: 2 },
      { label: "Dedicated annual budget for tools and training", score: 4 },
      { label: "Dedicated budget with ROI targets and spend governance", score: 5 },
    ],
  },
];

// Dimension weights in the composite index (sum to 1)
export const DIMENSION_WEIGHTS: Record<DimensionId, number> = {
  infrastructure: 0.18,
  governance: 0.18,
  workforce: 0.16,
  salesOps: 0.16,
  financial: 0.16,
  strategic: 0.16,
};

// Industry sectors for personalized report narratives
export const INDUSTRIES = [
  { id: "retail", label: "Retail & Trading" },
  { id: "professional", label: "Professional Services" },
  { id: "manufacturing", label: "Manufacturing & Production" },
  { id: "distribution", label: "Distribution & Logistics" },
  { id: "hospitality", label: "Hospitality" },
  { id: "food_agriculture", label: "Food & Agriculture" },
  { id: "health", label: "Healthcare & Pharma" },
  { id: "education", label: "Education & Training" },
  { id: "other", label: "Other (please specify)" },
];

export interface CompanyProfile {
  companyName: string;
  industry: (typeof INDUSTRIES)[number]["id"];
  /** Optional free-text industry when "Other" is selected (15 Aug 2026). */
  otherIndustry?: string;
  staffCount: string;
  contactName: string;
  contactEmail: string;
  contactRole?: string;
}

/** Localized staff cost benchmarks, ₦ per fully-loaded hour by staff-size band */
export const HOURLY_STAFF_COST: Record<string, number> = {
  micro: 1500,   // 1–10 staff (₦1,500/hour)
  small: 2500,   // 11–50 staff (₦2,500/hour)
  medium: 3500,  // 51–200 staff (₦3,500/hour)
  large: 5000,   // 201+ staff (₦5,000/hour)
};

export const STAFF_COUNT_OPTIONS = [
  { id: "micro", label: "1–10 employees" },
  { id: "small", label: "11–50 employees" },
  { id: "medium", label: "51–200 employees" },
  { id: "large", label: "201+ employees" },
];
