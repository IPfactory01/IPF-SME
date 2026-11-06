import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import { hasVerifiedAdminAccess } from "../adminSecurity";
import { sdk } from "./sdk";
import { isPrivateParticipantStorageKey, normalizeStorageProxyKey } from "../security";

/** A former JUMP participant's private file: with the programme removed, only a verified administrator may read one. */
async function canReadPrivateParticipantFile(req: Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    return user.role === "admin" && await hasVerifiedAdminAccess(req, user.id);
  } catch {
    return false;
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*key", async (req, res) => {
    const keyParam = req.params.key;
    const rawKey = Array.isArray(keyParam) ? keyParam.join("/") : keyParam;
    const key = rawKey ? normalizeStorageProxyKey(rawKey) : null;
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (isPrivateParticipantStorageKey(key)) {
      const authorised = await canReadPrivateParticipantFile(req);
      if (!authorised) {
        res.status(403).send("Private participant file access is not authorised");
        return;
      }
      res.set("Vary", "Cookie");
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
