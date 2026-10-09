import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import { ONBOARDING_ERRORS, validateAccountPassword } from "@shared/auth";
import { BRAND } from "@shared/brand";
import { CLIENT_ACCESS_LABELS } from "@shared/engagement";
import React, { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";

/**
 * Accepting an invitation to IP Factory's team or to an owner's business. The server checks the link before this form
 * shows and again on submit; the email is fixed to the one invited.
 */
export default function JoinPage() {
  const [, setLocation] = useLocation();
  const token = useParams<{ token: string }>().token ?? "";
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const preview = trpc.invitations.preview.useQuery({ token }, { retry: false, refetchOnWindowFocus: false });
  const invited = preview.data?.available ? preview.data : null;
  const signedInAsSomeoneElse = Boolean(account && invited && account.user.email.toLowerCase() !== invited.email.toLowerCase());
  const [form, setForm] = useState<{ fullName: string; password: string; confirmPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account && !preview.isLoading && !signedInAsSomeoneElse) setLocation(account.landingPath);
  }, [account, preview.isLoading, signedInAsSomeoneElse, setLocation]);
  useEffect(() => {
    if (invited && form === null) setForm({ fullName: invited.fullName, password: "", confirmPassword: "" });
  }, [invited, form]);

  const signOut = trpc.account.signOut.useMutation({ onSuccess: () => utils.account.me.setData(undefined, null) });
  const accept = trpc.invitations.accept.useMutation({
    onSuccess: view => {
      utils.account.me.setData(undefined, view);
      setLocation(view.landingPath);
    },
    onError: failure => setError(failure.message),
  });

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
      <div className="w-full max-w-md space-y-6">{children}</div>
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

  if (preview.isLoading || (invited && form === null)) return shell(<p className="text-center text-sm text-ink-muted">Checking your invitation…</p>);
  if (!invited) return shell(card("Invitation unavailable", ONBOARDING_ERRORS.unavailable, <Link href="/login" className="text-sm text-brand underline">Already have an account? Sign in</Link>));
  if (account && signedInAsSomeoneElse) {
    return shell(card(
      "You are signed in as someone else",
      <>This invitation is for <strong className="text-ink">{invited.email}</strong>, but this browser is signed in as <strong className="text-ink">{account.user.email}</strong>. Sign out to create the account for {invited.email}.</>,
      <Button type="button" disabled={signOut.isPending} onClick={() => signOut.mutate()} size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">{signOut.isPending ? "Signing out…" : "Sign out and continue"}</Button>,
    ));
  }

  const values = form!;
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => {
    setForm(current => ({ ...current!, [key]: event.target.value }));
    setError(null);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.fullName.trim().length < 2) return setError("Enter your full name.");
    const problem = validateAccountPassword(values.password);
    if (problem) return setError(problem);
    if (values.password !== values.confirmPassword) return setError("The password confirmation does not match.");
    setError(null);
    accept.mutate({ token, email: invited.email, ...values });
  };
  const staff = invited.kind === "staff";
  const intro = staff
    ? `You have been invited to the ${BRAND.organisationName} team on ${BRAND.productName}. Set a password to start.`
    : `You have been invited to work on ${invited.businessName ?? "a business"} with ${BRAND.organisationName}. ${invited.access ? CLIENT_ACCESS_LABELS[invited.access].detail : ""}`;

  return shell(card("Create your account", intro, (
    <form className="space-y-4" noValidate onSubmit={submit}>
      {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="space-y-2"><Label htmlFor="join-full-name">Full name</Label><Input id="join-full-name" autoComplete="name" value={values.fullName} onChange={set("fullName")} /></div>
      <div className="space-y-2"><Label htmlFor="join-email">Email</Label><Input id="join-email" type="email" autoComplete="email" value={invited.email} readOnly aria-readonly="true" className="bg-paper" /></div>
      <div className="space-y-2"><Label htmlFor="join-password">Password</Label><Input id="join-password" type="password" autoComplete="new-password" value={values.password} onChange={set("password")} /></div>
      <div className="space-y-2"><Label htmlFor="join-confirm-password">Confirm password</Label><Input id="join-confirm-password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={set("confirmPassword")} /></div>
      <Button disabled={accept.isPending} type="submit" size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">{accept.isPending ? "Creating account…" : "Create account"}</Button>
    </form>
  )));
}
