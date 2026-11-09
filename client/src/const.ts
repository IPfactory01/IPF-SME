import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";
import { toast } from "sonner";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export { ADMIN_LOGIN_PATH } from "./adminLoginPath";

type OAuthEnv = Record<string, unknown>;

/**
 * The legacy Manus OAuth settings, or null when they are missing or not a usable https/http address. Both values are
 * baked in at build time, so a deployment that does not set them (the Vercel build) has no legacy OAuth sign-in.
 */
export function getOAuthLoginConfig(env: OAuthEnv = import.meta.env): { portalUrl: string; appId: string } | null {
  const portal = typeof env.VITE_OAUTH_PORTAL_URL === "string" ? env.VITE_OAUTH_PORTAL_URL.trim().replace(/\/+$/, "") : "";
  const appId = typeof env.VITE_APP_ID === "string" ? env.VITE_APP_ID.trim() : "";
  if (!portal || !appId) return null;
  try {
    const parsed = new URL(portal);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { portalUrl: portal, appId };
}

export const isOAuthLoginConfigured = () => getOAuthLoginConfig() !== null;

/**
 * Starts the LEGACY Manus OAuth login (the normal staff sign-in is email and password at /admin/login).
 * Call it from an event handler at the moment you want to navigate, never during render: it mints a one-time nonce,
 * writes the __Host- state cookie and navigates, so the cookie always matches the `state` it sends.
 *
 * It never throws. If the OAuth settings are missing or invalid it logs a non-secret diagnostic, shows a controlled
 * message and returns false without touching cookies or navigating.
 */
export const startLogin = (env: OAuthEnv = import.meta.env): boolean => {
  const config = getOAuthLoginConfig(env);
  if (!config) {
    console.error("[auth] Legacy OAuth sign-in is not configured: VITE_OAUTH_PORTAL_URL (an http/https address) and VITE_APP_ID must both be set at build time.");
    toast.error("Google sign-in is not available here. Sign in with your email and password instead.");
    return false;
  }
  try {
    const currentPath = `${window.location.pathname || "/"}${window.location.search || ""}`;
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const nonce = crypto.randomUUID();
    const url = new URL(`${config.portalUrl}/app-auth`);
    url.searchParams.set("appId", config.appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", encodeOAuthState({ redirectUri, nonce, redirectPath: currentPath }));
    url.searchParams.set("type", "signIn");
    document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
    window.location.href = url.toString();
    return true;
  } catch {
    console.error("[auth] Legacy OAuth sign-in could not be started (the configured portal address is not usable).");
    toast.error("Google sign-in is not available here. Sign in with your email and password instead.");
    return false;
  }
};
