import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import { ONBOARDING_ERRORS, validateAccountPassword } from "@shared/auth";
import React, { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";

/**
 * Invitation-only. The server validates the token before this form is shown and again when it is submitted;
 * without a valid invitation no account can be created.
 */
export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const preview = trpc.onboarding.preview.useQuery({ token }, { retry: false, refetchOnWindowFocus: false });
  // Someone else signed in on this browser (often the team, testing) must not be sent to their own area or create
  // the client's account under their session: they are asked to sign out first.
  const invitedEmail = preview.data?.available ? preview.data.email : null;
  const signedInAsSomeoneElse = Boolean(account && invitedEmail && account.user.email.toLowerCase() !== invitedEmail.toLowerCase());
  const [form, setForm] = useState<{ fullName: string; password: string; confirmPassword: string; businessName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account && !preview.isLoading && !signedInAsSomeoneElse) setLocation(account.landingPath);
  }, [account, preview.isLoading, signedInAsSomeoneElse, setLocation]);

  useEffect(() => {
    if (preview.data?.available && form === null) {
      setForm({ fullName: preview.data.fullName, password: "", confirmPassword: "", businessName: preview.data.businessName });
    }
  }, [preview.data, form]);

  const signOut = trpc.account.signOut.useMutation({ onSuccess: () => utils.account.me.setData(undefined, null) });

  const accept = trpc.onboarding.accept.useMutation({
    onSuccess: view => {
      utils.account.me.setData(undefined, view);
      setLocation("/dashboard");
    },
    onError: failure => setError(failure.message),
  });

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
      <div className="w-full max-w-md space-y-6">{children}</div>
    </main>
  );

  if (preview.isLoading || (preview.data?.available && form === null)) return shell(<p className="text-center text-sm text-ink-muted">Checking your invitation…</p>);

  if (!preview.data?.available) {
    return shell(
      <Card className="rounded-none border-line-soft bg-white shadow-sm">
        <CardHeader className="space-y-2 pb-4">
          <CardTitle className="font-serif text-2xl font-bold tracking-tight">Invitation unavailable</CardTitle>
          <CardDescription className="text-sm text-ink-muted">{ONBOARDING_ERRORS.unavailable}</CardDescription>
        </CardHeader>
        <CardContent><Link href="/login" className="text-sm text-brand underline">Already have an account? Sign in</Link></CardContent>
      </Card>,
    );
  }

  const email = preview.data.email;
  if (account && signedInAsSomeoneElse) {
    return shell(
      <Card className="rounded-none border-line-soft bg-white shadow-sm">
        <CardHeader className="space-y-2 pb-4">
          <CardTitle className="font-serif text-2xl font-bold tracking-tight">You are signed in as someone else</CardTitle>
          <CardDescription className="text-sm text-ink-muted">
            This invitation is for <strong className="text-ink">{email}</strong>, but this browser is signed in as <strong className="text-ink">{account.user.email}</strong>. Sign out to create the account for {email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" disabled={signOut.isPending} onClick={() => signOut.mutate()} size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
            {signOut.isPending ? "Signing out…" : "Sign out and continue"}
          </Button>
        </CardContent>
      </Card>,
    );
  }
  const values = form!;
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => {
    setForm(current => ({ ...current!, [key]: event.target.value }));
    setError(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.fullName.trim().length < 2) return setError("Enter your full name.");
    const passwordProblem = validateAccountPassword(values.password);
    if (passwordProblem) return setError(passwordProblem);
    if (values.password !== values.confirmPassword) return setError("The password confirmation does not match.");
    if (values.businessName.trim().length < 2) return setError("Enter your business name.");
    setError(null);
    accept.mutate({ token, email, ...values });
  };

  return shell(
    <Card className="rounded-none border-line-soft bg-white shadow-sm">
      <CardHeader className="space-y-2 pb-4">
        <CardTitle className="font-serif text-2xl font-bold tracking-tight">Create your account</CardTitle>
        <CardDescription className="text-sm text-ink-muted">You have been invited to set up your client account. Your account is you. Your business is the workspace it belongs to.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" noValidate onSubmit={submit}>
          {error && <div role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="onboarding-full-name">Full name</Label>
            <Input id="onboarding-full-name" autoComplete="name" value={values.fullName} onChange={set("fullName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-email">Email</Label>
            <Input id="onboarding-email" type="email" autoComplete="email" value={email} readOnly aria-readonly="true" className="bg-paper" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-password">Password</Label>
            <Input id="onboarding-password" type="password" autoComplete="new-password" value={values.password} onChange={set("password")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-confirm-password">Confirm password</Label>
            <Input id="onboarding-confirm-password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={set("confirmPassword")} />
          </div>
          <div className="space-y-2 border-t border-line-soft pt-4">
            <Label htmlFor="onboarding-business-name">Business name</Label>
            <Input id="onboarding-business-name" autoComplete="organization" value={values.businessName} onChange={set("businessName")} />
          </div>
          <Button disabled={accept.isPending} type="submit" size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
            {accept.isPending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>,
  );
}
