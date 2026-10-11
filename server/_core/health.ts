import { ENV } from "./env";

/**
 * What /api/health answers: the service, the commit it was built from and, in production, any required setting that is
 * missing. A deployment without its settings answers 503, so an uptime check sees it before an owner does.
 */
export function healthReport(settings: { missingSettings: readonly string[]; buildCommit: string } = ENV) {
  const ok = settings.missingSettings.length === 0;
  return {
    status: ok ? 200 : 503,
    body: { ok, service: "ipfactory-sme", build: settings.buildCommit || null, ...(ok ? {} : { missing: [...settings.missingSettings] }) },
  };
}
