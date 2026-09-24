import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Info, X, XCircle } from "lucide-react";
import { cn } from "@/utils/cn";

type Tone = "info" | "success" | "warning" | "danger";
type Toast = { id: number; message: string; tone: Tone };

const tones: Record<Tone, { wrap: string; icon: typeof Info }> = {
  info: { wrap: "bg-foreground text-white", icon: Info },
  success: { wrap: "bg-secondary text-gray-900", icon: Check },
  warning: { wrap: "bg-accent text-gray-900", icon: AlertTriangle },
  danger: { wrap: "bg-red-600 text-white", icon: XCircle },
};

const ToastContext = createContext<{ notify: (message: string, tone?: Tone) => void } | null>(null);

/** Flat toast: solid colour block, no shadow, slides in from the right. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {toasts.map((t) => {
          const { wrap, icon: Icon } = tones[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-5 py-4 text-sm font-medium",
                "animate-[toastIn_180ms_ease-out]",
                wrap,
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.5} />
              <p className="flex-1">{t.message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="cursor-pointer rounded-sm opacity-70 transition-opacity duration-200 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
