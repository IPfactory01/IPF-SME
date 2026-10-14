import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { PASSWORD_RESET_REQUESTED } from "@shared/auth";
import React, { useState, type FormEvent } from "react";

/**
 * "Forgot your password?" on a sign-in page: asks for the email and sends a reset link to it. The answer is the same
 * whether or not an account uses the address, so the page never reveals who has one. `id` keeps field ids unique per
 * page; `initialEmail` carries over what was typed in the sign-in form.
 */
export default function ForgotPassword({ id, initialEmail = "", onBack }: { id: string; initialEmail?: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const request = trpc.account.requestReset.useMutation({ onSuccess: () => setSent(true), onError: failure => setError(failure.message) });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return setError("Enter the email address you sign in with.");
    setError(null);
    request.mutate({ email });
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <div role="status" className="border border-health-clear bg-health-clear-tint px-4 py-3 text-sm text-ink">{PASSWORD_RESET_REQUESTED}</div>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-brand underline underline-offset-2">Back to sign in</button>
      </div>
    );
  }
  return (
    <form className="space-y-4" noValidate onSubmit={submit} aria-label="Reset your password">
      <p className="text-sm text-ink-muted">Enter the email you sign in with. We will send a link to choose a new password.</p>
      {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="space-y-2">
        <Label htmlFor={`${id}-reset-email`}>Email</Label>
        <Input id={`${id}-reset-email`} type="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setError(null); }} />
      </div>
      <Button disabled={request.isPending} type="submit" size="lg" className="h-12 w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
        {request.isPending ? "Sending…" : "Send the reset link"}
      </Button>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-brand underline underline-offset-2">Back to sign in</button>
    </form>
  );
}
