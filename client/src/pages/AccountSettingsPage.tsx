import AccountLayout from "@/components/AccountLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { validateAccountPassword } from "@shared/auth";
import React, { useState, type FormEvent } from "react";
import { toast } from "sonner";

function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(fullName);
  const [error, setError] = useState<string | null>(null);
  const update = trpc.account.updateProfile.useMutation({
    onSuccess: view => {
      utils.account.me.setData(undefined, view);
      toast.success("Your name has been saved.");
    },
    onError: failure => setError(failure.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Enter your full name.");
    setError(null);
    update.mutate({ fullName: name });
  };
  return (
    <Card className="rounded-none border-line-soft bg-white shadow-sm">
      <CardHeader className="space-y-1 pb-3"><CardTitle className="text-lg font-semibold">Your details</CardTitle><CardDescription>Your email is how you sign in, so it cannot be changed here.</CardDescription></CardHeader>
      <CardContent>
        <form className="space-y-4" noValidate onSubmit={submit}>
          {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger-strong">{error}</div>}
          <div className="space-y-2"><Label htmlFor="account-name">Full name</Label><Input id="account-name" autoComplete="name" value={name} onChange={event => { setName(event.target.value); setError(null); }} /></div>
          <div className="space-y-2"><Label htmlFor="account-email">Email</Label><Input id="account-email" value={email} readOnly aria-readonly="true" className="bg-paper" /></div>
          <Button disabled={update.isPending} type="submit" className="rounded-none bg-brand text-xs uppercase tracking-wider text-white">{update.isPending ? "Saving…" : "Save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const change = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Your password has been changed. Other devices have been signed out.");
    },
    onError: failure => setError(failure.message),
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm(current => ({ ...current, [key]: event.target.value }));
    setError(null);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.currentPassword) return setError("Enter your current password.");
    const problem = validateAccountPassword(form.newPassword);
    if (problem) return setError(problem);
    if (form.newPassword !== form.confirmPassword) return setError("The password confirmation does not match.");
    setError(null);
    change.mutate(form);
  };
  return (
    <Card className="rounded-none border-line-soft bg-white shadow-sm">
      <CardHeader className="space-y-1 pb-3"><CardTitle className="text-lg font-semibold">Change password</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-4" noValidate onSubmit={submit}>
          {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger-strong">{error}</div>}
          <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set("currentPassword")} /></div>
          <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" value={form.newPassword} onChange={set("newPassword")} /></div>
          <div className="space-y-2"><Label htmlFor="confirm-new-password">Confirm new password</Label><Input id="confirm-new-password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set("confirmPassword")} /></div>
          <Button disabled={change.isPending} type="submit" className="rounded-none bg-brand text-xs uppercase tracking-wider text-white">{change.isPending ? "Changing…" : "Change password"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AccountSettingsPage() {
  return (
    <AccountLayout heading="Account settings">
      {account => (
        <>
          <ProfileForm key={account.user.id} fullName={account.user.fullName} email={account.user.email} />
          <PasswordForm />
        </>
      )}
    </AccountLayout>
  );
}
