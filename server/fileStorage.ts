import { ENV } from "./_core/env";

/**
 * Private file storage for the engagement room: a Supabase Storage bucket, reached with the service key over its
 * REST API, so no file is ever public. The browser uploads straight to the bucket with a one-off signed upload URL
 * (so Vercel's request size limit does not apply) and downloads with a short-lived signed link, both issued here only
 * after the caller's access to the record was checked (server/engagements.ts). Nothing here decides access.
 *
 * Switched on by SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET; until then the room says to send
 * files on WhatsApp or by email. The three endpoints are kept together so a change on Supabase's side is one edit.
 */

const TIMEOUT_MS = 10_000;

export function isFileStorageConfigured() {
  return Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey && ENV.supabaseStorageBucket);
}

/** The storage origin, for the browser's Content-Security-Policy; empty when storage is not set up. */
export function fileStorageOrigin() {
  try {
    return ENV.supabaseUrl ? new URL(ENV.supabaseUrl).origin : "";
  } catch {
    return "";
  }
}

const base = () => `${ENV.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
const bucket = () => encodeURIComponent(ENV.supabaseStorageBucket);
const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");
const authHeaders = () => ({ authorization: `Bearer ${ENV.supabaseServiceRoleKey}`, apikey: ENV.supabaseServiceRoleKey });
const absolute = (path: string) => (path.startsWith("http") ? path : `${base()}${path.startsWith("/") ? "" : "/"}${path}`);

function requireConfigured() {
  if (!isFileStorageConfigured()) throw new Error("File storage is not configured: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET.");
}

/** A one-off URL the browser PUTs the file to, with the headers it must send. */
export async function createSignedUpload(key: string, contentType: string) {
  requireConfigured();
  const target = `${base()}/object/upload/sign/${bucket()}/${encodeKey(key)}`;
  const res = await fetch(target, { method: "POST", headers: { ...authHeaders(), "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Storage refused the upload (${res.status}).`);
  const data = (await res.json()) as { url?: string; token?: string };
  const url = data.url ? absolute(data.url) : `${target}?token=${encodeURIComponent(data.token ?? "")}`;
  return { url, headers: { "content-type": contentType, "x-upsert": "false" } };
}

/** Whether the object really arrived, checked before a file row is written. */
export async function objectExists(key: string) {
  requireConfigured();
  const attempts: [string, string][] = [
    ["GET", `${base()}/object/info/${bucket()}/${encodeKey(key)}`],
    ["HEAD", `${base()}/object/authenticated/${bucket()}/${encodeKey(key)}`],
  ];
  for (const [method, url] of attempts) {
    const res = await fetch(url, { method, headers: authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    if (res?.ok) return true;
  }
  return false;
}

/** A link that opens the file for a few minutes, as a download under its own name. */
export async function signedDownloadUrl(key: string, fileName: string, expiresInSeconds = 300) {
  requireConfigured();
  const res = await fetch(`${base()}/object/sign/${bucket()}/${encodeKey(key)}`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Storage refused the link (${res.status}).`);
  const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const full = absolute(data.signedURL ?? data.signedUrl ?? "");
  return `${full}${full.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
}
