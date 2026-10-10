import { z } from "zod";
import { BUSINESS_NAME_MAX_LENGTH } from "./businessMemberships";

/**
 * Universal account authentication (Phase 1).
 *
 * Authentication answers "who is this person?". Authorisation answers "what may they do?". Business membership
 * answers "which business may they act inside?". Keep the three separate.
 */

export const ACCOUNT_SESSION_COOKIE = "ipf_session";
export const ACCOUNT_SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const ACCOUNT_PASSWORD_MIN_LENGTH = 10;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 128;
export const ACCOUNT_MAX_FAILED_ATTEMPTS = 5;
export const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000;
export const ACCOUNT_FULL_NAME_MAX_LENGTH = 255;
export const ACCOUNT_EMAIL_MAX_LENGTH = 320;

export const ACCOUNT_STATUSES = ["active", "suspended", "disabled"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * Internal IPF roles. NOT built in Phase 1: they will be assigned to a person separately from any business
 * membership, with engagement assignments scoping where they apply. Until then, existing admin access keeps using
 * `users.role` ("user" | "admin") and the admin permission profiles.
 */
export const PLATFORM_ROLES = ["super_admin", "admin", "desk_lead", "analyst", "partner", "subject_matter_expert", "finance"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ACCOUNT_AUTH_ERRORS = {
  signInRequired: "Please sign in to continue.",
  invalidCredentials: "Your email or password is not correct.",
  locked: "Too many attempts. Kindly try again in 15 minutes.",
  tooManyRequests: "Too many attempts. Kindly wait a few minutes and try again.",
  emailTaken: "An account with this email already exists. Try signing in.",
  noBusinessAccess: "You do not have access to this business.",
  crossSite: "This request did not come from this site.",
  notAuthorisedForAdmin: "This account is not authorised for the IPF administrator area.",
  noActiveBusiness: "You are not working inside a business.",
  cannotEditBusiness: "Your role in this business does not allow you to change its profile.",
  wrongCurrentPassword: "Your current password is not correct.",
} as const;

export function normaliseAccountEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

export function validateAccountPassword(password: string): string | null {
  if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) return `Use at least ${ACCOUNT_PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > ACCOUNT_PASSWORD_MAX_LENGTH) return `Use no more than ${ACCOUNT_PASSWORD_MAX_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use at least one letter and one number.";
  return null;
}

/**
 * Accepting an onboarding invitation. Accounts are never created without a valid invitation token: there is no
 * public self-registration. `email` is read-only in the form and must equal the invitation's address.
 */
export const onboardingAcceptInputSchema = z
  .object({
    token: z.string().min(20).max(200),
    fullName: z.string().trim().min(2, "Enter your full name.").max(ACCOUNT_FULL_NAME_MAX_LENGTH),
    email: z.string().trim().email("Enter a valid email address.").max(ACCOUNT_EMAIL_MAX_LENGTH).transform(normaliseAccountEmail),
    password: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
    confirmPassword: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
    businessName: z.string().trim().min(2, "Enter your business name.").max(BUSINESS_NAME_MAX_LENGTH),
  })
  .superRefine((value, context) => {
    const policy = validateAccountPassword(value.password);
    if (policy) context.addIssue({ code: "custom", path: ["password"], message: policy });
    if (value.password !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "The password confirmation does not match." });
    }
  });
export type OnboardingAcceptInput = z.input<typeof onboardingAcceptInputSchema>;

export const ONBOARDING_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ONBOARDING_ERRORS = {
  unavailable: "This invitation is unavailable. It may have expired or already been used. Ask the IPF team for a new link.",
  emailMismatch: "The email does not match this invitation.",
  existingAccount: "An account already exists for this email address. The IPF team will help you sign in.",
  existingAccountAdmin: "This email already belongs to an account. Linking an existing account to a new business is not available yet.",
  noCheck: "That Business Check does not exist.",
  invalidCheckEmail: "The Business Check does not have a valid email address to invite.",
} as const;

export const signInInputSchema = z.object({
  email: z.string().trim().max(ACCOUNT_EMAIL_MAX_LENGTH).transform(normaliseAccountEmail),
  // No policy check on sign-in: a wrong or short password must fail like any other wrong password.
  password: z.string().min(1).max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
});

/** What the client may see. Never includes credentials, session tokens or hashes. */
export type AccountMembership = {
  businessId: number;
  businessName: string;
  role: import("./businessMemberships").BusinessMembershipRole;
  /** Only active memberships are ever returned; an inactive one gives no access and is not listed. */
  status: "active";
  /** True once every profile completion field is filled (completed after onboarding, never required to use the product). */
  profileComplete: boolean;
  /** 0-100, derived from the populated profile fields. */
  profilePercent: number;
};

/**
 * The one canonical description of who is signed in. Three separate answers:
 *   - who they are (`user`)
 *   - what they may do inside IPF (`platformRoles`, `permissions`): independent of any business
 *   - which businesses they may act inside (`memberships`, `activeBusiness`)
 * An internal IPF person may have platform roles and no memberships; a client has memberships and no platform roles.
 */
export type AccountSessionView = {
  user: { id: number; fullName: string; email: string; status: AccountStatus };
  platformRoles: PlatformRole[];
  permissions: import("./platformPermissions").PlatformPermission[];
  memberships: AccountMembership[];
  /** The workspace the person is acting in. One membership selects itself; with several, the stored choice (or the first). Null with none. */
  activeBusiness: AccountMembership | null;
  /** Where the person belongs after signing in: the client dashboard, or the internal area for staff without a business. */
  landingPath: "/dashboard" | "/admin";
};

export function landingPathFor(view: Pick<AccountSessionView, "memberships" | "platformRoles">): AccountSessionView["landingPath"] {
  return view.memberships.length === 0 && view.platformRoles.length > 0 ? "/admin" : "/dashboard";
}

export const BUSINESS_NAME_MIN = 2;
export const BUSINESS_DESCRIPTION_MAX = 2000;
export const BUSINESS_YEAR_MIN = 1900;

const optionalText = (max: number) =>
  z.string().trim().max(max).transform(value => (value === "" ? null : value)).nullable().optional();

/** Only http(s) addresses, stored without surrounding spaces. Anything else (javascript:, data:, ...) is refused. */
const websiteSchema = z
  .string()
  .trim()
  .max(512)
  .transform(value => (value === "" ? null : value))
  .refine(value => {
    if (value === null) return true;
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a valid website address.")
  .transform(value => (value === null || /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`))
  .nullable()
  .optional();

/** Business profile update. Only the fields sent are changed; a blank optional field clears it. */
export const updateBusinessInputSchema = z.object({
  businessId: z.number().int().positive(),
  name: z.string().trim().min(BUSINESS_NAME_MIN, "Enter your business name.").max(BUSINESS_NAME_MAX_LENGTH).optional(),
  description: optionalText(BUSINESS_DESCRIPTION_MAX),
  yearFounded: z.number().int().min(BUSINESS_YEAR_MIN, "Enter a valid year.").max(new Date().getFullYear(), "Enter a valid year.").nullable().optional(),
  sector: optionalText(128),
  website: websiteSchema,
  staffBand: optionalText(64),
  revenueBand: optionalText(64),
  country: optionalText(64),
  state: optionalText(64),
});
export type UpdateBusinessInput = z.input<typeof updateBusinessInputSchema>;

/** Account profile update. Email is the identity key and cannot be changed here; unknown fields are ignored. */
export const updateAccountInputSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(ACCOUNT_FULL_NAME_MAX_LENGTH),
});

export const changePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
    newPassword: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
    confirmPassword: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
  })
  .superRefine((value, context) => {
    const policy = validateAccountPassword(value.newPassword);
    if (policy) context.addIssue({ code: "custom", path: ["newPassword"], message: policy });
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "The password confirmation does not match." });
    }
    if (value.newPassword === value.currentPassword) {
      context.addIssue({ code: "custom", path: ["newPassword"], message: "Choose a password you have not used for this account just now." });
    }
  });

export const switchWorkspaceInputSchema = z.object({ businessId: z.number().int().positive() });
