import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MarketingLayout, ScrollToTop } from './components/chrome';
import { Spinner } from './components/primitives';
import { useSession } from './lib/session';

import Home from './pages/marketing/Home';
import Pricing from './pages/marketing/Pricing';
import { About, Solutions, Platform, Industries, Security, Resources, Privacy, Terms } from './pages/marketing/Pages';
import { Contact, Partnerships } from './pages/marketing/Contact';
import { Login, Signup, ForgotPassword, ResetPassword, VerifyEmail } from './pages/auth';

import { AppShell } from './pages/app/Shell';
import Overview from './pages/app/Overview';
import Bookings from './pages/app/Bookings';
import Customers from './pages/app/Customers';
import Catalog from './pages/app/Catalog';
import Inbox from './pages/app/Inbox';
import Marketing from './pages/app/Marketing';
import Analytics from './pages/app/Analytics';
import Integrations from './pages/app/Integrations';
import Billing from './pages/app/Billing';
import Settings from './pages/app/Settings';
import Setup from './pages/app/Setup';

const Admin = lazy(() => import('./pages/admin/Admin'));
const BusinessPage = lazy(() => import('./pages/public/Business'));

function Loading() {
  return <div className="grid min-h-[60vh] place-items-center"><Spinner label="Loading" /></div>;
}

function RequireAuth({ children, platformAdmin = false }: { children: ReactNode; platformAdmin?: boolean }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#07070c]"><Spinner label="Checking session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (platformAdmin && user.role !== 'platform_admin') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl px-6 py-32 text-center">
        <p className="text-[0.66rem] uppercase tracking-[0.3em] text-[#6f7889]">404</p>
        <h1 className="mt-4 font-display text-3xl text-white sm:text-4xl">This page does not exist</h1>
        <p className="mt-3 text-sm text-[#8d97a8]">The route you requested is not part of the MAVYRON platform.</p>
        <a href="/" className="mt-7 inline-block text-[0.78rem] text-[#a9a2ff] hover:text-white">Return to the homepage →</a>
      </div>
    </MarketingLayout>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/solutions" element={<Solutions />} />
          <Route path="/platform" element={<Platform />} />
          <Route path="/industries" element={<Industries />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/partnerships" element={<Partnerships />} />
          <Route path="/security" element={<Security />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route
          path="/app"
          element={<RequireAuth><AppShell /></RequireAuth>}
        >
          <Route index element={<Overview />} />
          <Route path="calendar" element={<Bookings />} />
          <Route path="customers" element={<Customers />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="billing" element={<Billing />} />
          <Route path="settings" element={<Settings />} />
          <Route path="setup" element={<Setup />} />
        </Route>

        <Route
          path="/admin/*"
          element={<RequireAuth platformAdmin><Suspense fallback={<Loading />}><Admin /></Suspense></RequireAuth>}
        />

        <Route path="/business/:slug" element={<Suspense fallback={<Loading />}><BusinessPage /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
