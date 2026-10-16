/**
 * Single source of truth for programme and organisation identity.
 *
 * Every participant-facing name, sender identity and facilitator reference in the
 * client, server and email templates reads from here, so a rebrand is a change to
 * this file (plus matching test expectations) rather than a codebase-wide edit.
 *
 * The organisation identity and palette are IP Factory's. Programme names, facilitator and
 * mailbox values still describe JUMP 2026 until the product name and desk mailbox are set
 * (see docs/ipf-factory/MIGRATION_CHECKLIST.md, decisions D1–D4).
 *
 * Not covered here, by design:
 * - Stored identifiers (database enum values, cookie names, storage keys), which
 *   need a data migration to change.
 * - Payment beneficiary details, which belong to the payments workstream.
 * - Deployment origins and the Super Admin identity, which are environment configuration.
 */
const programmeShortName = "JUMP";
const programmeName = "JUMP 2026";
const programmeTrack = "Strategy & Innovation Genius Track";
const facilitatorName = "Emmanuel Tarfa";

export const BRAND = {
  /** The organisation that owns and runs the programme. */
  organisationName: "IP Factory",
  organisationLegalName: "Intellectual Property Factory",
  /**
   * The business-support offer's public name ([NAME] in the concept note's site copy), chosen
   * 7 October 2026. Written out in full with its maker as productEndorsement.
   */
  productName: "The Shift",
  productEndorsement: "The Shift, by IP Factory",
  productTagline: "Support for business owners",
  /**
   * The track record the site states, confirmed by ET on 13 October 2026. Every figure must stay defensible. The parent
   * firm is named (ET, 14 October 2026); the partners are not. groupUrl links the name when set; empty shows plain text.
   */
  trackRecord: {
    groupName: "Enzo Krypton & Co.",
    groupUrl: "https://enzokrypton.com/",
    lineage: "an established Nigerian management consulting firm",
    clients: "250+",
    partnerYears: "50+",
    since: 2011,
    /**
     * Clients named on the site, each with their agreement (confirmed by ET, 14 October 2026). Describe the work, never
     * the client's problems, and never a client's figures without separate written permission.
     */
    namedClients: [
      { name: "Ruff 'n' Tumble", sector: "Children's fashion retail", work: "An 18-month transformation: a cost review, a new organisation design and goals tracked every month." },
      { name: "SKLD (formerly School Kits)", sector: "School supplies", work: "A transformation plan, and written procedures for how each part of the business runs." },
      { name: "MAX", sector: "Mobility and logistics", work: "A business transformation." },
    ],
    /**
     * Logos in the strip under the track record figures, files in client/public/clients: clients Enzo Krypton has
     * worked with, confirmed by ET (16 October 2026) and shown in the firm's own company profile (October 2026), the
     * source of the files. The wording is "has worked with", never "trusted by" or "partners", so nothing suggests an
     * endorsement. Government crests and multilateral marks stay out.
     */
    clientLogos: [
      { name: "LSETF", src: "/clients/lsetf.png" },
      { name: "Bank of Industry", src: "/clients/bank-of-industry.png" },
      { name: "FSDH", src: "/clients/fsdh.png" },
      { name: "Helium Health", src: "/clients/helium-health.png" },
      { name: "MAX", src: "/clients/max.png" },
      { name: "Ruff 'n' Tumble", src: "/clients/ruff-n-tumble.png" },
      { name: "SKLD", src: "/clients/skld.png" },
    ],
    sectors: ["Hospitality", "Food and restaurants", "Retail and fashion", "Education", "Agriculture", "Health", "Financial services", "Technology and media", "Public sector and development"],
  },
  /** External page for the free business check, if it runs elsewhere. Empty: the on-site form opens. */
  applyUrl: "",
  /**
   * Booking page for the free 20-minute discovery call: IP Factory's Calendly event, embedded on the
   * business check result with the owner's name and email filled in. DISCOVERY_CALL_URL in the
   * hosting settings overrides it. Empty would mean the check records a request and the team emails.
   */
  discoveryCallUrl: "https://calendly.com/ipfactory-info/ipf-free-20-minute-discovery-call",
  /**
   * Logo files in client/public/brand (ipf-gradient, the Option 1 stacked logo). Use as supplied:
   * never recolour or stretch. The white version goes on dark panels only.
   */
  logoUrl: "/brand/ipf-gradient-logo.webp",
  logoOnDarkUrl: "/brand/ipf-gradient-logo-white.webp",
  markUrl: "/brand/ipf-gradient-mark.webp",

  /** Short programme name used in compounds such as "JUMP portal" or "JUMP administrator". */
  programmeShortName,
  /** Programme name with edition, e.g. in email subjects and headings. */
  programmeName,
  /** Descriptive track name. */
  programmeTrack,
  /** Full formal programme title. */
  programmeFullName: `${programmeName} ${programmeTrack}`,

  /** Facilitator references used in programme copy. */
  facilitatorFirstName: "Emmanuel",
  facilitatorName,
  facilitatorFormalName: `Dr. ${facilitatorName}`,
  facilitatorPortraitUrl: "/manus-storage/jump-emmanuel-tarfa-portrait_a3b21e44.jpeg",
  facilitatorInstagramReelUrl: "https://www.instagram.com/reel/DbIe9w9s_1L/",

  /** Outbound email identity. Participant mail is always sent from and replied to the programme mailbox. */
  senderDisplayName: `${facilitatorName} | ${programmeName}`,
  programmeMailbox: "jump@emmanueltarfa.com",
  /** Receives the monitoring copy of operational email and administrative notices. */
  administrationMailbox: "admin@emmanueltarfa.com",
  /** IP Factory Business Support inbox: business check notifications (finished checks, call and report requests). */
  businessSupportMailbox: "info@ipfactory.co",

  /**
   * Brand colours for email HTML and PDFs, which cannot read CSS variables.
   * Must match --color-brand / --color-brand-deep in client/src/index.css (enforced by brand.test.ts).
   */
  colorBrand: "#1C4E7E",
  colorBrandDeep: "#12324F",
  /**
   * The theme tokens email HTML uses, keyed by their name in client/src/index.css (--color-<name>). Email cannot read
   * CSS variables, so the values are copied here; brand.test.ts fails if any of them drifts from the stylesheet.
   */
  palette: {
    "brand": "#1C4E7E",
    "brand-deep": "#12324F",
    "brand-plum": "#6C335C",
    "highlight": "#36B7E0",
    "highlight-ink": "#CB3756",
    "ink": "#12324F",
    "ink-soft": "#4F5A66",
    "ink-muted": "#5F6B77",
    "brand-slate": "#4A5E73",
    "brand-tint-softer": "#F6F9FB",
    "brand-line": "#D3DEEA",
    "line": "#DDE3E8",
    "paper": "#F7F9FA",
    "paper-raised": "#FFFFFF",
    "health-clear": "#2E7D4F",
    "health-clear-tint": "#E7F3EC",
    "health-watch": "#B26A00",
    "health-watch-tint": "#FBF0DD",
    "health-stuck": "#B42318",
    "health-stuck-tint": "#FCE9E7",
  },
} as const;

export type Brand = typeof BRAND;
