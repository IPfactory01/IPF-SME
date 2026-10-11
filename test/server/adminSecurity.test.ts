import { describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  hashAdminPassword,
  isOwnerAdmin,
  normalizeAdminEmail,
  validateAdminPassword,
  verifyAdminPasswordHash,
} from "@server/adminSecurity";

describe("JUMP administrator security", () => {
  it("recognises the configured owner address without case or whitespace sensitivity", () => {
    expect(normalizeAdminEmail("  Owner@Example.TEST ")).toBe("owner@example.test");
    expect(isOwnerAdmin({ email: "Owner@Example.test" })).toBe(true);
    expect(isOwnerAdmin({ email: "other.admin@example.test" })).toBe(false);
  });

  it("requires a long password with sufficient character diversity", () => {
    expect(validateAdminPassword("short"))
      .toBe(`Use at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`);
    expect(validateAdminPassword("alllowercasepassword"))
      .toBe("Use at least three of: uppercase letters, lowercase letters, numbers, and symbols.");
    expect(validateAdminPassword("JUMP-Admin-2026")).toBeNull();
  });

  it("creates salted password hashes that verify only the original value", () => {
    const hash = hashAdminPassword("JUMP-Admin-2026");
    expect(hash).toMatch(/^scrypt\$/);
    expect(verifyAdminPasswordHash("JUMP-Admin-2026", hash)).toBe(true);
    expect(verifyAdminPasswordHash("JUMP-Admin-2027", hash)).toBe(false);
  });
});
