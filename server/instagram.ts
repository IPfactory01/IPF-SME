/**
 * Instagram on the Content board (R108, ET 21 November 2026). The team connects a client's Instagram professional
 * account once, with the account owner's permission ("Instagram API with Instagram Login"); twice a day the server reads
 * the account's posts, Reels and Stories with their figures, and marks the engagement's Content board: a post published
 * a planned item, or is added as one. Stories disappear from the API after 24 hours, which is why it runs twice a day.
 *
 * Only official access, never scraping. The token is sealed (AES-256-GCM) in social_connections and never reaches a
 * browser. Figures are refreshed for each post's first 30 days.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { engagementContentItems, engagements, socialConnections, socialPosts, type SocialConnection } from "../drizzle/schema";
import { addDays, lagosDay } from "../shared/agreement";
import { DATED_TYPES, type ContentKind } from "../shared/engagementTypes";
import { recordAudit } from "./audit";
import { getDb } from "./db";
import { ENV } from "./_core/env";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Fetch = typeof fetch;

export const INSTAGRAM_CALLBACK_PATH = "/api/social/instagram/callback";
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"] as const;
const GRAPH = "https://graph.instagram.com/v22.0";
const REFRESH_DAYS = 30;
const STATE_MINUTES = 15;
const DAY_MS = 86_400_000;

export const instagramConfigured = () => Boolean(ENV.instagramAppId && ENV.instagramAppSecret);
export const instagramRedirectUri = () => `${ENV.appOrigin}${INSTAGRAM_CALLBACK_PATH}`;

// ---- The sealed token -------------------------------------------------------------------------------------------------

function tokenKey(): Buffer {
  const material = ENV.cookieSecret || (ENV.isProduction ? "" : "ipf-development-only-social-key");
  if (!material) throw new Error("JWT_SECRET is not set, so social tokens cannot be sealed.");
  return Buffer.from(hkdfSync("sha256", material, "ipf-social-token-v1", "access-token", 32));
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openToken(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown token format");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

// ---- The signed state: which engagement, who asked, until when --------------------------------------------------------

type ConnectState = { engagementId: number; userId: number; expiresAt: number };
const stateMac = (payload: string) => createHmac("sha256", tokenKey()).update(`instagram-state:${payload}`).digest("base64url");

export function signConnectState(state: ConnectState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${stateMac(payload)}`;
}

export function readConnectState(value: string | undefined, now = Date.now()): ConnectState | null {
  const [payload, mac] = (value ?? "").split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(stateMac(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectState;
    if (!Number.isInteger(state.engagementId) || !Number.isInteger(state.userId) || state.expiresAt < now) return null;
    return state;
  } catch {
    return null;
  }
}

/** Where the person who owns the account says yes. Opened in a new tab from the Content tab. */
export function instagramAuthorizeUrl(engagementId: number, userId: number, now = Date.now()) {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", ENV.instagramAppId);
  url.searchParams.set("redirect_uri", instagramRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", signConnectState({ engagementId, userId, expiresAt: now + STATE_MINUTES * 60_000 }));
  return url.toString();
}

// ---- Talking to Instagram ---------------------------------------------------------------------------------------------

export class InstagramError extends Error {
  constructor(message: string, readonly tokenProblem = false) { super(message); }
}

async function call<T>(fetcher: Fetch, url: string, init?: RequestInit): Promise<T> {
  let response: globalThis.Response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new InstagramError("Instagram could not be reached.");
  }
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: number; type?: string }; error_message?: string };
  if (!response.ok || body.error) {
    const code = body.error?.code;
    // 190: the token is invalid or expired; the account owner must connect again.
    throw new InstagramError(body.error?.message || body.error_message || `Instagram answered ${response.status}.`, code === 190);
  }
  return body;
}

/** The code from the redirect, for a long-lived token (60 days) and the account it belongs to. */
export async function exchangeCode(code: string, fetcher: Fetch = fetch) {
  const form = new URLSearchParams({ client_id: ENV.instagramAppId, client_secret: ENV.instagramAppSecret, grant_type: "authorization_code", redirect_uri: instagramRedirectUri(), code });
  const short = await call<{ access_token: string; user_id: number | string }>(fetcher, "https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const long = await call<{ access_token: string; expires_in: number }>(fetcher, `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: ENV.instagramAppSecret, access_token: short.access_token })}`);
  const me = await call<{ user_id?: string | number; id?: string; username: string }>(fetcher, `${GRAPH}/me?${new URLSearchParams({ fields: "user_id,username", access_token: long.access_token })}`);
  return { token: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000), accountId: String(me.user_id ?? me.id ?? short.user_id), username: me.username };
}

async function refreshToken(token: string, fetcher: Fetch) {
  const fresh = await call<{ access_token: string; expires_in: number }>(fetcher, `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`);
  return { token: fresh.access_token, expiresAt: new Date(Date.now() + fresh.expires_in * 1000) };
}

type Media = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp: string; like_count?: number; comments_count?: number };

/** A Reel, a Story, or anything else in the feed (a photo, a video, a carousel) as a Post. */
export function kindOf(media: Pick<Media, "media_product_type" | "media_type">): ContentKind {
  if (media.media_product_type === "REELS") return "reel";
  if (media.media_product_type === "STORY") return "story";
  return "post";
}

const METRICS: Record<ContentKind, string[]> = {
  reel: ["views", "reach", "likes", "comments", "shares", "saved"],
  post: ["views", "reach", "likes", "comments", "shares", "saved"],
  story: ["views", "reach", "shares"],
};

export type Figures = { views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null };

/** A post's figures. A metric Instagram refuses for this post leaves that figure empty; it never stops the run. */
async function figuresOf(media: Media, kind: ContentKind, token: string, fetcher: Fetch): Promise<Figures> {
  const figures: Figures = { views: null, reach: null, likes: media.like_count ?? null, comments: media.comments_count ?? null, shares: null, saves: null };
  const read = async (metrics: string[]) => {
    const result = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(fetcher, `${GRAPH}/${media.id}/insights?${new URLSearchParams({ metric: metrics.join(","), access_token: token })}`);
    for (const row of result.data ?? []) {
      const value = row.total_value?.value ?? row.values?.[0]?.value;
      if (typeof value !== "number") continue;
      const key = row.name === "saved" ? "saves" : row.name;
      if (key in figures) figures[key as keyof Figures] = value;
    }
  };
  try {
    await read(METRICS[kind]);
  } catch (error) {
    if (error instanceof InstagramError && error.tokenProblem) throw error;
    // One metric not offered for this post (older posts, some formats) fails the whole request: read them one by one.
    for (const metric of METRICS[kind]) await read([metric]).catch(() => undefined);
  }
  return figures;
}

/** Feed posts and Reels from the last `days` days, newest first, and the Stories still up. */
async function recentMedia(token: string, since: Date, fetcher: Fetch): Promise<Media[]> {
  const fields = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
  const out: Media[] = [];
  let next: string | undefined = `${GRAPH}/me/media?${new URLSearchParams({ fields, limit: "50", access_token: token })}`;
  for (let page = 0; next && page < 6; page += 1) {
    const result: { data: Media[]; paging?: { next?: string } } = await call(fetcher, next);
    const fresh = (result.data ?? []).filter((media) => new Date(media.timestamp) >= since);
    out.push(...fresh);
    next = fresh.length === (result.data ?? []).length ? result.paging?.next : undefined;
  }
  const stories = await call<{ data: Media[] }>(fetcher, `${GRAPH}/me/stories?${new URLSearchParams({ fields: "id,caption,media_type,media_product_type,permalink,timestamp", access_token: token })}`).catch((error) => {
    if (error instanceof InstagramError && error.tokenProblem) throw error;
    return { data: [] };
  });
  out.push(...(stories.data ?? []).map((story) => ({ ...story, media_product_type: "STORY" })));
  return out;
}

// ---- Matching a post to the Content board -----------------------------------------------------------------------------

/**
 * The engagement month a day falls in: month 1 is the 30 days from kickoff. Null before kickoff, without one, or after
 * the engagement's last day (`durationDays`), so posts outside the engagement are kept but never counted on the board.
 */
export function engagementMonthOf(startedOn: string | null, day: string, durationDays?: number): number | null {
  if (!startedOn || day < startedOn) return null;
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${startedOn}T00:00:00Z`)) / DAY_MS);
  if (durationDays !== undefined && days >= durationDays) return null;
  return Math.floor(days / 30) + 1;
}

type BoardItem = { id: number; kind: ContentKind; month: number; status: string; dueOn: string | null; sortOrder: number; linked: boolean };

/**
 * The planned item a post published: same kind, same month, not yet tied to a post, not already marked Published by
 * hand with a link; the one due nearest the day it went out. Null when there is none, and the post is added instead.
 */
export function pickItem(items: BoardItem[], post: { kind: ContentKind; day: string; month: number }): BoardItem | null {
  const open = items.filter((item) => item.kind === post.kind && item.month === post.month && !item.linked && item.status !== "published");
  const distance = (item: BoardItem) => (item.dueOn ? Math.abs(Date.parse(item.dueOn) - Date.parse(post.day)) : Number.MAX_SAFE_INTEGER);
  return open.sort((a, b) => distance(a) - distance(b) || a.sortOrder - b.sortOrder || a.id - b.id)[0] ?? null;
}

const titleFrom = (kind: ContentKind, caption: string | null, day: string) => {
  const words = (caption ?? "").replace(/\s+/g, " ").trim();
  const label = kind === "reel" ? "Reel" : kind === "story" ? "Story" : "Post";
  return (words ? `${label}: ${words}` : `${label} posted ${day}`).slice(0, 120);
};

/** Ties each new post to its Content board item, marking it Published with its link and time, or adds it. */
async function matchPosts(db: Db, connection: SocialConnection, startedOn: string | null, durationDays?: number) {
  const unmatched = await db.select().from(socialPosts).where(and(eq(socialPosts.connectionId, connection.id), isNull(socialPosts.contentItemId))).orderBy(asc(socialPosts.postedAt));
  if (!unmatched.length) return { published: 0, added: 0 };
  const linkedIds = new Set((await db.select({ id: socialPosts.contentItemId }).from(socialPosts).where(eq(socialPosts.engagementId, connection.engagementId))).map((row) => row.id).filter((id): id is number => id !== null));
  const board = (await db.select().from(engagementContentItems).where(eq(engagementContentItems.engagementId, connection.engagementId)))
    .map((item) => ({ id: item.id, kind: item.kind, month: item.month, status: item.status, dueOn: item.dueOn, sortOrder: item.sortOrder, linked: linkedIds.has(item.id) }));
  let published = 0;
  let added = 0;
  for (const post of unmatched) {
    const day = lagosDay(post.postedAt);
    const month = engagementMonthOf(startedOn, day, durationDays);
    if (month === null) continue; // Outside the engagement: kept with its figures, not counted on the board.
    const item = pickItem(board, { kind: post.kind, day, month });
    if (item) {
      await db.update(engagementContentItems).set({ status: "published", publishedAt: post.postedAt, link: post.permalink }).where(eq(engagementContentItems.id, item.id));
      item.linked = true;
      item.status = "published";
      await db.update(socialPosts).set({ contentItemId: item.id }).where(eq(socialPosts.id, post.id));
      published += 1;
    } else {
      const [created] = await db.insert(engagementContentItems).values({
        engagementId: connection.engagementId, kind: post.kind, title: titleFrom(post.kind, post.caption, day), month, status: "published", dueOn: day, link: post.permalink, publishedAt: post.postedAt, sortOrder: 1000,
      }).returning({ id: engagementContentItems.id });
      board.push({ id: created.id, kind: post.kind, month, status: "published", dueOn: day, sortOrder: 1000, linked: true });
      await db.update(socialPosts).set({ contentItemId: created.id }).where(eq(socialPosts.id, post.id));
      added += 1;
    }
  }
  return { published, added };
}

// ---- One check of one account -----------------------------------------------------------------------------------------

/** Reads the account, saves each post and its figures, and marks the board. Records the outcome on the connection. */
export async function syncInstagram(db: Db, connection: SocialConnection, fetcher: Fetch = fetch, now = new Date()) {
  const [engagement] = await db.select({ startedOn: engagements.startedOn, type: engagements.type }).from(engagements).where(eq(engagements.id, connection.engagementId)).limit(1);
  try {
    let token = openToken(connection.tokenSealed);
    if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() - now.getTime() < REFRESH_DAYS * DAY_MS) {
      const fresh = await refreshToken(token, fetcher);
      token = fresh.token;
      await db.update(socialConnections).set({ tokenSealed: sealToken(token), tokenExpiresAt: fresh.expiresAt }).where(eq(socialConnections.id, connection.id));
    }
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const media = await recentMedia(token, since, fetcher);
    for (const item of media) {
      const kind = kindOf(item);
      const figures = await figuresOf(item, kind, token, fetcher);
      const values = { permalink: item.permalink ?? null, caption: item.caption ?? null, ...figures, metricsAt: now };
      await db.insert(socialPosts)
        .values({ connectionId: connection.id, engagementId: connection.engagementId, platform: "instagram", externalId: item.id, kind, postedAt: new Date(item.timestamp), ...values })
        .onConflictDoUpdate({ target: [socialPosts.connectionId, socialPosts.externalId], set: values });
    }
    const matched = await matchPosts(db, connection, engagement?.startedOn ?? null, engagement ? DATED_TYPES[engagement.type]?.durationDays : undefined);
    await db.update(socialConnections).set({ lastSyncAt: now, lastError: null, status: "connected" }).where(eq(socialConnections.id, connection.id));
    return { ok: true as const, read: media.length, ...matched };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "The check failed.";
    const tokenProblem = error instanceof InstagramError && error.tokenProblem;
    await db.update(socialConnections).set({ lastError: tokenProblem ? `Instagram needs connecting again: ${message}`.slice(0, 500) : message, ...(tokenProblem ? { status: "needs_reconnect" as const } : {}) }).where(eq(socialConnections.id, connection.id));
    return { ok: false as const, error: message, tokenProblem };
  }
}

/** The scheduled run: every connected Instagram account, one after another. */
export async function runSocialSync(db: Db, fetcher: Fetch = fetch, now = new Date()) {
  const connections = await db.select().from(socialConnections).where(and(eq(socialConnections.platform, "instagram"), eq(socialConnections.status, "connected")));
  const results = [];
  for (const connection of connections) results.push({ connectionId: connection.id, ...(await syncInstagram(db, connection, fetcher, now)) });
  await recordAudit(db, { action: "social_sync_run", actorUserId: null, details: { accounts: results.length, failed: results.filter((r) => !r.ok).length } });
  return { accounts: results.length, results };
}

// ---- The redirect back from Instagram ---------------------------------------------------------------------------------

const page = (title: string, body: string) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#F7F9FA;color:#12324F;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{max-width:28rem;background:#fff;border:1px solid #DDE3E8;border-radius:12px;padding:28px}h1{font-size:1.25rem;margin:0 0 8px}p{line-height:1.5;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Instagram sends the account owner back here with a code (or a refusal). Ends on a page that says what happened. */
export async function handleInstagramCallback(req: Request, res: Response, fetcher: Fetch = fetch) {
  res.set("Cache-Control", "no-store");
  const state = readConnectState(typeof req.query.state === "string" ? req.query.state : undefined);
  if (!state) return void res.status(400).type("html").send(page("The link has expired", "Go back to the Content tab and press Connect Instagram again."));
  if (typeof req.query.error === "string" || typeof req.query.code !== "string") {
    return void res.status(200).type("html").send(page("Instagram was not connected", "Permission was not given. Nothing was saved. You can close this tab."));
  }
  if (!instagramConfigured()) return void res.status(503).type("html").send(page("Instagram is not set up", "The Instagram app details are missing on the server."));
  const db = await getDb();
  if (!db) return void res.status(503).type("html").send(page("Please try again", "The database is not available just now."));
  try {
    const account = await exchangeCode(req.query.code.replace(/#_$/, ""), fetcher);
    const values = { accountId: account.accountId, username: account.username, tokenSealed: sealToken(account.token), tokenExpiresAt: account.expiresAt, status: "connected" as const, connectedByUserId: state.userId, lastError: null };
    const [connection] = await db.insert(socialConnections).values({ engagementId: state.engagementId, platform: "instagram", ...values })
      .onConflictDoUpdate({ target: [socialConnections.engagementId, socialConnections.platform], set: values }).returning();
    await recordAudit(db, { action: "social_account_connected", actorUserId: state.userId, details: { engagementId: state.engagementId, platform: "instagram", username: account.username } });
    const first = await syncInstagram(db, connection, fetcher);
    const summary = first.ok ? `First check done: ${first.read} posts read.` : "The first check will run with the next scheduled one.";
    res.status(200).type("html").send(page("Instagram connected", `@${escapeHtml(account.username)} is connected to the Content board. ${summary} You can close this tab and go back to The Shift.`));
  } catch (error) {
    console.error("[Instagram] Connecting failed:", error instanceof Error ? error.message : error);
    res.status(502).type("html").send(page("Instagram was not connected", "Instagram did not accept the request. Go back to the Content tab and try again."));
  }
}

/** The posts read for one engagement, newest first, for the Content tab. */
export async function postsFor(db: Pick<Db, "select">, engagementId: number, since?: string) {
  const where = since ? and(eq(socialPosts.engagementId, engagementId), gte(socialPosts.postedAt, new Date(`${addDays(since, 0)}T00:00:00Z`))) : eq(socialPosts.engagementId, engagementId);
  return db.select().from(socialPosts).where(where).orderBy(asc(socialPosts.postedAt));
}

export const connectionsFor = (db: Pick<Db, "select">, engagementIds: number[]) =>
  engagementIds.length ? db.select().from(socialConnections).where(inArray(socialConnections.engagementId, engagementIds)) : Promise.resolve([] as SocialConnection[]);
