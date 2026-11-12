/**
 * The admin console at /admin: checks the signed-in person may use it, then the IPF Business Support console. The JUMP
 * programme desk and its separate administrator system were removed on 6 November 2026 (their records stay in the
 * database, unreachable).
 */
import { Failed } from "@/components/states";
import { isRefusal } from "@/lib/readPolicy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import BusinessSupportConsole from "@/components/admin/BusinessSupportConsole";
import { TeamPreviewBanner } from "@/components/admin/TeamPreview";
import TeamHome from "@/components/admin/TeamHome";
import { isTeamHome } from "@/lib/adminSections";
import { Shield, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

export default function Admin() {
  const [, setLocation] = useLocation();
  const access = trpc.adminAccess.status.useQuery(undefined);
  if (access.isLoading) return <div role="status" aria-label="Verifying administrator access" className="min-h-screen bg-paper flex items-center justify-center text-sm text-ink-muted">Verifying administrator access…</div>;
  // A check that failed is not a refusal: offer Try again rather than the sign-in card (R69).
  if (access.error && !isRefusal(access.error) && access.data === undefined) {
    return <div className="min-h-screen bg-paper flex items-center justify-center p-6"><div className="w-full max-w-md"><Failed error={access.error} onRetry={() => void access.refetch()} retrying={access.isFetching} /></div></div>;
  }
  if (!access.data?.passwordVerified) {
    return <div className="min-h-screen bg-paper flex items-center justify-center p-6"><Card className="w-full max-w-md rounded-none border-line-soft bg-white"><CardHeader><div className="mb-3 flex h-10 w-10 items-center justify-center bg-health-watch-tint text-ink"><ShieldAlert className="h-5 w-5" /></div><CardTitle className="font-serif text-2xl">Secure admin verification required</CardTitle></CardHeader><CardContent className="space-y-5"><p className="text-sm leading-6 text-ink-muted">Your account must be recognised and your administrator password verified before the admin console can open.</p><Button onClick={() => setLocation("/admin/login")} className="w-full rounded-none bg-brand text-sm text-white hover:bg-brand-deep-hover">Continue to secure admin sign in</Button></CardContent></Card></div>;
  }
  // The team's home (R83): someone who works only on their own projects gets a page built like the client's room.
  if (isTeamHome(access.data)) return <>{access.data.preview && <div className="bg-paper px-4 pt-4 sm:px-7"><TeamPreviewBanner preview={access.data.preview} /></div>}<TeamHome access={access.data} /></>;
  return (
    <DashboardLayout>
      <div className="-m-4 min-h-screen bg-paper p-6 text-ink lg:p-10">
        <div className="mx-auto max-w-7xl">
          {access.data.preview && <TeamPreviewBanner preview={access.data.preview} />}
          <BusinessSupportConsole access={access.data} />
        </div>
      </div>
    </DashboardLayout>
  );
}

