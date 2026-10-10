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

export type FileStorageStatus = {
  /** All three settings are present. */
  configured: boolean;
  /** The settings that are still missing, by env name, so the message can say exactly what to add. */
  missing: ("SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_STORAGE_BUCKET")[];
  bucket: string;
  /** Whether the bucket answered: null when the check could not run (not configured or storage unreachable). */
  bucketFound: boolean | null;
  /** A public bucket would let anyone with a link read client files; the room must not use one. */
  bucketPublic: boolean | null;
  /** What went wrong, in plain words and never with a key or URL in it. */
  problem: string | null;
};

/**
 * One live check the team can run from the Engagements tab after setting Vercel up: which settings are present, and
 * whether the bucket exists and is private. Reads only; nothing is created or changed.
 */
export async function checkFileStorage(): Promise<FileStorageStatus> {
  const missing: FileStorageStatus["missing"] = [];
  if (!ENV.supabaseUrl) missing.push("SUPABASE_URL");
  if (!ENV.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ENV.supabaseStorageBucket) missing.push("SUPABASE_STORAGE_BUCKET");
  const status: FileStorageStatus = { configured: missing.length === 0, missing, bucket: ENV.supabaseStorageBucket, bucketFound: null, bucketPublic: null, problem: null };
  if (!status.configured) return status;
  if (!fileStorageOrigin()) return { ...status, problem: "SUPABASE_URL is not a web address. It should look like https://<project>.supabase.co" };
  try {
    const res = await fetch(`${base()}/bucket/${bucket()}`, { method: "GET", headers: authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404 || res.status === 400) return { ...status, bucketFound: false };
    if (res.status === 401 || res.status === 403) return { ...status, problem: "Storage refused the service key. Check SUPABASE_SERVICE_ROLE_KEY is the service_role key, not the anon key." };
    if (!res.ok) return { ...status, problem: `Storage answered ${res.status}.` };
    const data = (await res.json()) as { public?: boolean };
    return { ...status, bucketFound: true, bucketPublic: Boolean(data.public) };
  } catch {
    return { ...status, problem: "Storage did not answer. Check SUPABASE_URL is the project URL from Supabase → Project Settings → API." };
  }
}
