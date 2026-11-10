import { useAccount } from "@/hooks/useAccount";
import AccountLayout from "@/components/AccountLayout";
import EngagementRoom from "@/components/EngagementRoom";
import { Failed, Loading, Stale } from "@/components/states";
import TeamSeats from "@/components/TeamSeats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isRefusal } from "@/lib/readPolicy";
import { trpc } from "@/lib/trpc";
import { PLATFORM_ROLE_LABELS } from "@shared/auth";
import { useRoomProject } from "@/lib/roomProject";
import { CURRENT_STATE } from "@shared/businessSupport";
import type { AccountSessionView } from "@shared/auth";
import React from "react";
import { Link } from "wouter";


/**
 * The signed-in home. For a client it is the engagement room: the whole page, once the Business Review is
 * paid, and a short welcome before that. Internal staff get a door to the internal area. Account details live in
 * the settings pages, not here.
 */
function Dashboard({ account }: { account: AccountSessionView }) {
  const business = account.activeBusiness;
  const internal = account.platformRoles.length > 0;
  const { project } = useRoomProject();
  // The previous project stays on screen while the next one loads, so switching never flashes the welcome page.
  const room = trpc.engagement.client.room.useQuery(project ? { engagementId: project } : undefined, { enabled: Boolean(business), placeholderData: previous => previous });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section aria-labelledby="welcome" className="border border-line-soft bg-paper-raised p-6 sm:p-8">
        <div>
          <p className="text-sm font-medium text-ink-muted">{business ? "Your room" : "Your account"}</p>
          <h1 id="welcome" className="mt-2 font-serif text-3xl font-normal tracking-tight sm:text-4xl">{business ? business.businessName : account.user.fullName}</h1>
          {/* Four states (R69): the room loading; the room failed to load (never shown as "not started"); the server
              saying there is no room yet (null); the room itself, which the page above shows instead of this. */}
          {business && room.data === undefined && room.error ? (
            <div className="mt-4 max-w-xl"><Failed error={room.error} onRetry={() => void room.refetch()} retrying={room.isFetching} /></div>
          ) : business && room.isLoading ? (
            <Loading label="Opening your room" rows={2} className="mt-4 max-w-xl" />
          ) : business && room.data === null ? (
            <p className="mt-3 max-w-xl text-ink-600">{`Your room opens here when your ${CURRENT_STATE.name} starts. Until then, your team at IP Factory reaches you on WhatsApp and by email.`}</p>
          ) : null}
          {!business && !internal && <p className="mt-3 max-w-xl text-ink-600">You are not a member of a business yet.</p>}
        </div>
      </section>

      {business && !business.profileComplete && room.data === null && (
        <Card className="rounded-none border-line-soft bg-white shadow-none">
          <CardHeader className="space-y-1 pb-3">
            <CardDescription className="text-sm font-medium">Before we start</CardDescription>
            <CardTitle className="font-serif text-xl font-normal tracking-tight">Finish your business profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-ink-muted">Your profile is {business.profilePercent}% complete. The rest helps your team prepare for your first Session.</p>
            <div className="h-2 w-full bg-line-soft" role="progressbar" aria-label="Business profile completion" aria-valuenow={business.profilePercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-2 bg-brand" style={{ width: `${business.profilePercent}%` }} />
            </div>
            <Button asChild className="rounded-none bg-brand text-sm font-medium text-white hover:bg-brand-deep-hover">
              <Link href="/settings/business">Complete profile</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {internal && (
        <Card className="rounded-none border-line-soft bg-white shadow-none">
          <CardHeader className="space-y-1 pb-3">
            <CardDescription className="text-sm font-medium">IPF team</CardDescription>
            <CardTitle className="text-lg font-semibold">Internal workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-ink-muted">Your responsibilities: {account.platformRoles.map(role => PLATFORM_ROLE_LABELS[role]).join(", ")}.</p>
            <Button asChild variant="outline" className="rounded-none text-sm font-medium"><a href="/admin">Open the internal area</a></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Once the engagement exists, the room is the whole screen, like an app: its own rail with the product, the views and
 * the account links, so the site header and footer step aside. Before that, the welcome sits in the usual frame.
 */
export default function AccountDashboard() {
  const { account } = useAccount();
  const business = account?.activeBusiness;
  const { project } = useRoomProject();
  // The previous project stays on screen while the next one loads, so switching never flashes the welcome page.
  const room = trpc.engagement.client.room.useQuery(project ? { engagementId: project } : undefined, { enabled: Boolean(business), placeholderData: previous => previous });
  if (account && business && room.data) {
    const roomAccount = {
      name: account.user.fullName,
      email: account.user.email,
      role: business.role === "owner" ? "Owner" : "Team member",
      internal: account.platformRoles.length > 0,
    };
    // A refresh that failed keeps the room on screen and says how old it is (R69).
    const notice = room.error && !isRefusal(room.error) ? <Stale updatedAt={room.dataUpdatedAt} onRetry={() => void room.refetch()} retrying={room.isFetching} /> : undefined;
    return <EngagementRoom room={room.data} account={roomAccount} notice={notice} aside={room.data.viewer.kind === "owner" ? <TeamSeats /> : undefined} />;
  }
  return <AccountLayout width="wide">{acc => <Dashboard account={acc} />}</AccountLayout>;
}
