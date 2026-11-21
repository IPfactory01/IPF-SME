/**
 * Instagram on the Content board (R108): connecting an account from Instagram's redirect, and each check reading the
 * posts and figures and marking the board. Real code on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via
 * `pnpm test:db`). Instagram is a fake behind a stubbed fetch: nothing leaves the process.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, insertFixture, type DbHarness } from "./harness";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
vi.mock("pg", () => ({ default: { Pool: class { on() { return this; } } } }));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () =>
    new Proxy({}, {
      get: (_target, property) => {
        const value = holder.current[property as string];
        return typeof value === "function" ? value.bind(holder.current) : value;
      },
    }),
}));
vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, cookieSecret: "test-cookie-secret-not-real", instagramAppId: "1234567890", instagramAppSecret: "fixture-secret-not-real", appOrigin: "https://www.ipfactory.co" } }));

const { handleInstagramCallback, sealToken, signConnectState, syncInstagram } = await import("@server/instagram");

const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: 90_000, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

/** The fake account: what Instagram would hand back for these calls. Anything else is a test failure. */
type FakeMedia = { id: string; caption?: string; media_product_type: string; media_type: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number; views: number; shares: number };
const ig = { media: [] as FakeMedia[], stories: [] as FakeMedia[], tokenDead: false, refreshed: 0, insightCalls: 0 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
async function fakeInstagram(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(String(input));
  if (url.href === "https://api.instagram.com/oauth/access_token" && init?.method === "POST") return json(200, { access_token: "short-fixture", user_id: 17841400000000001 });
  if (url.pathname === "/access_token" && url.searchParams.get("grant_type") === "ig_exchange_token") return json(200, { access_token: "long-fixture-token", token_type: "bearer", expires_in: 5_184_000 });
  if (url.pathname === "/refresh_access_token") { ig.refreshed += 1; return json(200, { access_token: "refreshed-fixture-token", expires_in: 5_184_000 }); }
  if (ig.tokenDead) return json(400, { error: { message: "Error validating access token", type: "OAuthException", code: 190 } });
  if (url.pathname.endsWith("/me")) return json(200, { user_id: "17841400000000001", username: "fictional.studio" });
  if (url.pathname.endsWith("/me/media")) return json(200, { data: ig.media.map(({ views: _v, shares: _s, ...media }) => media) });
  if (url.pathname.endsWith("/me/stories")) return json(200, { data: ig.stories.map(({ id, media_type, permalink, timestamp }) => ({ id, media_type, permalink, timestamp })) });
  const insights = /\/([^/]+)\/insights$/.exec(url.pathname);
  if (insights) {
    ig.insightCalls += 1;
    const media = [...ig.media, ...ig.stories].find(item => item.id === insights[1])!;
    const metrics = url.searchParams.get("metric")!.split(",");
    const values: Record<string, number> = { views: media.views, reach: Math.round(media.views * 0.7), likes: media.like_count ?? 0, comments: media.comments_count ?? 0, shares: media.shares, saved: 4 };
    return json(200, { data: metrics.map(name => ({ name, period: "lifetime", values: [{ value: values[name] }] })) });
  }
  throw new Error(`A test made an unexpected request: ${url.href}`);
}

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Instagram on the Content board on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let engagementId: number;
    let userId: number;
    const startedOn = "2026-11-06";

    async function freshEngagement() {
      const engagement = await insertFixture(db, schema.engagements, { type: "digital_marketing", startedOn });
      return engagement.id as number;
    }
    async function connected(id: number) {
      const [connection] = await db.insert(schema.socialConnections).values({ engagementId: id, platform: "instagram", accountId: "17841400000000001", username: "fictional.studio", tokenSealed: sealToken("long-fixture-token"), tokenExpiresAt: new Date(Date.now() + 50 * 86_400_000), connectedByUserId: userId }).returning();
      return connection;
    }
    const board = async (id: number) => db.select().from(schema.engagementContentItems).where(eq(schema.engagementContentItems.engagementId, id));
    const plan = async (id: number, items: Array<{ kind: "reel" | "post" | "story"; title: string; month: number; dueOn: string; status?: string }>) => {
      for (const [index, item] of items.entries()) await db.insert(schema.engagementContentItems).values({ engagementId: id, sortOrder: index, status: "planned", ...item });
    };

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      userId = (await insertFixture(db, schema.users, { email: "lead@example.com" })).id as number;
    }, 120_000);
    afterAll(async () => { await harness?.close(); });
    beforeEach(async () => {
      Object.assign(ig, { media: [], stories: [], tokenDead: false, refreshed: 0, insightCalls: 0 });
      engagementId = await freshEngagement();
    });

    it("connects from Instagram's redirect, keeps the token sealed, and runs the first check", async () => {
      ig.media = [{ id: "m-1", caption: "Behind the scenes at the studio", media_product_type: "REELS", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/AAA/", timestamp: "2026-11-20T15:04:00+0000", like_count: 120, comments_count: 9, views: 5400, shares: 31 }];
      const sent: { status: number; body: string } = { status: 0, body: "" };
      const res = { set: () => res, status(code: number) { sent.status = code; return res; }, type: () => res, send(body: string) { sent.body = body; return res; } };
      const state = signConnectState({ engagementId, userId, expiresAt: Date.now() + 60_000 });
      await handleInstagramCallback({ query: { code: "fixture-code#_", state } } as never, res as never, fakeInstagram as typeof fetch);
      expect(sent.status).toBe(200);
      expect(sent.body).toContain("@fictional.studio is connected");
      const [connection] = await db.select().from(schema.socialConnections).where(eq(schema.socialConnections.engagementId, engagementId));
      expect(connection).toMatchObject({ platform: "instagram", username: "fictional.studio", status: "connected", connectedByUserId: userId });
      expect(connection.tokenSealed).not.toContain("long-fixture-token");
      expect(connection.lastSyncAt).not.toBeNull();
      const posts = await db.select().from(schema.socialPosts).where(eq(schema.socialPosts.engagementId, engagementId));
      expect(posts).toHaveLength(1);
    });

    it("refuses a redirect whose state was not signed by The Shift, and saves nothing", async () => {
      const sent = { status: 0 };
      const res = { set: () => res, status(code: number) { sent.status = code; return res; }, type: () => res, send: () => res };
      await handleInstagramCallback({ query: { code: "fixture-code", state: "forged.state" } } as never, res as never, fakeInstagram as typeof fetch);
      expect(sent.status).toBe(400);
      expect(await db.select().from(schema.socialConnections).where(eq(schema.socialConnections.engagementId, engagementId))).toHaveLength(0);
    });

    it("marks each planned item Published with its link and time, adds a post that was not planned, and keeps the figures", async () => {
      await plan(engagementId, [
        { kind: "reel", title: "Reel: the new collection", month: 1, dueOn: "2026-11-19" },
        { kind: "reel", title: "Reel: client story", month: 1, dueOn: "2026-11-28" },
        { kind: "story", title: "Story: studio hours", month: 1, dueOn: "2026-11-20" },
      ]);
      ig.media = [
        { id: "m-1", caption: "The new collection", media_product_type: "REELS", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/AAA/", timestamp: "2026-11-20T15:04:00+0000", like_count: 120, comments_count: 9, views: 5400, shares: 31 },
        { id: "m-2", caption: "A photo we did not plan", media_product_type: "FEED", media_type: "IMAGE", permalink: "https://www.instagram.com/p/BBB/", timestamp: "2026-11-21T09:00:00+0000", like_count: 40, comments_count: 2, views: 900, shares: 3 },
        { id: "m-0", caption: "Before kickoff", media_product_type: "REELS", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/OLD/", timestamp: "2026-11-01T09:00:00+0000", like_count: 5, comments_count: 0, views: 80, shares: 0 },
      ];
      ig.stories = [{ id: "s-1", media_product_type: "STORY", media_type: "IMAGE", permalink: "https://www.instagram.com/stories/fictional.studio/1/", timestamp: "2026-11-21T07:30:00+0000", views: 300, shares: 1 }];
      const connection = await connected(engagementId);
      const result = await syncInstagram(db, connection, fakeInstagram as typeof fetch, new Date("2026-11-21T17:47:00Z"));
      expect(result).toMatchObject({ ok: true, read: 4, published: 2, added: 1 });

      const items = await board(engagementId);
      const reel = items.find((item: { title: string }) => item.title === "Reel: the new collection");
      expect(reel).toMatchObject({ status: "published", link: "https://www.instagram.com/reel/AAA/" });
      expect(reel.publishedAt.toISOString()).toBe("2026-11-20T15:04:00.000Z");
      expect(items.find((item: { title: string }) => item.title === "Reel: client story").status).toBe("planned");
      expect(items.find((item: { title: string }) => item.title === "Story: studio hours")).toMatchObject({ status: "published", link: "https://www.instagram.com/stories/fictional.studio/1/" });
      const added = items.find((item: { link: string | null }) => item.link === "https://www.instagram.com/p/BBB/");
      expect(added).toMatchObject({ kind: "post", month: 1, status: "published", title: "Post: A photo we did not plan", dueOn: "2026-11-21" });

      const posts = await db.select().from(schema.socialPosts).where(eq(schema.socialPosts.engagementId, engagementId));
      expect(posts).toHaveLength(4);
      expect(posts.find((post: { externalId: string }) => post.externalId === "m-1")).toMatchObject({ kind: "reel", views: 5400, likes: 120, comments: 9, shares: 31, saves: 4, contentItemId: reel.id });
      // Before kickoff: kept with its figures, not on the board.
      expect(posts.find((post: { externalId: string }) => post.externalId === "m-0").contentItemId).toBeNull();
    });

    it("updates the figures on the next check without adding the posts or items again", async () => {
      await plan(engagementId, [{ kind: "reel", title: "Reel: launch", month: 1, dueOn: "2026-11-20" }]);
      ig.media = [{ id: "m-9", caption: "Launch", media_product_type: "REELS", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/LAUNCH/", timestamp: "2026-11-20T15:04:00+0000", like_count: 10, comments_count: 1, views: 100, shares: 0 }];
      const connection = await connected(engagementId);
      await syncInstagram(db, connection, fakeInstagram as typeof fetch, new Date("2026-11-20T17:47:00Z"));
      ig.media[0] = { ...ig.media[0], like_count: 75, views: 2300, shares: 12 };
      const second = await syncInstagram(db, connection, fakeInstagram as typeof fetch, new Date("2026-11-21T05:47:00Z"));
      expect(second).toMatchObject({ ok: true, published: 0, added: 0 });
      const posts = await db.select().from(schema.socialPosts).where(eq(schema.socialPosts.engagementId, engagementId));
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({ views: 2300, likes: 75, shares: 12 });
      expect(await board(engagementId)).toHaveLength(1);
    });

    it("renews the token before it runs out", async () => {
      const connection = await connected(engagementId);
      await db.update(schema.socialConnections).set({ tokenExpiresAt: new Date(Date.now() + 5 * 86_400_000) }).where(eq(schema.socialConnections.id, connection.id));
      const [stale] = await db.select().from(schema.socialConnections).where(eq(schema.socialConnections.id, connection.id));
      await syncInstagram(db, stale, fakeInstagram as typeof fetch);
      expect(ig.refreshed).toBe(1);
      const [fresh] = await db.select().from(schema.socialConnections).where(eq(schema.socialConnections.id, connection.id));
      expect(fresh.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);
    });

    it("asks for the account to be connected again when Instagram refuses the token, and says so", async () => {
      const connection = await connected(engagementId);
      ig.tokenDead = true;
      const result = await syncInstagram(db, connection, fakeInstagram as typeof fetch);
      expect(result).toMatchObject({ ok: false, tokenProblem: true });
      const [row] = await db.select().from(schema.socialConnections).where(and(eq(schema.socialConnections.id, connection.id)));
      expect(row.status).toBe("needs_reconnect");
      expect(row.lastError).toMatch(/^Instagram needs connecting again/);
    });
  });
}
