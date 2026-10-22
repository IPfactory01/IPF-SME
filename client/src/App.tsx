import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { MotionConfig } from "framer-motion";
import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BusinessCheck from "./pages/BusinessCheck";
import { PrivacyPage, TermsPage } from "./pages/LegalPage";
import ServicesPage from "./pages/ServicesPage";
import ProductPage from "./pages/ProductPage";
import HowWeWorkPage from "./pages/HowWeWorkPage";
import AboutPage from "./pages/AboutPage";
import QuestionsPage from "./pages/QuestionsPage";
import ContactPage from "./pages/ContactPage";
import Home from "./pages/Home";

/*
 * The public pages load with the site. Signed-in, payment, staff and JUMP pages load only when someone opens them, so
 * a visitor on mobile data does not download the admin console and the client room to read the home page.
 */
const Admin = lazy(() => import("./pages/Admin"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminLegacyLoginPage = lazy(() => import("./pages/AdminLegacyLoginPage"));
const AdminPasswordResetPage = lazy(() => import("./pages/AdminPasswordResetPage"));
const AdminInvitationPage = lazy(() => import("./pages/AdminInvitationPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const FullReportPage = lazy(() => import("./pages/FullReportPage"));
const PayPage = lazy(() => import("./pages/PayPage"));
const PayReturnPage = lazy(() => import("./pages/PayReturnPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AccountDashboard = lazy(() => import("./pages/AccountDashboard"));
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage"));
const BusinessSettingsPage = lazy(() => import("./pages/BusinessSettingsPage"));
const Schedule = lazy(() => import("./pages/Schedule"));
const ParticipantDashboard = lazy(() => import("./pages/ParticipantDashboard"));
const ParticipantPasswordPage = lazy(() => import("./pages/ParticipantPasswordPage"));

/** What shows for the moment a page's code is loading: the page background, nothing that jumps. */
function PageLoading() {
  return <div className="min-h-screen bg-paper" aria-busy="true" />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/check" component={BusinessCheck} />
      <Route path="/services" component={ServicesPage} />
      <Route path="/services/:slug" component={ProductPage} />
      <Route path="/how-we-work" component={HowWeWorkPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/questions" component={QuestionsPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      {/* Accounts are created only from an onboarding invitation; the old public sign-up address goes to sign-in. */}
      <Route path="/signup">{() => <Redirect to="/login" />}</Route>
      <Route path="/onboarding/:token" component={OnboardingPage} />
      <Route path="/join/:token" component={JoinPage} />
      <Route path="/reset/:token" component={ResetPasswordPage} />
      <Route path="/report/:token" component={FullReportPage} />
      {/* Paying online with Paystack: the return page first, so it is never read as a token. */}
      <Route path="/pay/return" component={PayReturnPage} />
      <Route path="/pay/:token/:item" component={PayPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard" component={AccountDashboard} />
      <Route path="/settings/business" component={BusinessSettingsPage} />
      <Route path="/settings/account" component={AccountSettingsPage} />
      <Route path="/admin/login/legacy" component={AdminLegacyLoginPage} />
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin/reset" component={AdminPasswordResetPage} />
      <Route path="/admin/invite" component={AdminInvitationPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/portal/password" component={ParticipantPasswordPage} />
      <Route path="/portal" component={ParticipantDashboard} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
