/**
 * Deterministic resolver for persona-tailored question guidance.
 *
 * Given a question id, the respondent's industry and staff size (as captured
 * in the contact-first registration step), returns the displayed guidance:
 *  - the canonical plain-language explanation, always unchanged;
 *  - an industry-matched example when available, otherwise the generic one;
 *  - an optional staff-size framing clause when the industry matched.
 *
 * Pure and deterministic: identical (questionId, industry, staffSize) inputs
 * always return identical output. Resolution happens on the server so the
 * browser never decides which variant to show.
 */
import { INDUSTRIES, STAFF_COUNT_OPTIONS } from "./assessmentContent";
import {
  PERSONA_EXAMPLES,
  STAFF_SIZE_FRAMING,
  type IndustryId,
  type StaffSizeId,
} from "./guidancePersonas";
import { QUESTION_GUIDANCE } from "./questionGuidance";

export type ResolvedGuidance = {
  plainLanguage: string;
  example: string;
  /** Size-framing clause; empty when no industry match applied. */
  sizeFraming: string;
  /** True when an industry-specific variant was applied. */
  isPersonalised: boolean;
};

/**
 * Maps the LIVE assessment controlled-list industry label (as stored in the
 * organisation profile) to a persona key. Industries without a dedicated
 * persona variant map to "other" so the generic example is shown — the mapping
 * stays explicit so adding a persona later is a one-line change.
 */
const PERSONA_BY_CONTROLLED_LABEL: Record<string, IndustryId> = {
  "Retail and e-commerce": "retail",
  "Professional and business services": "professional",
  "Manufacturing": "manufacturing",
  "Logistics and transport": "distribution",
  "Hospitality": "hospitality",
  "Food and agriculture": "food_agriculture",
  "Agriculture and agribusiness": "food_agriculture",
  "Health and pharmaceuticals": "health",
  "Education and training": "education",
  "Other (please specify)": "other",
};

const VALID_STAFF_SIZES = new Set(STAFF_COUNT_OPTIONS.map((o) => o.id));

export function resolveGuidance(
  questionId: string,
  industry: string | null | undefined,
  staffSize: string | null | undefined
): ResolvedGuidance {
  const generic = QUESTION_GUIDANCE[questionId];
  if (!generic) {
    return { plainLanguage: "", example: "", sizeFraming: "", isPersonalised: false };
  }

  const persona = PERSONA_EXAMPLES[questionId];
  if (!persona) {
    return { ...generic, sizeFraming: "", isPersonalised: false };
  }

  // Map the stored industry to a persona key; unknown values fall back.
  // The contact step stores the LIVE controlled-list LABEL (e.g. "Hospitality",
  // "Food and agriculture"), so resolve against a label-to-persona map first
  // and keep the legacy id match as a fallback for older stored values.
  const industryId: IndustryId =
    PERSONA_BY_CONTROLLED_LABEL[industry ?? ""] ??
    (INDUSTRIES.some((i) => i.id === industry) ? (industry as IndustryId) : "other");
  // Size framing is documented for every industry including the "other"
  // fallback, so framing applies when any controlled value matched (label or
  // legacy id), while example personalisation still requires a dedicated
  // variant beyond the generic fallback.
  const wasMatched = PERSONA_BY_CONTROLLED_LABEL[industry ?? ""] !== undefined || INDUSTRIES.some((i) => i.id === industry);
  const hasVariant = industryId !== "other";

  const variant = persona[industryId];
  const example = variant?.example ?? generic.example;
  // Only apply size framing when a real industry matched (not the generic
  // `other` fallback), keeping the generic case identical to before. The
  // stored profile may carry the option label or the size id, so accept both.
  const resolvedSizeId = VALID_STAFF_SIZES.has(staffSize ?? "")
    ? (staffSize as string)
    : (STAFF_COUNT_OPTIONS.find((o) => o.label === staffSize)?.id ?? null);
  const sizeFraming =
    wasMatched && resolvedSizeId
      ? (STAFF_SIZE_FRAMING[resolvedSizeId as StaffSizeId] ?? "")
      : "";

  // Personalisation flag: a dedicated industry variant was actually applied.
  const appliedPersonalisation = hasVariant && Boolean(variant?.example);

  return {
    plainLanguage: generic.plainLanguage,
    example,
    sizeFraming,
    isPersonalised: appliedPersonalisation,
  };
}
