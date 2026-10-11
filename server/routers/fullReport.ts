import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { downloadReport, reportForm, submitReportIntake } from "../fullReport/service";
import { consumeLimit, LIMITS } from "../rateLimit";

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not reach your report just now. Please try again in a minute." });
  return db;
}

const token = z.string().trim().min(1).max(200);

/** The link is the only key, so the limits are per link: a leaked one cannot be used to render the report without end. */
async function allow(rule: typeof LIMITS.reportForm | typeof LIMITS.reportDownload, link: string) {
  if (!(await consumeLimit(rule, link))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests for this report. Kindly try again later." });
}

/**
 * The owner's side of the paid full report. Each call is authorised by the single link issued when the report payment
 * was confirmed (only its hash is stored); there is no other way in, and nothing here reaches another owner's records.
 */
export const fullReportRouter = router({
  form: publicProcedure.input(z.object({ token })).query(async ({ input }) => {
    await allow(LIMITS.reportForm, input.token);
    return reportForm(await database(), input.token);
  }),
  /** Takes the Report Intake, builds the report and emails it at once; returns the PDF so the page can offer it. */
  submit: publicProcedure.input(z.object({ token, intake: z.unknown() })).mutation(async ({ input }) => {
    await allow(LIMITS.reportForm, input.token);
    return submitReportIntake(await database(), input.token, input.intake);
  }),
  download: publicProcedure.input(z.object({ token })).mutation(async ({ input }) => {
    await allow(LIMITS.reportDownload, input.token);
    return downloadReport(await database(), input.token);
  }),
});
