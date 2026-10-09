import AccountLayout from "@/components/AccountLayout";
import EngagementRoom from "@/components/EngagementRoom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BUSINESS_ROLE_LABELS } from "@shared/businessCapabilities";
import React from "react";
import { Link } from "wouter";

/** The engagement room for the business in use, once the Current State Assessment is paid; nothing before that. */
function Room() {
  const room = trpc.engagement.client.room.useQuery(undefined, { retry: false });
  return room.data ? <EngagementRoom room={room.data} /> : null;
}

/** The signed-in home: the engagement room and the active business for a client, the internal entry point for staff. */
export default function AccountDashboard() {
  return (
    <AccountLayout>
      {account => {
        const firstName = account.user.fullName.split(" ")[0] || account.user.fullName;
        const business = account.activeBusiness;
        const internal = account.platformRoles.length > 0;
        return (
          <>
            <h1 className="font-serif text-3xl font-bold tracking-tight">Welcome, {firstName}</h1>

            {business && <Room />}

            {business ? (
              <Card className="rounded-none border-line-soft bg-white shadow-sm">
                <CardHeader className="space-y-1 pb-3">
                  <CardDescription className="text-xs uppercase tracking-widest">Your business</CardDescription>
                  <CardTitle className="font-serif text-2xl font-bold tracking-tight">{business.businessName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p>Business profile: <strong>{business.profileComplete ? "Complete" : "Incomplete"}</strong> <span className="text-ink-muted">({business.profilePercent}% complete)</span></p>
                  <div className="h-2 w-full bg-line-soft" role="progressbar" aria-label="Business profile completion" aria-valuenow={business.profilePercent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-2 bg-brand" style={{ width: `${business.profilePercent}%` }} />
                  </div>
                  <p className="text-ink-muted">Your role: {BUSINESS_ROLE_LABELS[business.role]}</p>
                  {!business.profileComplete && (
                    <Button asChild className="rounded-none bg-brand text-xs uppercase tracking-wider text-white">
                      <Link href="/settings/business">Complete profile</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : !internal ? (
              <Card className="rounded-none border-line-soft bg-white shadow-sm">
                <CardContent className="p-6 text-sm text-ink-muted">You are not a member of a business yet.</CardContent>
              </Card>
            ) : null}

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

            <Card className="rounded-none border-line-soft bg-white shadow-sm">
              <CardHeader className="space-y-1 pb-3">
                <CardDescription className="text-xs uppercase tracking-widest">Your account</CardDescription>
                <CardTitle className="text-lg font-semibold">{account.user.fullName}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-ink-muted">
                <p>{account.user.email}</p>
                <p className="mt-2">Your account is you. Your business is the workspace you act inside.</p>
              </CardContent>
            </Card>
          </>
        );
      }}
    </AccountLayout>
  );
}
