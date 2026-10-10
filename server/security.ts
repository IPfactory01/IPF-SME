import type { NextFunction, Request, Response } from "express";
import { BRAND } from "../shared/brand";
import { fileStorageOrigin } from "./fileStorage";
import { ENV } from "./_core/env";


const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export function getTrustedApplicationOrigin(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === "production" ? ENV.appOrigin : "http://localhost:3000";
}

export function isTrustedBrowserOrigin(origin: string | undefined, nodeEnv = process.env.NODE_ENV) {
  if (!origin) return false;
  if (nodeEnv !== "production") return LOCAL_ORIGIN_PATTERN.test(origin);
  return origin === ENV.appOrigin || ENV.appAlternateOrigins.includes(origin) || (Boolean(ENV.vercelOrigin) && origin === ENV.vercelOrigin);
}

/**
 * True when the browser's Origin names the same host the request was sent to. A cross-site page
 * cannot forge this, so it is safe on any domain the app is served from (custom or Manus) without
 * trusting other sites that share a parent domain.
 */
export function isSameHostOrigin(origin: string | undefined, requestHost: string | undefined) {
  if (!origin || !requestHost) return false;
  try {
    return new URL(origin).host.toLowerCase() === requestHost.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function normalizeStorageProxyKey(rawKey: string) {
  let key: string;
  try {
    key = decodeURIComponent(rawKey).replace(/\\/g, "/").replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (!key || key.includes("\0") || key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  return key;
}

export function isPrivateParticipantStorageKey(key: string) {
  return key.startsWith("participant-assignments/") || key.startsWith("payment-receipts/");
}

export function participantCanReadPrivateStorageKey(key: string, registrationId: number) {
  return key.startsWith(`participant-assignments/${registrationId}/`) || key.startsWith(`payment-receipts/${registrationId}/`);
}

/** Origin of the optional self-hosted analytics script (VITE_ANALYTICS_ENDPOINT), allowed by the CSP. */
function analyticsCspSource() {
  const endpoint = process.env.VITE_ANALYTICS_ENDPOINT;
  if (!endpoint) return "";
  try {
    return ` ${new URL(endpoint).origin}`;
  } catch {
    return "";
  }
}

export function applySecurityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  if (process.env.NODE_ENV === "production") {
    const analyticsSource = analyticsCspSource();
    // The engagement room uploads straight to the private storage bucket, so the browser must be allowed to reach it.
    const storageOrigin = fileStorageOrigin();
    const storageSource = storageOrigin ? ` ${storageOrigin}` : "";
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' https://*.manus.com https://*.manus.space https://www.instagram.com${analyticsSource}; connect-src 'self' https://api.manus.im https://*.manus.com https://*.manus.space https://www.instagram.com${analyticsSource}${storageSource}; frame-src https://accounts.google.com https://www.instagram.com https://calendly.com;`,
    );
  }

  if (req.path.startsWith("/api/") || req.path.startsWith("/portal/") || req.path.startsWith("/admin/")) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
  }
  next();
}

export function requireTrustedBrowserOrigin(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || req.originalUrl.startsWith("/api/scheduled/")) {
    next();
    return;
  }

  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  const requestHost = req.get("x-forwarded-host")?.split(",")[0] || req.get("host");
  if (isTrustedBrowserOrigin(origin) || isSameHostOrigin(origin, requestHost) || (!origin && (fetchSite === "same-origin" || fetchSite === "none"))) {
    next();
    return;
  }

  res.status(403).json({ message: `This request was blocked by ${BRAND.programmeShortName} security controls.` });
}
