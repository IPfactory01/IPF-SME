import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import type { AccountSessionView, TwoStepChallenge } from "@shared/auth";
import { BRAND } from "@shared/brand";
import QRCode from "qrcode";
import React, { useEffect, useState, type FormEvent } from "react";

type Props = {
  id: string;
  challenge: TwoStepChallenge;
  /** Called once the person is signed in (and, the first time, has seen their recovery codes). */
  onSignedIn: (view: AccountSessionView) => void;
  onCancel: () => void;
};

/** "ABCD EFGH IJKL …": the setup key in groups of four, easier to type into an app by hand. */
export const groupKey = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

/**
 * The second step of sign-in for anyone with an internal role. The first time, it shows the QR code (and the key, for
 * typing in) to add the account to an authenticator app, then the recovery codes once. After that, it asks for the
 * six-digit code only. A recovery code works in the same box.
 */
export default function TwoStepStep({ id, challenge, onSignedIn, onCancel }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ view: AccountSessionView; codes: string[] } | null>(null);
  const setup = challenge.setup;

  useEffect(() => {
    let live = true;
    if (setup) void QRCode.toDataURL(setup.uri, { margin: 1, width: 192 }).then(url => { if (live) setQr(url); }).catch(() => undefined);
    return () => { live = false; };
  }, [setup]);

  const verify = trpc.account.verifyTwoStep.useMutation({
    onSuccess: ({ recoveryCodes, ...view }) => {
      if (recoveryCodes?.length) setSaved({ view, codes: recoveryCodes });
      else onSignedIn(view);
    },
    onError: failure => setError(failure.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.trim().length < 6) return setError("Enter the six-digit code from your authenticator app.");
    setError(null);
    verify.mutate({ challenge: challenge.challenge, code });
  };

  if (saved) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Save your recovery codes</h2>
        <p className="text-sm text-ink-soft">If you lose your phone, each of these codes signs you in once instead of the app. Keep them somewhere safe, away from your phone. You will not see them again.</p>
        <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 border border-line-soft bg-paper-raised p-4 font-mono text-sm tabular-nums">
          {saved.codes.map(item => <li key={item}>{item}</li>)}
        </ul>
        <Button type="button" size="lg" onClick={() => onSignedIn(saved.view)} className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
          I have saved them. Continue
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      {setup ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Set up two-step sign-in</h2>
          <p className="text-sm text-ink-soft">Everyone on the {BRAND.organisationName} team signs in with a password and a code from their phone. Open an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password) and scan this code.</p>
          <div className="flex justify-center border border-line-soft bg-white p-3">
            {qr ? <img src={qr} alt="QR code to add your account to an authenticator app" width={192} height={192} /> : <div className="h-48 w-48 bg-paper-raised" aria-hidden />}
          </div>
          <p className="text-sm text-ink-soft">Cannot scan it? Choose "enter a setup key" in the app and type:</p>
          <p className="break-all border border-line-soft bg-paper-raised px-3 py-2 font-mono text-sm tracking-wider" data-testid={`${id}-setup-key`}>{groupKey(setup.secret)}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Enter your code</h2>
          <p className="text-sm text-ink-soft">Open your authenticator app and enter the six-digit code for {BRAND.productName}. Lost your phone? Enter one of your recovery codes instead.</p>
        </div>
      )}
      {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger-strong">{error}</div>}
      <div className="space-y-2">
        <Label htmlFor={`${id}-code`}>{setup ? "Code from the app" : "Code"}</Label>
        <Input id={`${id}-code`} inputMode={setup ? "numeric" : "text"} autoComplete="one-time-code" autoFocus value={code} maxLength={20} onChange={event => { setCode(event.target.value); setError(null); }} className="font-mono tracking-widest" />
      </div>
      <Button disabled={verify.isPending} type="submit" size="lg" className="w-full rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
        {verify.isPending ? "Checking…" : setup ? "Turn on and sign in" : "Sign in"}
      </Button>
      <button type="button" onClick={onCancel} className="text-sm font-semibold text-brand underline underline-offset-2">Start again</button>
    </form>
  );
}
