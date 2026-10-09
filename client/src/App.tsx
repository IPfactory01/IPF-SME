import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { MotionConfig } from "framer-motion";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Admin from "./pages/Admin";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminLegacyLoginPage from "./pages/AdminLegacyLoginPage";
import AdminPasswordResetPage from "./pages/AdminPasswordResetPage";
import AdminInvitationPage from "./pages/AdminInvitationPage";
import BusinessCheck from "./pages/BusinessCheck";
import OnboardingPage from "./pages/OnboardingPage";
import JoinPage from "./pages/JoinPage";
import FullReportPage from "./pages/FullReportPage";
import LoginPage from "./pages/LoginPage";
import AccountDashboard from "./pages/AccountDashboard";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import BusinessSettingsPage from "./pages/BusinessSettingsPage";
import Home from "./pages/Home";
import Schedule from "./pages/Schedule";
import ParticipantDashboard from "./pages/ParticipantDashboard";
import ParticipantPasswordPage from "./pages/ParticipantPasswordPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/check" component={BusinessCheck} />
      {/* Accounts are created only from an onboarding invitation; the old public sign-up address goes to sign-in. */}
      <Route path="/signup">{() => <Redirect to="/login" />}</Route>
      <Route path="/onboarding/:token" component={OnboardingPage} />
      <Route path="/join/:token" component={JoinPage} />
      <Route path="/report/:token" component={FullReportPage} />
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
