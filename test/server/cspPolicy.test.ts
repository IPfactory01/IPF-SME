import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { applySecurityHeaders } from "@server/security";
import { manusPluginsFor } from "../../vite.config";

const root = process.cwd();
const directive = (policy: string, name: string) => policy.split(";").map(part => part.trim()).find(part => part.startsWith(`${name} `)) ?? "";

describe("Content-Security-Policy keeps script-src strict", () => {
  it("never allows unsafe-inline or unsafe-eval scripts in the Vercel static headers", () => {
    const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };
    const policies = config.headers.flatMap(entry => entry.headers).filter(header => header.key === "Content-Security-Policy").map(header => header.value);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      const scripts = directive(policy, "script-src");
      expect(scripts).toMatch(/^script-src 'self'/);
      expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval|nonce-|'strict-dynamic'|\*/);
    }
  });

  it("never allows unsafe-inline or unsafe-eval scripts in the server's production policy", () => {
    const headers: Record<string, string> = {};
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      applySecurityHeaders({ path: "/" } as Request, { setHeader: (name: string, value: string) => void (headers[name] = value) } as unknown as Response, () => undefined);
    } finally {
      process.env.NODE_ENV = previous;
    }
    const scripts = directive(headers["Content-Security-Policy"], "script-src");
    expect(scripts).toMatch(/^script-src 'self'/);
    expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
});

describe("transport security on the static routes", () => {
  it("tells browsers to keep using HTTPS for two years, subdomains included", () => {
    const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };
    const values = config.headers.flatMap(entry => entry.headers).filter(header => header.key === "Strict-Transport-Security").map(header => header.value);
    expect(values).toEqual(["max-age=63072000; includeSubDomains"]);
  });
});

describe("the inline script that CSP blocked", () => {
  it("is the Manus runtime, and builds made on Vercel leave it out (no unsafe-inline needed)", () => {
    expect(manusPluginsFor({ VERCEL: "1" })).toEqual([]);
    expect(manusPluginsFor({})).toHaveLength(2);
    expect(manusPluginsFor({ VERCEL: "" })).toHaveLength(2);
  });

  it("is not part of the application's own HTML template", () => {
    const html = readFileSync(resolve(root, "client/index.html"), "utf8");
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    expect(inline).toEqual([]);
  });
});
