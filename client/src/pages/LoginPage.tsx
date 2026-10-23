import { LegalFooterLinks } from "@/components/LegalLinks";
import ForgotPassword from "@/components/ForgotPassword";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { usePageMeta } from "@/components/SiteShell";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import React, { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { PAGE_META } from "@shared/seo";

/**
 * Client sign in (/login). Linked from every public page, so a visitor who is not a client yet must find a way on: back
 * to the site, the free check, or the services. Signed-in visitors go straight to their landing page.
 */
export default function LoginPage() {
  usePageMeta(PAGE_META.login.title, PAGE_META.login.description);
  const [, setLocation] = useLocation();
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter your full email address, like ada@example.com.");
    setError(null);
    signIn.mutate({ email, password });
  };

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-3" aria-label={`${BRAND.productEndorsement}: home`}>
          <img src={BRAND.markUrl} alt="" className="h-9 w-auto" />
          <span className="border-l border-line pl-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">{BRAND.productName}</span>
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" aria-hidden />Back to the site</Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-12">
      <div className="w-full max-w-md space-y-6">
        <Card className="rounded-none border-line-soft bg-white shadow-sm">
          <CardHeader className="space-y-2 pb-4">
            <h1 className="font-serif text-2xl font-bold leading-none tracking-tight">{forgot ? "Reset your password" : "Client sign in"}</h1>
            {!forgot && <CardDescription className="text-sm text-ink-muted">Use the email and password you created your account with.</CardDescription>}
          </CardHeader>
          <CardContent>
            {forgot ? <ForgotPassword id="login" initialEmail={email} onBack={() => setForgot(false)} /> : (
            <form className="space-y-4" noValidate onSubmit={submit}>
              {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger-strong">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setError(null); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setError(null); }} className="pr-12" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted hover:text-brand">
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </div>
              <Button disabled={signIn.isPending} type="submit" size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
                {signIn.isPending ? "Signing in…" : "Sign in"}
              </Button>
              <button type="button" onClick={() => setForgot(true)} className="text-sm font-semibold text-brand underline underline-offset-2">Forgot your password?</button>
            </form>
            )}
          </CardContent>
        </Card>
        <div className="border border-line-soft bg-paper-raised p-5 text-sm text-ink-soft">
          <p className="font-semibold text-ink">Not a client yet?</p>
          <p className="mt-1">Your account is created when you start working with us. Start with the <Link href="/check" className="font-semibold text-brand underline underline-offset-2">free Business Health Check</Link>, or <Link href="/services" className="font-semibold text-brand underline underline-offset-2">see our services</Link>.</p>
        </div>
        <LegalFooterLinks />
        <p className="text-center text-xs text-ink-muted">Programme participant? <a href="/portal" className="font-semibold text-brand underline underline-offset-2">Go to the participant portal</a>.</p>
      </div>
      </div>
    </main>
  );
}
