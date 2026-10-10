import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { onSectionLinkClick } from "@/lib/scrollToSection";
import { CtaButton, Faq, Hero, Journey, NAV, StuckPicker, useActiveSection, useScrolled } from "@/components/home/HomeSections";
import { Reveal, ScrollProgress, Stagger, staggerChild } from "@/components/motion";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, KeyRound, MailCheck, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BRAND } from "@shared/brand";

export default function Home() {
  const [, setLocation] = useLocation();
  const scrolled = useScrolled();
  const active = useActiveSection(NAV.map((item) => item.id));
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

  /** The free business check: the external form when configured, otherwise the on-site check. */
  const handleStartCheck = () => {
    if (BRAND.applyUrl) {
      window.open(BRAND.applyUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setLocation("/check");
  };


  return (
    <div className="min-h-screen bg-paper text-ink font-sans flex flex-col selection:bg-brand selection:text-paper">
      {/* Copy: concept note v0.8.1, section 16 ("lift as is"). [NAME] is BRAND.productName. */}
      <ScrollProgress />
      <header className={`border-b bg-paper/85 backdrop-blur-md sticky top-0 z-50 transition-[box-shadow,border-color] duration-300 ${scrolled ? "border-line shadow-[0_8px_30px_-12px_rgba(18,50,79,0.25)]" : "border-transparent"}`}>
        <div className={`container flex items-center justify-between transition-[height] duration-300 ${scrolled ? "h-16" : "h-20"}`}>
          <a href="#top" onClick={onSectionLinkClick} className="flex items-center gap-3" aria-label={BRAND.productEndorsement}>
            <img src={BRAND.markUrl} alt={BRAND.organisationName} className="h-10 w-auto shrink-0" />
            <span className="hidden sm:inline-block border-l border-line pl-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">{BRAND.productName}</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-ink-600">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} onClick={onSectionLinkClick} className={`relative py-1 transition-colors hover:text-brand ${active === item.id ? "text-brand" : ""}`}>
                {item.label}
                {active === item.id && <motion.span layoutId="nav-underline" className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-highlight-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-none border-brand-line text-brand hover:bg-brand-tint text-xs uppercase tracking-wider font-semibold"
            >
              <a href="/login">Client sign in</a>
            </Button>
            <Button onClick={handleStartCheck} className="group hidden sm:inline-flex bg-ink text-paper hover:bg-charcoal font-medium text-xs uppercase tracking-widest px-5 py-2.5 rounded-none transition-transform active:scale-95">
              Free Business Check <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </header>

      <Hero onStart={handleStartCheck} />

      {/* What business owners tell us */}
      <section id="problem" className="py-24 border-b border-line">
        <div className="container max-w-5xl mx-auto">
          <Reveal>
            <span className="text-xs uppercase tracking-widest text-ink-muted font-semibold block mb-6 text-center">What business owners tell us</span>
          </Reveal>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
            {["I'm busy but not making money.", "Nothing moves unless I'm there.", "How do I get more customers, every month?", "Cash is always tight and my prices are guesses."].map((quote) => (
              <motion.button
                key={quote}
                type="button"
                variants={staggerChild}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartCheck}
                className="group relative overflow-hidden p-6 text-left bg-paper-sunken border border-line hover:border-brand hover:shadow-lg transition-[border-color,box-shadow] duration-300"
              >
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 origin-bottom scale-y-0 bg-highlight-ink transition-transform duration-300 group-hover:scale-y-100" />
                <p className="font-serif italic text-xl text-ink-750 leading-snug">&ldquo;{quote}&rdquo;</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
                  That&apos;s me <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </motion.button>
            ))}
          </Stagger>
          <Reveal>
            <p className="font-serif text-2xl sm:text-3xl text-center text-ink max-w-3xl mx-auto leading-snug">
              If one of those is you, you don&apos;t need another course. You need someone who stays with you while you fix it.
            </p>
          </Reveal>
        </div>
      </section>

      {/* What we are, and are not */}
      <section id="what" className="py-24 border-b border-line bg-paper-sunken/50">
        <div className="container max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <Reveal>
            <span className="text-xs uppercase tracking-widest text-ink-muted font-semibold block mb-3">What we are, and are not</span>
            <h2 className="font-serif text-4xl font-bold tracking-tight mb-6">We don&apos;t run your business; you do.</h2>
            <ul className="space-y-2 text-ink-600">
              <li className="flex items-center gap-3"><X className="h-4 w-4 text-highlight-ink" />We are not a course.</li>
              <li className="flex items-center gap-3"><X className="h-4 w-4 text-highlight-ink" />We are not a consultant who writes a report and leaves.</li>
            </ul>
          </Reveal>
          <Reveal delay={0.12} className="space-y-5 text-lg text-ink-600 leading-relaxed">
            <p>We work out what is really wrong, tell you what to do about it, hand you the tools, and meet you every week until it is done.</p>
            <p className="p-5 border border-brand-line bg-brand-tint text-base text-brand-deep">Our analysts and AI do the heavy lifting, under a named {BRAND.organisationName} consultant. We say so up front.</p>
          </Reveal>
        </div>
      </section>

      <Journey />

      <StuckPicker onStart={handleStartCheck} />

      {/* Who it is for / who you work with */}
      <section id="for" className="py-24 border-b border-line">
        <div className="container max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
          <Reveal>
            <span className="text-xs uppercase tracking-widest text-ink-muted font-semibold block mb-3">Who it is for</span>
            <p className="text-lg text-ink-600 leading-relaxed mb-4">
              Business owners who already trade, at about ₦5 million a month or more, and who can give two to four hours a week for six weeks.
            </p>
            <p className="text-ink-soft leading-relaxed">
              If you are smaller, start with the free Business Check and our training timetable. If you are much larger, we will point you to {BRAND.organisationName} Advisory.
            </p>
          </Reveal>
          <div>
            <Reveal><span className="text-xs uppercase tracking-widest text-ink-muted font-semibold block mb-3">Who you work with</span></Reveal>
            <Stagger as="ul" className="space-y-3 text-lg text-ink-600">
              {[`A named ${BRAND.organisationName} consultant leads your work.`, "Analysts prepare every Session.", "A partner joins for larger businesses.", "We use AI for analysis and say so."].map((line) => (
                <motion.li key={line} variants={staggerChild} className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-highlight-ink" />{line}</motion.li>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <Faq />

      {/* The ask */}
      <section className="relative overflow-hidden py-20 bg-linear-to-t from-brand to-brand-plum text-paper">
        <motion.div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-highlight/20 blur-3xl" animate={{ x: ["-55%", "-45%", "-55%"], opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        <Reveal className="relative container max-w-3xl mx-auto text-center">
          <img src={BRAND.logoOnDarkUrl} alt={BRAND.organisationName} className="mx-auto mb-8 h-28 w-auto" />
          <h2 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight mb-4">Start with the free Business Check.</h2>
          <p className="text-on-dark-muted max-w-xl mx-auto mb-8">Ten minutes. No card. You&apos;ll know where you stand before you decide anything.</p>
          <CtaButton onClick={handleStartCheck} tone="light">Start with a free Business Check</CtaButton>
        </Reveal>
      </section>

      {/* JUMP participant sign-in, opened from the JUMP portal (/?participant_signin=1); clients sign in at /login */}
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
            {!passwordLinkSent && <p className="text-center text-xs leading-5 text-ink-muted">Not a client yet? <button type="button" onClick={() => { setIsParticipantSignInOpen(false); handleStartCheck(); }} className="font-semibold text-brand underline underline-offset-2">Start with the free Business Check</button>.</p>}
          </div>
        </DialogContent>
      </Dialog>


      <footer className="py-12 border-t border-line bg-paper">
        <div className="container max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-ink-muted">
          <div className="flex items-center gap-4">
            <img src={BRAND.logoUrl} alt={BRAND.organisationName} className="h-16 w-auto" />
            <p>© 2026 {BRAND.organisationLegalName} ({BRAND.organisationName}). {BRAND.productName}: {BRAND.productTagline.toLowerCase()}.</p>
          </div>
          <div className="flex items-center gap-6">
            <a href="#how" onClick={onSectionLinkClick} className="hover:text-ink">How it works</a>
            <a href="#stuck" onClick={onSectionLinkClick} className="hover:text-ink">Where you're stuck</a>
            <a href="#questions" onClick={onSectionLinkClick} className="hover:text-ink">Questions</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
