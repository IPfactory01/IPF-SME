import { describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { restoreOriginalUrl, createVercelGateway } from "@server/_core/vercelGateway";
import { createApp } from "@server/_core/app";

describe("restoreOriginalUrl", () => {
  it("rebuilds the original tRPC path", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc/registration.submit")).toBe("/api/trpc/registration.submit");
  });

  it("preserves genuine query strings byte-for-byte", () => {
    const input = encodeURIComponent('{"0":{"json":null}}');
    expect(restoreOriginalUrl(`/api/index?__prefix=api&__path=trpc/a,b&batch=1&input=${input}`)).toBe(`/api/trpc/a,b?batch=1&input=${input}`);
  });

  it("drops Vercel's echoed path parameter but keeps a genuine one", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc/x&path=trpc/x&a=1")).toBe("/api/trpc/x?a=1");
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc/x&path=trpc/x&path=mine")).toBe("/api/trpc/x?path=mine");
  });

  it("restores non-api prefixes and bare prefixes", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=portal&__path=authenticate")).toBe("/portal/authenticate");
    expect(restoreOriginalUrl("/api/index?__prefix=manus-storage&__path=participant-assignments/1/f.pdf")).toBe("/manus-storage/participant-assignments/1/f.pdf");
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=")).toBe("/api");
  });

  it("uses the first internal parameter so a visitor cannot override the rewrite", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc/x&__prefix=portal&__path=y")).toBe("/api/trpc/x");
  });

  it("rejects unknown prefixes, traversal and backslashes", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=admin&__path=x")).toBeNull();
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=../secret")).toBeNull();
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=a/%2e%2e/b")).toBeNull();
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=%5Cevil")).toBeNull();
    // A leading encoded slash is not an escape hatch: the result always stays under the configured prefix.
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=%2Fevil.com")).toBe("/api/evil.com");
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=%2F%2Fevil.com")).toBe("/api/evil.com");
    expect(restoreOriginalUrl("/api/index")).toBeNull();
  });

  it("passes through an already-original URL and strips internal parameters", () => {
    expect(restoreOriginalUrl("/api/trpc/x?a=1")).toBe("/api/trpc/x?a=1");
    expect(restoreOriginalUrl("/elsewhere?a=1")).toBeNull();
  });
});

describe("Vercel-encoded __path values (nested paths arrive with %2F)", () => {
  it("restores a single-segment path", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=health")).toBe("/api/health");
  });

  it("decodes the encoded slash of a nested tRPC path and keeps the query", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc%2FbusinessCheck.submit&batch=1")).toBe("/api/trpc/businessCheck.submit?batch=1");
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc%2FbusinessCheck.submit")).toBe("/api/trpc/businessCheck.submit");
  });

  it("decodes several nested segments", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=foo%2Fbar%2Fbaz")).toBe("/api/foo/bar/baz");
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=foo%2Fbar%2Fbaz%2F")).toBe("/api/foo/bar/baz/");
  });

  it("keeps tRPC batch commas and re-encodes characters that are unsafe in a path", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc%2Fa.b%2Cc.d")).toBe("/api/trpc/a.b,c.d");
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=files%2Fmy%20file%C3%A9.pdf")).toBe("/api/files/my%20file%C3%A9.pdf");
    // An encoded "?" or "#" must never turn into a query or fragment.
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=a%3Fb%23c&x=1")).toBe("/api/a%3Fb%23c?x=1");
  });

  it("passes genuine query parameters through byte-for-byte, never decoding them", () => {
    const input = "%7B%220%22%3A%7B%22json%22%3Anull%7D%7D";
    expect(restoreOriginalUrl(`/api/index?__prefix=api&__path=trpc%2Fa.b&batch=1&input=${input}`)).toBe(`/api/trpc/a.b?batch=1&input=${input}`);
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc%2Fx&next=%2Fportal%2Fpassword&a=b+c&a=d&e")).toBe("/api/trpc/x?next=%2Fportal%2Fpassword&a=b+c&a=d&e");
  });

  it("drops only Vercel's echoed path parameter, encoded exactly as __path", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc%2Fx&path=trpc%2Fx&a=1")).toBe("/api/trpc/x?a=1");
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=trpc%2Fx&path=trpc%2Fx&path=mine")).toBe("/api/trpc/x?path=mine");
  });

  it.each([
    "%2E%2E",
    "%2e%2e",
    "%2E%2E%2Fsecret",
    "a%2F%2E%2E%2Fb",
    "a%2F..%2Fb",
    "%2E",
    // double-encoded: a second decode (Express params, the storage key normaliser) would reveal "..".
    "%252E%252E",
    "%252E%252E%252Fsecret",
    "a%252F%252E%252E%252Fb",
    "%255C",
    "%5Cevil",
    "%00",
    "a%0Ab",
  ])("rejects traversal and unsafe characters: %s", encoded => {
    expect(restoreOriginalUrl(`/api/index?__prefix=api&__path=${encoded}`)).toBeNull();
  });

  it("allows a deeper encoding layer that no downstream decoder can turn into traversal", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=api&__path=%25252E")).toBe("/api/%25252E");
  });

  it.each(["%", "%E0%A4%A", "%zz", "trpc%2", "%C3", "a%2Fb%"])("returns null instead of throwing for malformed encoding: %s", encoded => {
    expect(() => restoreOriginalUrl(`/api/index?__prefix=api&__path=${encoded}`)).not.toThrow();
    expect(restoreOriginalUrl(`/api/index?__prefix=api&__path=${encoded}`)).toBeNull();
  });

  it("keeps portal and manus-storage behaviour, including their encoded nested paths", () => {
    expect(restoreOriginalUrl("/api/index?__prefix=portal&__path=authenticate")).toBe("/portal/authenticate");
    expect(restoreOriginalUrl("/api/index?__prefix=portal&__path=access&token=abc%3D")).toBe("/portal/access?token=abc%3D");
    expect(restoreOriginalUrl("/api/index?__prefix=manus-storage&__path=participant-assignments/1/f.pdf")).toBe("/manus-storage/participant-assignments/1/f.pdf");
    expect(restoreOriginalUrl("/api/index?__prefix=manus-storage&__path=participant-assignments%2F1%2Ff.pdf")).toBe("/manus-storage/participant-assignments/1/f.pdf");
    expect(restoreOriginalUrl("/api/index?__prefix=manus-storage&__path=%2E%2E%2Fsecret")).toBeNull();
    expect(restoreOriginalUrl("/api/index?__prefix=admin&__path=trpc%2Fx")).toBeNull();
  });

  it("routes an encoded tRPC path to tRPC (JSON), not to Express's HTML 404", async () => {
    const gateway = createVercelGateway(createApp());
    const res = await request(gateway, "/api/index?__prefix=api&__path=trpc%2FbusinessCheck.submit&batch=1");
    expect(res.body).not.toMatch(/<!DOCTYPE|Cannot GET/i);
    expect(() => JSON.parse(res.body)).not.toThrow();
    expect(res.status).not.toBe(404);
  });
});

async function request(app: express.Express, path: string) {
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" });
    return { status: res.status, location: res.headers.get("location"), body: await res.text() };
  } finally {
    server.close();
  }
}

describe("createApp and the Vercel gateway", () => {
  it("serves GET /api/health", async () => {
    const res = await request(createApp(), "/api/health");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, service: "ipfactory-sme", build: null });
  });

  it("routes rewritten URLs to the original Express route", async () => {
    const gateway = createVercelGateway(createApp());
    const health = await request(gateway, "/api/index?__prefix=api&__path=health");
    expect(JSON.parse(health.body)).toEqual({ ok: true, service: "ipfactory-sme", build: null });
    const portal = await request(gateway, "/api/index?__prefix=portal&__path=authenticate");
    expect(portal.status).toBe(302);
    expect(portal.location).toBe("/?participant_signin=1");
    expect((await request(gateway, "/api/index?__prefix=nope&__path=x")).status).toBe(404);
  });
});
