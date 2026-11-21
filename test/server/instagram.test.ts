import { describe, expect, it, vi } from "vitest";

vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, cookieSecret: "test-cookie-secret-not-real", instagramAppId: "1234567890", instagramAppSecret: "fixture-secret-not-real", appOrigin: "https://www.ipfactory.co" } }));

const { engagementMonthOf, instagramAuthorizeUrl, kindOf, openToken, pickItem, readConnectState, sealToken, signConnectState } = await import("@server/instagram");

/** Instagram on the Content board (R108): the rules that need no network or database. */
describe("Instagram on the Content board", () => {
  it("reads a Reel, a Story and anything else in the feed as a Post", () => {
    expect(kindOf({ media_product_type: "REELS", media_type: "VIDEO" })).toBe("reel");
    expect(kindOf({ media_product_type: "STORY", media_type: "IMAGE" })).toBe("story");
    expect(kindOf({ media_product_type: "FEED", media_type: "CAROUSEL_ALBUM" })).toBe("post");
    expect(kindOf({ media_type: "IMAGE" })).toBe("post");
  });

  it("counts engagement months as 30 days from kickoff, and nothing before kickoff or after the last day", () => {
    expect(engagementMonthOf("2026-11-06", "2026-11-06", 90)).toBe(1);
    expect(engagementMonthOf("2026-11-06", "2026-12-05", 90)).toBe(1);
    expect(engagementMonthOf("2026-11-06", "2026-12-06", 90)).toBe(2);
    expect(engagementMonthOf("2026-11-06", "2027-02-03", 90)).toBe(3);
    expect(engagementMonthOf("2026-11-06", "2027-02-04", 90)).toBeNull();
    expect(engagementMonthOf("2026-11-06", "2026-11-05", 90)).toBeNull();
    expect(engagementMonthOf(null, "2026-11-20", 90)).toBeNull();
  });

  it("marks the planned item of the same kind and month due nearest the day, never one already published or tied to a post", () => {
    const items = [
      { id: 1, kind: "reel" as const, month: 1, status: "planned", dueOn: "2026-11-10", sortOrder: 1, linked: false },
      { id: 2, kind: "reel" as const, month: 1, status: "approved", dueOn: "2026-11-19", sortOrder: 2, linked: false },
      { id: 3, kind: "reel" as const, month: 1, status: "published", dueOn: "2026-11-20", sortOrder: 3, linked: false },
      { id: 4, kind: "reel" as const, month: 1, status: "planned", dueOn: "2026-11-21", sortOrder: 4, linked: true },
      { id: 5, kind: "story" as const, month: 1, status: "planned", dueOn: "2026-11-20", sortOrder: 5, linked: false },
      { id: 6, kind: "reel" as const, month: 2, status: "planned", dueOn: "2026-11-20", sortOrder: 6, linked: false },
    ];
    expect(pickItem(items, { kind: "reel", day: "2026-11-20", month: 1 })?.id).toBe(2);
    expect(pickItem(items, { kind: "story", day: "2026-11-20", month: 1 })?.id).toBe(5);
    expect(pickItem(items, { kind: "post", day: "2026-11-20", month: 1 })).toBeNull();
  });

  it("seals the access token so the database never holds it in the clear", () => {
    const sealed = sealToken("IGAAfixture-token-not-real");
    expect(sealed).not.toContain("IGAAfixture");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(openToken(sealed)).toBe("IGAAfixture-token-not-real");
    expect(() => openToken(`${sealed.slice(0, -2)}xx`)).toThrow();
  });

  it("accepts the redirect only with a state it signed, for the engagement and person it names, within 15 minutes", () => {
    const now = Date.parse("2026-11-21T10:00:00Z");
    const state = signConnectState({ engagementId: 7, userId: 3, expiresAt: now + 60_000 });
    expect(readConnectState(state, now)).toEqual({ engagementId: 7, userId: 3, expiresAt: now + 60_000 });
    expect(readConnectState(state, now + 120_000)).toBeNull();
    const [payload, mac] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ engagementId: 8, userId: 3, expiresAt: now + 60_000 })).toString("base64url");
    expect(readConnectState(`${forged}.${mac}`, now)).toBeNull();
    expect(readConnectState(`${payload}.`, now)).toBeNull();
    expect(readConnectState(undefined, now)).toBeNull();
  });

  it("asks Instagram for read-only access, and comes back to The Shift", () => {
    const url = new URL(instagramAuthorizeUrl(7, 3, Date.parse("2026-11-21T10:00:00Z")));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_insights");
    expect(url.searchParams.get("redirect_uri")).toBe("https://www.ipfactory.co/api/social/instagram/callback");
    expect(url.searchParams.get("client_id")).toBe("1234567890");
    expect(url.searchParams.get("state")).toBeTruthy();
  });
});
