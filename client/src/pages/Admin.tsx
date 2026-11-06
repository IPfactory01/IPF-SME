/**
 * The admin console at /admin: checks the signed-in person may use it, then the IPF Business Support console. The JUMP
 * programme desk and its separate administrator system were removed on 6 November 2026 (their records stay in the
 * database, unreachable).
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import BusinessSupportConsole from "@/components/admin/BusinessSupportConsole";
import { Shield, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { BRAND } from "@shared/brand";

export default function Admin() {
  const [, setLocation] = useLocation();
  const access = trpc.adminAccess.status.useQuery(undefined, { retry: false });
  if (access.isLoading) return <div className="min-h-screen bg-paper flex items-center justify-center text-sm text-ink-muted">Verifying administrator access…</div>;
  if (!access.data?.passwordVerified) {
    return <div className="min-h-screen bg-paper flex items-center justify-center p-6"><Card className="w-full max-w-md rounded-none border-line-soft bg-white"><CardHeader><div className="mb-3 flex h-10 w-10 items-center justify-center bg-health-watch-tint text-ink"><ShieldAlert className="h-5 w-5" /></div><CardTitle className="font-serif text-2xl">Secure admin verification required</CardTitle></CardHeader><CardContent className="space-y-5"><p className="text-sm leading-6 text-ink-muted">Your Gmail account must be recognised and your separate {BRAND.programmeShortName} administrator password verified before the administration console can open.</p><Button onClick={() => setLocation("/admin/login")} className="w-full rounded-none bg-brand text-sm text-white hover:bg-brand-deep-hover">Continue to secure admin sign in</Button></CardContent></Card></div>;
  }
  return (
    <DashboardLayout>
      <div className="-m-4 min-h-screen bg-paper p-6 text-ink lg:p-10">
        <div className="mx-auto max-w-7xl">
          <BusinessSupportConsole access={access.data} />
        </div>
      </div>
    </DashboardLayout>
  );
}

