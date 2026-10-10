import { Button } from "@/components/ui/button";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";

/**
 * The signed-in shell, in the same dress as the public site: the mark and the product name, the gradient rule, the
 * same nav underline. Who you are (account), where you are working (workspace) and where you can go. The server
 * session decides; the redirect to sign-in below is only a convenience.
 *
 * `width` is "reading" for the settings pages (a form's width) and "wide" for the room, which has two columns.
 */
export default function AccountLayout({ children, heading, width = "reading" }: { children: (account: NonNullable<ReturnType<typeof useAccount>["account"]>) => React.ReactNode; heading?: string; width?: "reading" | "wide" }) {
  const [location, setLocation] = useLocation();
  const { account, loading } = useAccount();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!loading && !account) setLocation("/login");
  }, [loading, account, setLocation]);

  const signOut = trpc.account.signOut.useMutation({
    onSuccess: () => {
      utils.account.me.setData(undefined, null);
      setLocation("/login");
    },
  });

  if (loading || !account) {
    return <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-sm text-ink-muted">Loading…</main>;
  }

  const link = (href: string, label: string) => (
    <Link href={href} className={`relative py-1 text-sm font-medium transition-colors hover:text-brand ${location === href ? "text-brand" : "text-ink-600"}`}>
      {label}
      {location === href && <span aria-hidden className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-highlight-ink" />}
    </Link>
  );

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
        <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
        <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <Link href="/dashboard" className="flex items-center gap-3" aria-label={BRAND.productEndorsement}>
            <img src={BRAND.markUrl} alt={BRAND.organisationName} className="h-9 w-auto shrink-0" />
            <span className="border-l border-line pl-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">{BRAND.productName}</span>
          </Link>
          <nav aria-label="Account" className="order-last flex w-full flex-wrap items-center gap-5 sm:order-none sm:w-auto">
            {link("/dashboard", account.activeBusiness ? "Your room" : "Home")}
            {account.activeBusiness && link("/settings/business", "Business settings")}
            {link("/settings/account", "Account settings")}
            {account.platformRoles.length > 0 && <a href="/admin" className="py-1 text-sm font-medium text-ink-600 transition-colors hover:text-brand">Internal area</a>}
          </nav>
          <div className="flex items-center gap-3">
            <WorkspaceSwitcher account={account} />
            <Button variant="outline" size="sm" disabled={signOut.isPending} onClick={() => signOut.mutate()} className="rounded-none border-brand-line text-xs font-semibold uppercase tracking-wider text-brand hover:bg-brand-tint">
              {signOut.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>
      <div className={`${width === "wide" ? "container" : "mx-auto w-full max-w-3xl px-6"} flex-1 space-y-6 py-8`}>
        {heading && <h1 className="font-serif text-3xl font-bold tracking-tight">{heading}</h1>}
        {children(account)}
      </div>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-muted">{BRAND.productEndorsement}</footer>
    </main>
  );
}
