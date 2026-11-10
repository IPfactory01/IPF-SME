import { describe, expect, it } from "vitest";
import { readTeamPreviewToken, teamPreviewCookieOptions, teamPreviewToken } from "@server/teamPreview";

/** Preview as a team member (R76): the signed cookie. The preview end to end is in test/db/engagements.db.test.ts. */
describe("the preview cookie", () => {
  const NOW = Date.parse("2026-11-10T12:00:00Z");
  const until = NOW + 30 * 60_000;

  it("reads back who started it, whom it shows and when it ends", () => {
    expect(readTeamPreviewToken(teamPreviewToken(4, 9, until), NOW)).toEqual({ byUserId: 4, asUserId: 9, expiresAt: until });
  });

  it("is refused when altered, malformed or over", () => {
    const token = teamPreviewToken(4, 9, until);
    const [, , expires, signature] = token.split(".");
    expect(readTeamPreviewToken(`4.10.${expires}.${signature}`, NOW)).toBeNull();
    expect(readTeamPreviewToken(`5.9.${expires}.${signature}`, NOW)).toBeNull();
    expect(readTeamPreviewToken(`4.9.${Number(expires) + 60_000}.${signature}`, NOW)).toBeNull();
    expect(readTeamPreviewToken(`${token}x`, NOW)).toBeNull();
    expect(readTeamPreviewToken("4.9", NOW)).toBeNull();
    expect(readTeamPreviewToken("a.b.c.d", NOW)).toBeNull();
    expect(readTeamPreviewToken(null, NOW)).toBeNull();
    expect(readTeamPreviewToken(token, until)).toBeNull();
  });

  it("is never readable by the page's scripts, and is sent only from this site", () => {
    const options = teamPreviewCookieOptions({ secure: false, protocol: "http" } as never, "production");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "strict", secure: true, path: "/" });
  });
});
