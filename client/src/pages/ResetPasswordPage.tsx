import { LegalFooterLinks } from "@/components/LegalLinks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { PASSWORD_RESET_ERRORS, validateAccountPassword } from "@shared/auth";
import React, { useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";

/**
 * Choosing a new password from a reset link (asked for on a sign-in page, or issued by the team). The server checks the link before the form
 * shows and again on submit; using it signs the person out everywhere, and they sign in afresh.
 */
export default function ResetPasswordPage() {
  const token = useParams<{ token: string }>().token ?? "";
  const preview = trpc.account.resetPreview.useQuery({ token }, { retry: false, refetchOnWindowFocus: false });
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const reset = trpc.account.resetPassword.useMutation({ onSuccess: () => setDone(true), onError: failure => setError(failure.message) });

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
      <div className="w-full max-w-md space-y-6">{children}<LegalFooterLinks /></div>
    </main>
  );
  const card = (title: string, description: React.ReactNode, body?: React.ReactNode) => (
    <Card className="rounded-none border-line-soft bg-white shadow-sm">
      <CardHeader className="space-y-2 pb-4">
        <CardTitle className="font-serif text-2xl font-bold tracking-tight">{title}</CardTitle>
        <CardDescription className="text-sm text-ink-muted">{description}</CardDescription>
      </CardHeader>
      {body && <CardContent>{body}</CardContent>}
    </Card>
  );
  const signInLink = <Link href="/login" className="text-sm font-semibold text-brand underline underline-offset-2">Go to sign in</Link>;

  if (preview.isLoading) return shell(<p className="text-center text-sm text-ink-muted">Checking your link…</p>);
  if (done) return shell(card("Password changed", "Sign in with your new password. Any other place you were signed in has been signed out.", signInLink));
  if (!preview.data?.available) return shell(card("Reset link unavailable", PASSWORD_RESET_ERRORS.unavailable, signInLink));
  const email = preview.data.email;

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm(current => ({ ...current, [key]: event.target.value }));
    setError(null);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateAccountPassword(form.password);
    if (problem) return setError(problem);
    if (form.password !== form.confirmPassword) return setError("The password confirmation does not match.");
    setError(null);
    reset.mutate({ token, ...form });
  };

  return shell(card("Choose a new password", `For ${email}. The link works once and expires 20 minutes after it was issued.`, (
    <form className="space-y-4" noValidate onSubmit={submit}>
      {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="space-y-2"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" value={email} readOnly aria-readonly="true" className="bg-paper" /></div>
      <div className="space-y-2"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} /></div>
      <div className="space-y-2"><Label htmlFor="reset-confirm-password">Confirm new password</Label><Input id="reset-confirm-password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set("confirmPassword")} /></div>
      <Button disabled={reset.isPending} type="submit" size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">{reset.isPending ? "Saving…" : "Save the new password"}</Button>
    </form>
  )));
}
