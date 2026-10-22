/**
 * The JUMP participant sign-in, kept for JUMP participants sent from their portal (/?participant_signin=1). The Shift's
 * clients sign in at /login. Lifted out of the home page unchanged when the site became several pages.
 */
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { KeyRound, MailCheck } from "lucide-react";
import React, { useEffect, useState } from "react";

export function ParticipantSignIn({ onStartCheck }: { onStartCheck: () => void }) {
  const handleStartCheck = onStartCheck;
  const [isParticipantSignInOpen, setIsParticipantSignInOpen] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [passwordLinkSent, setPasswordLinkSent] = useState(false);
  const [isPasswordHelpMode, setIsPasswordHelpMode] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("participant_signin") === "1") {
      setIsParticipantSignInOpen(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const requestPortalLinkMutation = trpc.registration.requestPortalLink.useMutation({
    onSuccess: () => {
      setPasswordLinkSent(true);
      setSignInError("");
    },
    onError: (err) => {
      setSignInError(err.message || "No registration found for this email address.");
    },
  });

  const participantSignInMutation = trpc.participant.signIn.useMutation({
    onSuccess: () => {
      window.location.assign("/portal");
    },
    onError: (err) => {
      setSignInError(err.message || "We could not sign you in. Please check your details and try again.");
    },
  });

  const handleParticipantSignIn = () => {
    if (!signInEmail || !signInEmail.includes("@") || !signInPassword) {
      setSignInError("Enter your registered email address and password.");
      return;
    }
    setSignInError("");
    participantSignInMutation.mutate({ email: signInEmail, password: signInPassword });
  };

  const handlePasswordLinkRequest = () => {
    if (!signInEmail || !signInEmail.includes("@")) {
      setSignInError("Enter the email address you used to register.");
      return;
    }
    setSignInError("");
    setPasswordLinkSent(false);
    requestPortalLinkMutation.mutate({ email: signInEmail });
  };

  return (
      <Dialog open={isParticipantSignInOpen} onOpenChange={setIsParticipantSignInOpen}>
        <DialogContent className="max-w-md bg-paper border border-line text-ink">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-bold">{BRAND.programmeShortName} participant sign in</DialogTitle>
            <DialogDescription className="text-xs text-ink-soft">Sign in with the email address and password for your {BRAND.programmeName} participant portal. {BRAND.productName} clients sign in at <a href="/login" className="font-semibold text-brand underline underline-offset-2">client sign in</a>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-ink-muted block mb-1 font-semibold">Email address</label>
              <Input
                type="email"
                placeholder="e.g. name@company.com"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                className="bg-white border-line"
                autoComplete="email"
              />
            </div>
            {!isPasswordHelpMode && <div>
              <label className="text-xs uppercase tracking-wider text-ink-muted block mb-1 font-semibold">Password</label>
              <Input type="password" placeholder="Your password" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} className="bg-white border-line" autoComplete="current-password" />
            </div>}
            {signInError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                {signInError}
              </div>
            )}
            {passwordLinkSent ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded space-y-3">
                <p className="text-xs text-green-800 font-medium">
                  If this email belongs to a client account, a secure password link will arrive shortly. It lets you set a first password or reset an existing one, and expires in 20 minutes.
                </p>
                <Button
                  onClick={() => {
                    setIsParticipantSignInOpen(false);
                    setPasswordLinkSent(false);
                    setSignInEmail("");
                    setSignInPassword("");
                  }}
                  className="w-full bg-brand text-white text-xs uppercase tracking-widest py-2 rounded-none"
                >
                  Done
                </Button>
              </div>
            ) : (
              isPasswordHelpMode ? <>
                <p className="border-l-2 border-brand bg-brand-tint px-3 py-2 text-xs leading-5 text-brand">New client? This link lets you set your password. Returning? It lets you reset it.</p>
                <Button onClick={handlePasswordLinkRequest} disabled={requestPortalLinkMutation.isPending} className="w-full bg-brand text-white hover:bg-brand-deep-hover text-xs uppercase tracking-widest py-2.5 rounded-none">
                  <MailCheck className="mr-2 h-4 w-4" />{requestPortalLinkMutation.isPending ? "Sending secure link…" : "Email secure password link"}
                </Button>
                <button type="button" onClick={() => { setIsPasswordHelpMode(false); setSignInError(""); }} className="w-full text-center text-xs font-semibold text-brand underline underline-offset-2">Back to password sign in</button>
              </> : <>
                <Button onClick={handleParticipantSignIn} disabled={participantSignInMutation.isPending} className="w-full bg-brand text-white hover:bg-brand-deep-hover text-xs uppercase tracking-widest py-2.5 rounded-none">
                  <KeyRound className="mr-2 h-4 w-4" />{participantSignInMutation.isPending ? "Signing in…" : "Sign in"}
                </Button>
                <button type="button" onClick={() => { setIsPasswordHelpMode(true); setSignInError(""); }} className="w-full text-center text-xs font-semibold text-brand underline underline-offset-2">First time here or forgot your password?</button>
              </>
            )}
            {!passwordLinkSent && <p className="text-center text-xs leading-5 text-ink-muted">Not a client yet? <button type="button" onClick={() => { setIsParticipantSignInOpen(false); handleStartCheck(); }} className="font-semibold text-brand underline underline-offset-2">Start with the free Business Health Check</button>.</p>}
          </div>
        </DialogContent>
      </Dialog>
  );
}
