/**
 * Two-step sign-in: a six-digit code from an authenticator app (time-based one-time passwords, RFC 6238, the scheme
 * Google Authenticator, Microsoft Authenticator and 1Password use), plus single-use recovery codes for a lost phone.
 *
 * The shared secret is never stored in the clear: it is sealed with AES-256-GCM under a key derived from JWT_SECRET
 * (HKDF, its own label), so a copy of the database alone cannot produce codes. Recovery codes are stored as SHA-256
 * hashes only. Pure functions here; the sign-in flow that uses them lives in accountAuth.ts.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";
import { sha256 } from "./adminSecurity";
import { BRAND } from "../shared/brand";

/**
 * Two-step sign-in for everyone with an internal role. Always on in production. Only a development or test run may
 * switch it off with TWO_STEP_REQUIRED=false (the unit tests of unrelated features do, and the two-step tests switch
 * it back on). Read on every call, so a test can change it.
 */
export function twoStepEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.TWO_STEP_REQUIRED?.trim().toLowerCase() !== "false";
}

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** A code from the step before or after is accepted, for a phone clock up to 30 seconds out. */
export const TOTP_DRIFT_STEPS = 1;
export const RECOVERY_CODE_COUNT = 8;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const index = BASE32.indexOf(clean[i]);
    if (index < 0) throw new Error("Not a base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 as authenticator apps expect it. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for one time step (HOTP over the step counter, RFC 4226 dynamic truncation). */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * The step a code belongs to, or null. A code is accepted only for a step later than `lastUsedStep`, so the same
 * code (or an older one) can never be used twice, even within its 30 seconds.
 */
export function matchTotp(secret: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = totpStep(now);
  for (let drift = -TOTP_DRIFT_STEPS; drift <= TOTP_DRIFT_STEPS; drift++) {
    const step = current + drift;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

/** What an authenticator app scans or opens: the issuer and the person's email label the entry. */
export function otpauthUri(secret: string, email: string): string {
  const issuer = BRAND.productEndorsement;
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

const DEVELOPMENT_KEY_MATERIAL = "ipf-development-only-two-step-key";

function sealingKey(): Buffer {
  const material = ENV.cookieSecret || (ENV.isProduction ? "" : DEVELOPMENT_KEY_MATERIAL);
  if (!material) throw new Error("JWT_SECRET is not set, so two-step secrets cannot be sealed.");
  return Buffer.from(hkdfSync("sha256", material, "ipf-two-step-v1", "totp-secret", 32));
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function sealSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown two-step secret format");
  const decipher = createDecipheriv("aes-256-gcm", sealingKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** Recovery codes as people see them ("k7m2-9qpx") and their stored hashes. */
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
  return sha256(code.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** The remaining hashes once `code` is used, or null when it is not one of them. */
export function useRecoveryCode(hashes: readonly string[], code: string): string[] | null {
  const hash = hashRecoveryCode(code);
  if (!hashes.includes(hash)) return null;
  return hashes.filter(item => item !== hash);
}

/** A short fingerprint of the browser and network, to notice a sign-in from a device not seen before. */
export function deviceFingerprint(userAgent: string | undefined, ip: string | undefined): string {
  const browser = (userAgent ?? "").slice(0, 300);
  // The first three parts of an IPv4 address (or the first four of IPv6): a phone moving between nearby addresses is the same device.
  const address = (ip ?? "").includes(":") ? (ip ?? "").split(":").slice(0, 4).join(":") : (ip ?? "").split(".").slice(0, 3).join(".");
  return sha256(`${browser}|${address}`);
}
