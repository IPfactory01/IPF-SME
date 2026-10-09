import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import React, { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) setLocation(account.landingPath);
  }, [account, setLocation]);

  const signIn = trpc.account.signIn.useMutation({
    onSuccess: view => {
      utils.account.me.setData(undefined, view);
      setLocation(view.landingPath);
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
    <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
      <div className="w-full max-w-md space-y-6">
        <Card className="rounded-none border-line-soft bg-white shadow-sm">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle className="font-serif text-2xl font-bold tracking-tight">Sign in</CardTitle>
            <CardDescription className="text-sm text-ink-muted">Use the email and password you created your account with.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" noValidate onSubmit={submit}>
              {error && <div role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setError(null); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setError(null); }} />
              </div>
              <Button disabled={signIn.isPending} type="submit" size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
                {signIn.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-ink-muted">Client access is created during onboarding.</p>
        <p className="text-center text-xs text-ink-muted">On the {BRAND.programmeName} programme? <a href="/portal" className="font-semibold text-brand underline underline-offset-2">Go to the participant portal</a>.</p>
      </div>
    </main>
  );
}
