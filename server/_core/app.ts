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
    const database = await checkDatabase(await getDb().catch(() => null));
    res.status(database.ok ? report.status : 503).json({ ...report.body, ok: report.body.ok && database.ok, database });
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
