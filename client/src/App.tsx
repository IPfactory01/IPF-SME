import React, { Suspense, lazy, useEffect, useState } from "react";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { lazyPage, matchesPath, type LazyPage } from "./lib/lazyPage";
import { ThemeProvider } from "./contexts/ThemeContext";

/*
 * Every page loads only when someone opens it (R70): a visitor on mobile data reading the home page downloads the home
 * page, not the check, the guides, the client room or the admin console. main.tsx preloads the page for the address
 * the visitor arrived at before React takes over the page rendered at build time.
 */
const Home = lazyPage(() => import("./pages/Home"));
const CheckPage = lazyPage(() => import("./pages/CheckPage"));
const ServicesPage = lazyPage(() => import("./pages/ServicesPage"));
const ProductPage = lazyPage(() => import("./pages/ProductPage"));
const HowWeWorkPage = lazyPage(() => import("./pages/HowWeWorkPage"));
const ExperiencePage = lazyPage(() => import("./pages/ExperiencePage"));
const GuidesIndex = lazyPage(() => import("./pages/GuidesPage").then(module => ({ default: module.GuidesIndex })));
const GuidePage = lazyPage(() => import("./pages/GuidesPage"));
const AboutPage = lazyPage(() => import("./pages/AboutPage"));
const QuestionsPage = lazyPage(() => import("./pages/QuestionsPage"));
const ContactPage = lazyPage(() => import("./pages/ContactPage"));
const TermsPage = lazyPage(() => import("./pages/LegalPage").then(module => ({ default: module.TermsPage })));
const PrivacyPage = lazyPage(() => import("./pages/LegalPage").then(module => ({ default: module.PrivacyPage })));
const OnboardingPage = lazyPage(() => import("./pages/OnboardingPage"));
const JoinPage = lazyPage(() => import("./pages/JoinPage"));
const ResetPasswordPage = lazyPage(() => import("./pages/ResetPasswordPage"));
const FullReportPage = lazyPage(() => import("./pages/FullReportPage"));
const PayReturnPage = lazyPage(() => import("./pages/PayReturnPage"));
const FeePayPage = lazyPage(() => import("./pages/FeePayPage"));
const PayPage = lazyPage(() => import("./pages/PayPage"));
const LoginPage = lazyPage(() => import("./pages/LoginPage"));
const AccountDashboard = lazyPage(() => import("./pages/AccountDashboard"));
const BusinessSettingsPage = lazyPage(() => import("./pages/BusinessSettingsPage"));
const AccountSettingsPage = lazyPage(() => import("./pages/AccountSettingsPage"));
const AdminLoginPage = lazyPage(() => import("./pages/AdminLoginPage"));
const AdminPasswordResetPage = lazyPage(() => import("./pages/AdminPasswordResetPage"));
const Admin = lazyPage(() => import("./pages/Admin"));
const NotFound = lazyPage(() => import("./pages/NotFound"));

/** Every address, in the order wouter's Switch tries them. */
const ROUTES: { path: string; page: LazyPage }[] = [
  { path: "/", page: Home },
  { path: "/check", page: CheckPage },
  { path: "/services", page: ServicesPage },
  { path: "/services/:slug", page: ProductPage },
  { path: "/how-we-work", page: HowWeWorkPage },
  { path: "/experience", page: ExperiencePage },
  { path: "/guides", page: GuidesIndex },
  { path: "/guides/:slug", page: GuidePage },
  { path: "/about", page: AboutPage },
  { path: "/questions", page: QuestionsPage },
  { path: "/contact", page: ContactPage },
  { path: "/terms", page: TermsPage },
  { path: "/privacy", page: PrivacyPage },
  { path: "/onboarding/:token", page: OnboardingPage },
  { path: "/join/:token", page: JoinPage },
  { path: "/reset/:token", page: ResetPasswordPage },
  { path: "/report/:token", page: FullReportPage },
  // Paying online with Paystack: the return page first, so it is never read as a token.
  { path: "/pay/return", page: PayReturnPage },
  { path: "/pay/fee/:feeLineId/:token", page: FeePayPage },
  { path: "/pay/:token/:item", page: PayPage },
  { path: "/login", page: LoginPage },
  { path: "/dashboard", page: AccountDashboard },
  { path: "/settings/business", page: BusinessSettingsPage },
  { path: "/settings/account", page: AccountSettingsPage },
  { path: "/admin/login", page: AdminLoginPage },
  { path: "/admin/reset", page: AdminPasswordResetPage },
];

/** Loads the code of the page at this address (the admin console's addresses all begin /admin). */
export function preloadPage(path: string) {
  const route = ROUTES.find(item => matchesPath(item.path, path));
  return route ? route.page.preload() : path.startsWith("/admin") ? Admin.preload() : Promise.resolve();
}

/** What shows for the moment a page's code is loading: the page background, nothing that jumps. */
function PageLoading() {
  return <div className="min-h-screen bg-paper" aria-busy="true" />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Switch>
      {/* Accounts are created only from an onboarding invitation; the old public sign-up address goes to sign-in. */}
      <Route path="/signup">{() => <Redirect to="/login" />}</Route>
      {ROUTES.map(route => <Route key={route.path} path={route.path} component={route.page} />)}
      <Route path="/admin" component={Admin} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

/*
 * The notices that confirm a save (sonner) load once the page is idle: no public page shows one on arrival, and the code
 * stays out of the first view. Pages that animate (the check, the room) set the reduced-motion rule themselves.
 */
const Toaster = lazy(() => import("@/components/ui/sonner").then(module => ({ default: module.Toaster })));

function LaterToaster() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1));
    const handle = idle(() => setReady(true));
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(handle);
  }, []);
  return ready ? <Suspense fallback={null}><Toaster /></Suspense> : null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LaterToaster />
        <Router />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
