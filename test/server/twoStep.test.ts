import { afterEach, describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  deviceFingerprint,
  hashRecoveryCode,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  openSecret,
  otpauthUri,
  sealSecret,
  totpCode,
  totpStep,
  twoStepEnforced,
  useRecoveryCode,
} from "@server/twoStep";

/** RFC 6238 appendix B: the ASCII secret "12345678901234567890" with SHA-1; the last six of the eight-digit values. */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const RFC_VECTORS: Array<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

describe("time-based codes", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    for (const [seconds, code] of RFC_VECTORS) expect(totpCode(RFC_SECRET, totpStep(seconds * 1000))).toBe(code);
  });

  it("round-trips base32 and makes 160-bit secrets", () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(base32Decode("gezd gnbv-gy3t")).toEqual(base32Decode("GEZDGNBVGY3T"));
    expect(() => base32Decode("not!base32")).toThrow();
  });

  it("accepts the current code and one step either side, and never a step already used", () => {
    const now = 1_800_000_000_000;
    const step = totpStep(now);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step), null, now)).toBe(step);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), null, now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), null, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step), step, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), step, now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, " " + totpCode(RFC_SECRET, step).replace(/(\d{3})/, "$1 "), null, now)).toBe(step);
    expect(matchTotp(RFC_SECRET, "12345", null, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, "abcdef", null, now)).toBeNull();
  });

  it("labels the authenticator entry with the product and the person's email", () => {
    const uri = otpauthUri("ABCDEFGH", "ada@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("ada%40example.com");
    expect(uri).toContain("secret=ABCDEFGH");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("sealing the secret", () => {
  it("never stores the secret in the clear, and refuses a tampered value", () => {
    const secret = newTotpSecret();
    const sealed = sealSecret(secret);
    expect(sealed).not.toContain(secret);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealSecret(secret)).not.toBe(sealed);
    expect(openSecret(sealed)).toBe(secret);
    const parts = sealed.split(".");
    const flipped = parts[3][0] === "A" ? "B" + parts[3].slice(1) : "A" + parts[3].slice(1);
    expect(() => openSecret([parts[0], parts[1], parts[2], flipped].join("."))).toThrow();
    expect(() => openSecret("v2.a.b.c")).toThrow();
  });
});

describe("recovery codes", () => {
  it("makes eight different codes, stores only hashes, and each works once, however it is typed", () => {
    const { codes, hashes } = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashes.join("")).not.toContain(codes[0]);
    const left = useRecoveryCode(hashes, ` ${codes[2].toUpperCase().replace("-", " ")} `);
    expect(left).toHaveLength(7);
    expect(left).not.toContain(hashRecoveryCode(codes[2]));
    expect(useRecoveryCode(left!, codes[2])).toBeNull();
    expect(useRecoveryCode(hashes, "zzzz-zzzz")).toBeNull();
  });
});

describe("device fingerprint", () => {
  it("is the same for one browser on nearby addresses and different for another browser", () => {
    expect(deviceFingerprint("Laptop", "203.0.113.10")).toBe(deviceFingerprint("Laptop", "203.0.113.99"));
    expect(deviceFingerprint("Laptop", "203.0.113.10")).not.toBe(deviceFingerprint("Phone", "203.0.113.10"));
    expect(deviceFingerprint("Laptop", "203.0.113.10")).not.toBe(deviceFingerprint("Laptop", "198.51.100.10"));
    expect(deviceFingerprint(undefined, undefined)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("when two-step is required", () => {
  const original = process.env.TWO_STEP_REQUIRED;
  afterEach(() => { process.env.TWO_STEP_REQUIRED = original; });

  it("is always on in production, on by default elsewhere, and can be switched off only outside production", () => {
    expect(twoStepEnforced({ NODE_ENV: "production", TWO_STEP_REQUIRED: "false" })).toBe(true);
    expect(twoStepEnforced({ NODE_ENV: "development" })).toBe(true);
    expect(twoStepEnforced({ NODE_ENV: "development", TWO_STEP_REQUIRED: " FALSE " })).toBe(false);
    expect(twoStepEnforced({ NODE_ENV: "test", TWO_STEP_REQUIRED: "true" })).toBe(true);
  });
});
