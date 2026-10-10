import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ supabaseUrl: "", supabaseServiceRoleKey: "", supabaseStorageBucket: "engagement-files" }));
vi.mock("@server/_core/env", () => ({ ENV: env }));

import { checkFileStorage, createSignedUpload, fileStorageOrigin, isFileStorageConfigured, objectExists, signedDownloadUrl } from "@server/fileStorage";

const reply = (ok: boolean, body: unknown = {}, status = ok ? 200 : 404) => ({ ok, status, json: async () => body });
const configure = () => {
  env.supabaseUrl = "https://example-project.supabase.co/";
  env.supabaseServiceRoleKey = "service-key-for-tests";
};

beforeEach(() => {
  env.supabaseUrl = "";
  env.supabaseServiceRoleKey = "";
  env.supabaseStorageBucket = "engagement-files";
});
afterEach(() => vi.unstubAllGlobals());

describe("file storage (private Supabase bucket)", () => {
  it("is off until the URL, the service key and the bucket are all set, and refuses to issue links before then", async () => {
    expect(isFileStorageConfigured()).toBe(false);
    expect(fileStorageOrigin()).toBe("");
    await expect(createSignedUpload("engagements/1/tasks/2/a.pdf", "application/pdf")).rejects.toThrow(/not configured/);
    configure();
    expect(isFileStorageConfigured()).toBe(true);
    expect(fileStorageOrigin()).toBe("https://example-project.supabase.co");
    env.supabaseStorageBucket = "";
    expect(isFileStorageConfigured()).toBe(false);
  });

  it("asks the bucket for a one-off upload URL with the service key, and returns it absolute with the headers the browser must send", async () => {
    configure();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(true, { url: "/object/upload/sign/engagement-files/engagements/1/tasks/2/a.pdf?token=TOKEN" }));
    vi.stubGlobal("fetch", fetchMock);
    const upload = await createSignedUpload("engagements/1/tasks/2/a.pdf", "application/pdf");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/1/tasks/2/a.pdf",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer service-key-for-tests", apikey: "service-key-for-tests" }), signal: expect.any(AbortSignal) }),
    );
    expect(upload).toEqual({ url: "https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/1/tasks/2/a.pdf?token=TOKEN", headers: { "content-type": "application/pdf", "x-upsert": "false" } });
  });

  it("builds the upload URL from a bare token when that is all the bucket answers with, and reports a refusal", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => reply(true, { token: "T/0+K" })));
    expect((await createSignedUpload("k/f.png", "image/png")).url).toBe("https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/k/f.png?token=T%2F0%2BK");
    vi.stubGlobal("fetch", vi.fn(async () => reply(false, {}, 403)));
    await expect(createSignedUpload("k/f.png", "image/png")).rejects.toThrow("Storage refused the upload (403).");
  });

  it("checks an object arrived through the info endpoint, falling back to an authenticated HEAD", async () => {
    configure();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string }) => { calls.push(`${init.method} ${url}`); return reply(init.method === "HEAD"); }));
    expect(await objectExists("engagements/1/tasks/2/a.pdf")).toBe(true);
    expect(calls).toEqual([
      "GET https://example-project.supabase.co/storage/v1/object/info/engagement-files/engagements/1/tasks/2/a.pdf",
      "HEAD https://example-project.supabase.co/storage/v1/object/authenticated/engagement-files/engagements/1/tasks/2/a.pdf",
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => reply(false)));
    expect(await objectExists("engagements/1/tasks/2/missing.pdf")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await objectExists("engagements/1/tasks/2/a.pdf")).toBe(false);
  });

  it("issues a short-lived download link under the file's own name", async () => {
    configure();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(true, { signedURL: "/object/sign/engagement-files/engagements/1/tasks/2/a.pdf?token=D" }));
    vi.stubGlobal("fetch", fetchMock);
    const url = await signedDownloadUrl("engagements/1/tasks/2/a.pdf", "Sales 2026.pdf");
    expect(url).toBe("https://example-project.supabase.co/storage/v1/object/sign/engagement-files/engagements/1/tasks/2/a.pdf?token=D&download=Sales%202026.pdf");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ expiresIn: 300 }) });
  });

  it("encodes each part of the key, never the slashes", async () => {
    configure();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(true, { token: "t" }));
    vi.stubGlobal("fetch", fetchMock);
    await createSignedUpload("engagements/1/tasks/2/price list#1.pdf", "application/pdf");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/engagement-files/engagements/1/tasks/2/price%20list%231.pdf");
  });
});

describe("the storage check the team runs from the Engagements tab", () => {
  it("names exactly which settings are missing and asks storage nothing until all three are set", async () => {
    const fetchMock = vi.fn(async () => reply(true));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkFileStorage()).toEqual({ configured: false, missing: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], bucket: "engagement-files", bucketFound: null, bucketPublic: null, problem: null });
    env.supabaseServiceRoleKey = "service-key-for-tests";
    expect((await checkFileStorage()).missing).toEqual(["SUPABASE_URL"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a private bucket that exists as uploads on, asking storage for the bucket with the service key", async () => {
    configure();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(true, { id: "engagement-files", name: "engagement-files", public: false }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkFileStorage()).toEqual({ configured: true, missing: [], bucket: "engagement-files", bucketFound: true, bucketPublic: false, problem: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example-project.supabase.co/storage/v1/bucket/engagement-files",
      expect.objectContaining({ method: "GET", headers: expect.objectContaining({ authorization: "Bearer service-key-for-tests" }) }),
    );
  });

  it("tells the bucket, the key and the URL apart when something is wrong, without repeating any of them", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => reply(false, { message: "Bucket not found" }, 404)));
    expect(await checkFileStorage()).toMatchObject({ configured: true, bucketFound: false, problem: null });
    vi.stubGlobal("fetch", vi.fn(async () => reply(true, { public: true })));
    expect(await checkFileStorage()).toMatchObject({ bucketFound: true, bucketPublic: true });
    vi.stubGlobal("fetch", vi.fn(async () => reply(false, {}, 401)));
    expect((await checkFileStorage()).problem).toMatch(/service_role key/);
    vi.stubGlobal("fetch", vi.fn(async () => reply(false, {}, 500)));
    expect((await checkFileStorage()).problem).toBe("Storage answered 500.");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("getaddrinfo ENOTFOUND"); }));
    const unreachable = await checkFileStorage();
    expect(unreachable.problem).toMatch(/did not answer/);
    expect(JSON.stringify(unreachable)).not.toContain("service-key-for-tests");
    env.supabaseUrl = "example-project.supabase.co";
    expect((await checkFileStorage()).problem).toMatch(/not a web address/);
  });
});
