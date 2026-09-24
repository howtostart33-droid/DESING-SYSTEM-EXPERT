import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/api";
import type { NavItem, SiteSettings } from "@/api/types";
import { DEFAULT_SETTINGS } from "@/api/localProvider";

type SettingsState = {
  settings: SiteSettings;
  nav: NavItem[];
  loading: boolean;
  save: (patch: Partial<SiteSettings>) => Promise<SiteSettings>;
  saveNav: (items: NavItem[]) => Promise<void>;
  reload: () => Promise<void>;
};

const SettingsContext = createContext<SettingsState | null>(null);

/** Reflects CMS settings into <head> so SEO/social data is never hardcoded. */
function applyHeadMeta(s: SiteSettings) {
  const url = s.siteUrl.replace(/\/$/, "");
  document.title = s.seo.title || s.siteName;

  const set = (selector: string, attr: string, value: string) => {
    let el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
    if (!el) {
      el = document.createElement("meta");
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };

  set('meta[name="description"]', "content", s.seo.description);
  set('meta[property="og:title"]', "content", s.seo.title);
  set('meta[property="og:description"]', "content", s.seo.description);
  set('meta[property="og:site_name"]', "content", s.siteName);
  set('meta[property="og:url"]', "content", url);
  set('meta[property="og:image"]', "content", `${url}${s.seo.ogImage}`);
  set('meta[name="twitter:card"]', "content", "summary_large_image");
  set('meta[name="twitter:title"]', "content", s.seo.title);
  set('meta[name="twitter:site"]', "content", s.seo.twitter);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = `${url}${window.location.pathname}`;

  const robots = s.seo.noindex ? "noindex, nofollow" : "index, follow";
  set('meta[name="robots"]', "content", robots);

  if (s.primaryColor) document.documentElement.style.setProperty("--color-primary", s.primaryColor);
  else document.documentElement.style.removeProperty("--color-primary");
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [nav, setNav] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [s, n] = await Promise.all([api.settings.get(), api.content.nav()]);
      setSettings(s);
      setNav(n.filter((i) => i.visible));
    } catch {
      /* fall back to the seeded defaults already in state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    applyHeadMeta(settings);
  }, [settings]);

  const value = useMemo<SettingsState>(
    () => ({
      settings,
      nav,
      loading,
      save: async (patch) => {
        const next = await api.settings.save(patch);
        setSettings(next);
        return next;
      },
      saveNav: async (items) => {
        await api.content.saveNav(items);
        setNav(items.filter((i) => i.visible));
      },
      reload,
    }),
    [settings, nav, loading, reload],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}

/** Per-page <title> override (the description/OG defaults stay site-wide). */
export function usePageTitle(title?: string) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
