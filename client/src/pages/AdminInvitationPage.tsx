import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { KeyRound, LockKeyhole, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { BRAND } from "@shared/brand";

export default function AdminInvitationPage() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const invite = trpc.adminAccess.inviteStatus.useQuery({ token }, { enabled: token.length >= 30, retry: false });
  const accept = trpc.adminAccess.acceptInvitation.useMutation({ onSuccess: () => { toast.success("Your administrator access is ready."); setLocation("/admin"); }, onError: (error) => toast.error(error.message) });
  const unavailable = !token || (invite.data && !invite.data.valid);

  return <div className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink"><Card className="w-full max-w-md rounded-none border-line-soft bg-white shadow-sm"><CardHeader className="space-y-3"><div className="flex h-10 w-10 items-center justify-center bg-brand-tint text-brand"><LockKeyhole className="h-5 w-5" /></div><CardTitle className="font-serif text-2xl">{BRAND.programmeShortName} administrator invitation</CardTitle><CardDescription>Accept an invitation using the exact Gmail address that received it, then create your own {BRAND.programmeShortName} password.</CardDescription></CardHeader><CardContent className="space-y-5">
    {invite.isLoading ? <p className="text-sm text-ink-muted">Checking secure invitation…</p> : null}
    {unavailable ? <div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><ShieldAlert className="mb-2 h-5 w-5" /><p className="font-semibold">This invitation is unavailable.</p><p className="mt-1 text-xs">It may have expired, been replaced, or been revoked. Kindly ask {BRAND.facilitatorFirstName} to send a new invitation.</p></div> : null}
    {!unavailable && !loading && !user ? <><div className="border border-line-soft bg-paper p-4 text-xs text-ink-muted">First sign in with the Gmail address to which {BRAND.facilitatorFirstName} sent this invitation.</div><Button onClick={() => startLogin()} className="w-full rounded-none bg-brand text-sm text-white hover:bg-brand-deep-hover">Continue with invited Gmail</Button></> : null}
    {!unavailable && !loading && user ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); accept.mutate({ token, password, confirmPassword }); }}><div className="border border-brand-line bg-brand-tint p-4 text-xs text-brand-ink">Signed in as <strong>{user.email}</strong>. Kindly create a separate password for {BRAND.programmeShortName} administration.</div><div className="space-y-2"><Label htmlFor="invited-password">New {BRAND.programmeShortName} administrator password</Label><Input id="invited-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" /></div><div className="space-y-2"><Label htmlFor="invited-password-confirm">Confirm password</Label><Input id="invited-password-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div><Button disabled={accept.isPending} type="submit" className="w-full rounded-none bg-brand text-sm text-white hover:bg-brand-deep-hover"><KeyRound className="mr-2 h-4 w-4" />{accept.isPending ? "Activating…" : "Accept invitation and secure access"}</Button></form> : null}
  </CardContent></Card></div>;
}
