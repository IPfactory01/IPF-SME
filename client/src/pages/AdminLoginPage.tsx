import { useAuth } from "@/_core/hooks/useAuth";
import ForgotPassword from "@/components/ForgotPassword";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isOAuthLoginConfigured } from "@/const";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { ArrowLeft, Lock } from "lucide-react";
import React, { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";

/**
 * Staff sign-in: the same email-and-password identity as every other account. The server refuses anyone who holds no
 * internal platform role before a session exists; what a signed-in person may do is decided per action on the server.
 */
export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const access = trpc.adminAccess.status.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (access.data?.passwordVerified) setLocation("/admin");
  }, [access.data?.passwordVerified, setLocation]);

  const signIn = trpc.account.signInInternal.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.auth.me.invalidate(), utils.adminAccess.status.invalidate(), utils.account.me.invalidate()]);
      setLocation("/admin");
    },
    onError: failure => setError(failure.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setError(null);
    signIn.mutate({ email, password });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper p-6 text-ink">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-xs uppercase tracking-widest text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> Back to Public Home</Link>
          <img src={BRAND.logoUrl} alt={BRAND.organisationName} className="h-14 w-auto shrink-0" />
        </div>
        <Card className="rounded-none border-line-soft bg-white shadow-sm">
          <CardHeader className="space-y-3 pb-6">
            <div className="flex h-10 w-10 items-center justify-center bg-brand-tint text-brand"><Lock className="h-5 w-5" /></div>
            <CardTitle className="font-serif text-2xl font-bold tracking-tight">Admin sign in</CardTitle>
            <CardDescription className="text-sm text-ink-muted">Sign in with your IPF administrator account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? <p className="text-sm text-ink-muted">Checking your secure sign-in…</p> : forgot ? <ForgotPassword id="admin" initialEmail={email} onBack={() => setForgot(false)} /> : (
              <form className="space-y-4" noValidate onSubmit={submit}>
                {error && <div role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>}
                <div className="space-y-2"><Label htmlFor="admin-email">Email</Label><Input id="admin-email" type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setError(null); }} /></div>
                <div className="space-y-2"><Label htmlFor="admin-password">Password</Label><Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setError(null); }} /></div>
                <Button disabled={signIn.isPending} type="submit" size="lg" className="h-12 w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
                  {signIn.isPending ? "Signing in…" : "Sign in"}
                </Button>
                <button type="button" onClick={() => setForgot(true)} className="text-sm font-semibold text-brand underline underline-offset-2">Forgot your password?</button>
              </form>
            )}
            {isOAuthLoginConfigured() && (
              <p className="border-t border-line-soft pt-4 text-center text-xs text-ink-muted">
                Still using the earlier Google sign-in? <Link href="/admin/login/legacy" className="underline">Legacy Google sign-in</Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
