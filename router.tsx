import { lazy, Suspense, useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";
import { AdminLayout, SiteLayout } from "@/components/layout";
import { ForbiddenPage, MaintenancePage, NotFoundPage } from "@/pages/Errors";
import { LoadingBlock } from "@/components/ui/data";
import { api } from "@/api";

/* Route-level code splitting keeps the marketing bundle small; the admin
   console is only downloaded when an administrator signs in. */
const HomePage = lazy(() => import("@/pages/HomePage").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("@/pages/AuthPages").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/AuthPages").then((m) => ({ default: m.RegisterPage })));
const AccountPage = lazy(() => import("@/pages/AccountPage").then((m) => ({ default: m.AccountPage })));
const DashboardPage = lazy(() => import("@/pages/admin/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const UsersPage = lazy(() => import("@/pages/admin/UsersPage").then((m) => ({ default: m.UsersPage })));
const ContentPage = lazy(() => import("@/pages/admin/ContentPage").then((m) => ({ default: m.ContentPage })));
const ActivityPage = lazy(() => import("@/pages/admin/ActivityPage").then((m) => ({ default: m.ActivityPage })));
const AnalyticsPage = lazy(() => import("@/pages/admin/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage").then((m) => ({ default: m.SettingsPage })));

const Fallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center bg-muted p-6">
    <div className="w-full max-w-3xl">
      <LoadingBlock rows={5} />
    </div>
  </div>
);

/** Records a page view on every navigation (fire-and-forget, never blocks). */
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    void api.activity.track({ type: "page.view", path: `${location.pathname}${location.hash}` });
  }, [location.pathname, location.hash]);
  return null;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Fallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function RequirePermission({ permission }: { permission: Parameters<ReturnType<typeof useAuth>["can"]>[0] }) {
  const { can, loading } = useAuth();
  if (loading) return <Fallback />;
  if (!can(permission)) return <ForbiddenPage />;
  return <Outlet />;
}

/** Blocks the public site while maintenance mode is on; admins pass through. */
function MaintenanceGate() {
  const { settings, loading } = useSettings();
  const { user } = useAuth();
  if (loading) return null;
  if (settings.maintenanceMode && user?.role === "user") return <MaintenancePage />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <>
      <RouteTracker />
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route element={<MaintenanceGate />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/account" element={<AccountPage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Admin console — nested permission checks mirror the server's middleware. */}
          <Route element={<RequireAuth />}>
            {/* Gate the whole console so a role-"user" account sees the 403 page
                rather than an admin shell full of failing requests. */}
            <Route element={<RequirePermission permission="analytics:read" />}>
              <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route element={<RequirePermission permission="users:read" />}>
                <Route path="users" element={<UsersPage />} />
              </Route>
              <Route element={<RequirePermission permission="content:read" />}>
                <Route path="content" element={<ContentPage />} />
              </Route>
              <Route element={<RequirePermission permission="activity:read" />}>
                <Route path="activity" element={<ActivityPage />} />
              </Route>
              <Route element={<RequirePermission permission="analytics:read" />}>
                <Route path="analytics" element={<AnalyticsPage />} />
              </Route>
              <Route element={<RequirePermission permission="settings:write" />}>
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
