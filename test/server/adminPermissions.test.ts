import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSION_DEFINITIONS,
  parseAdminPermissions,
  serializeAdminPermissions,
} from "@shared/adminPermissions";

describe("administrator permission policy", () => {
  it("exposes the complete participant-review capabilities as selectable responsibilities", () => {
    const ids = ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.id);
    expect(ids).toEqual(expect.arrayContaining([
      "view_participants",
      "view_assessments",
      "view_documents",
      "view_communications",
      "decide_applications",
      "manage_payments",
      "manage_cohorts",
    ]));
  });

  it("serializes only unique, recognised administrator capabilities", () => {
    const serialized = serializeAdminPermissions([
      "view_participants",
      "view_assessments",
      "view_participants",
    ]);

    expect(serialized).toBe('["view_participants","view_assessments"]');
  });

  it("rejects malformed or unrecognised stored permission data instead of granting access", () => {
    expect(parseAdminPermissions('{not-json}')).toEqual([]);
    expect(parseAdminPermissions('["view_participants","superuser","view_assessments"]'))
      .toEqual(["view_participants", "view_assessments"]);
    expect(parseAdminPermissions(JSON.stringify({ view_participants: true }))).toEqual([]);
  });
});
