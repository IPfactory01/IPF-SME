import AccountLayout from "@/components/AccountLayout";
import EngagementRoom from "@/components/EngagementRoom";
import TeamSeats from "@/components/TeamSeats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CURRENT_STATE } from "@shared/businessSupport";
import type { AccountSessionView } from "@shared/auth";
import React from "react";
import { Link } from "wouter";

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.2em] text-highlight-ink";

/**
 * The signed-in home. For a client it is the engagement room: the whole page, once the Current State Assessment is
 * paid, and a short welcome before that. Internal staff get a door to the internal area. Account details live in
 * the settings pages, not here.
 */
function Dashboard({ account }: { account: AccountSessionView }) {
  const firstName = account.user.fullName.split(" ")[0] || account.user.fullName;
  const greeting = `Welcome back, ${firstName}`;
  const business = account.activeBusiness;
  const internal = account.platformRoles.length > 0;
  const room = trpc.engagement.client.room.useQuery(undefined, { retry: false, enabled: Boolean(business) });

  if (business && room.data) {
    return <EngagementRoom room={room.data} greeting={greeting} aside={room.data.viewer.kind === "owner" ? <TeamSeats /> : undefined} />;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section aria-labelledby="welcome" className="relative overflow-hidden border border-line-soft bg-paper-raised p-6 shadow-sm sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-brand-plum/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-10 h-56 w-56 rounded-full bg-highlight/15 blur-3xl" />
        <div className="relative">
          <p className={EYEBROW}>{greeting}</p>
          <h1 id="welcome" className="mt-2 font-serif text-3xl font-black tracking-tight sm:text-4xl">{business ? business.businessName : account.user.fullName}</h1>
          {business && (
            <p className="mt-3 max-w-xl text-ink-600">
              {room.isLoading ? "Opening your room…" : `Your room opens here when your ${CURRENT_STATE.name} starts. Until then, your team at IP Factory reaches you on WhatsApp and by email.`}
            </p>
          )}
          {!business && !internal && <p className="mt-3 max-w-xl text-ink-600">You are not a member of a business yet.</p>}
        </div>
      </section>

      {business && !business.profileComplete && !room.isLoading && (
        <Card className="rounded-none border-line-soft bg-white shadow-sm">
          <CardHeader className="space-y-1 pb-3">
            <CardDescription className="text-xs uppercase tracking-widest">Before we start</CardDescription>
            <CardTitle className="font-serif text-xl font-bold tracking-tight">Finish your business profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-ink-muted">Your profile is {business.profilePercent}% complete. The rest helps your team prepare for your first Session.</p>
            <div className="h-2 w-full bg-line-soft" role="progressbar" aria-label="Business profile completion" aria-valuenow={business.profilePercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-2 bg-brand" style={{ width: `${business.profilePercent}%` }} />
            </div>
            <Button asChild className="rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
              <Link href="/settings/business">Complete profile</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {internal && (
        <Card className="rounded-none border-line-soft bg-white shadow-sm">
          <CardHeader className="space-y-1 pb-3">
            <CardDescription className="text-xs uppercase tracking-widest">IPF team</CardDescription>
            <CardTitle className="text-lg font-semibold">Internal workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-ink-muted">Your responsibilities: {account.platformRoles.map(role => role.replace(/_/g, " ")).join(", ")}.</p>
            <Button asChild variant="outline" className="rounded-none text-xs uppercase tracking-wider"><a href="/admin">Open the internal area</a></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AccountDashboard() {
  return <AccountLayout width="wide">{account => <Dashboard account={account} />}</AccountLayout>;
}
