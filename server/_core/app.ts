import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import type { TrpcContext } from "./context";
import { applySecurityHeaders, requireTrustedBrowserOrigin } from "../security";
import { ENV } from "./env";
import { healthReport } from "./health";
import { checkDatabase } from "../databaseHealth";
import { getDb } from "../db";
import { handlePaystackWebhook } from "../onlinePayment";
import { PAYSTACK_WEBHOOK_PATH } from "../paystack";
import { handleResendWebhook } from "../resendWebhook";
import { isCronRequest, remindersStatus, runReminders } from "../reminders";

/**
 * The reusable Express application. It owns no HTTP server, port, Vite middleware or static
 * files, so it can run behind a traditional server (index.ts) or a serverless host (api/index.ts).
 */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(applySecurityHeaders);
  // "build" is the short commit the live site was built from, so anyone can tell whether a change has reached it.
  // It also says whether the database answers, and if not, why (code and reason, never the connection string).
  app.get("/api/health", async (_req, res) => {
    const report = healthReport();
    const db = await getDb().catch(() => null);
    const database = await checkDatabase(db);
    // Whether the morning reminders are set up (CRON_SECRET), and when they last ran (R12, R16). Never the secret.
    const reminders = database.ok ? await remindersStatus(db) : { configured: Boolean(ENV.cronSecret), lastRunAt: null };
    res.status(database.ok ? report.status : 503).json({ ...report.body, ok: report.body.ok && database.ok, database, reminders });
  });
  // The morning reminders (R12, R16): Vercel Cron calls this at 06:31 UTC with CRON_SECRET; anyone else is refused.
  app.get("/api/scheduled/reminders", async (req, res) => {
    if (!ENV.cronSecret) return void res.status(503).json({ ok: false, reason: "CRON_SECRET is not set, so no reminder is sent." });
    if (!isCronRequest(req.get("authorization"))) return void res.status(401).json({ ok: false });
    const db = await getDb().catch(() => null);
    if (!db) return void res.status(503).json({ ok: false, reason: "The database is not available." });
    try {
      res.json({ ok: true, ...(await runReminders(db as never)) });
    } catch (error) {
      console.error("[Reminders] The run failed:", error instanceof Error ? error.message : error);
      res.status(500).json({ ok: false });
    }
  });
  // Paystack's signed webhook: before the JSON parser, so the signature is checked on the exact bytes Paystack sent,
  // and before the browser-origin guard, which exempts it (a server-to-server call has no Origin; the signature is the check).
  app.post(PAYSTACK_WEBHOOK_PATH, express.raw({ type: () => true, limit: "256kb" }), handlePaystackWebhook);
  // Resend/Svix signs the exact raw request bytes; do not pass this route through express.json first.
  app.post("/api/resend/webhook", express.raw({ type: () => true, limit: "256kb" }), handleResendWebhook);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "32kb", extended: true }));
  app.use("/api", requireTrustedBrowserOrigin);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
