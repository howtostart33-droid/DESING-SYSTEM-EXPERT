import { AuthProvider } from "@/app/AuthContext";
import { SettingsProvider } from "@/app/SettingsContext";
import { ToastProvider } from "@/app/ToastContext";
import { AppRoutes } from "@/app/router";

/**
 * Provider order matters:
 *   Toast → Settings → Auth → Routes
 * Settings first so <head> metadata and maintenance mode resolve before views
 * render; Auth last-but-one so permission checks have settings available.
 */
export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
