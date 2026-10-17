import express, { type RequestHandler } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import { registerOAuthRoutes } from "./oauth";
import { handleScheduledReminder } from "../scheduledReminder";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import type { TrpcContext } from "./context";
import { getAuthenticatedParticipant } from "../participantAuth";
import { storagePut } from "../storage";
import { buildParticipantUploadKey, buildPaymentReceiptUploadKey, getParticipantUploadValidationError, participantUploadPolicy } from "../participantUploads";
import { applySecurityHeaders, requireTrustedBrowserOrigin } from "../security";
import { ENV } from "./env";
import { healthReport } from "./health";
import { handlePaystackWebhook } from "../onlinePayment";
import { PAYSTACK_WEBHOOK_PATH } from "../paystack";
import { handleResendWebhook } from "../resendWebhook";
import multer from "multer";
import { consumeLimit, LIMITS } from "../rateLimit";

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
  app.get("/api/health", (_req, res) => {
    const report = healthReport();
    res.status(report.status).json(report.body);
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
  app.get(["/portal/authenticate", "/portal/access"], (_req, res) => {
    res.redirect(302, "/?participant_signin=1");
  });
  const participantUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: participantUploadPolicy.maxBytes, files: 1 },
  });
  const limitParticipantUpload: RequestHandler = async (req, res, next) => {
    try {
      if (!(await consumeLimit(LIMITS.fileUpload, `ip:${req.ip || "unknown"}`))) {
        res.status(429).json({ message: "Too many uploads. Kindly try again later." });
        return;
      }
      next();
    } catch (error) { next(error); }
  };

  app.post("/api/participant-upload", limitParticipantUpload, participantUpload.single("file"), async (req, res) => {
    try {
      const participant = await getAuthenticatedParticipant({ req, res, user: null } as TrpcContext);
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Kindly select a file to upload." });
      const validationError = getParticipantUploadValidationError(file);
      if (validationError) return res.status(415).json({ message: validationError });
      const uploaded = await storagePut(
        buildParticipantUploadKey(participant.id, file.originalname),
        file.buffer,
        file.mimetype,
      );
      return res.status(201).json(uploaded);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload the file.";
      const status = error instanceof TRPCError && error.code === "UNAUTHORIZED" ? 401 : 500;
      console.warn("[Participant upload] Failed:", message);
      return res.status(status).json({ message: status === 401 ? "Kindly sign in to your participant portal again and try again." : "We could not store this file. Kindly try again shortly." });
    }
  });

  app.post("/api/payment-receipt-upload", limitParticipantUpload, participantUpload.single("file"), async (req, res) => {
    try {
      const participant = await getAuthenticatedParticipant({ req, res, user: null } as TrpcContext);
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Kindly select a payment receipt to upload." });
      const validationError = getParticipantUploadValidationError(file);
      if (validationError) return res.status(415).json({ message: validationError });
      const uploaded = await storagePut(
        buildPaymentReceiptUploadKey(participant.id, file.originalname),
        file.buffer,
        file.mimetype,
      );
      return res.status(201).json(uploaded);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload the payment receipt.";
      const status = error instanceof TRPCError && error.code === "UNAUTHORIZED" ? 401 : 500;
      console.warn("[Payment receipt upload] Failed:", message);
      return res.status(status).json({ message: status === 401 ? "Kindly sign in to your participant portal again and try again." : "We could not store the receipt. Kindly try again shortly." });
    }
  });

  // Scheduled cron callback for 24-hour reminders
  app.post("/api/scheduled/sendReminder", handleScheduledReminder);
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
