import type { AnalyticsOverview, Backend, Page, PageQuery, User } from "./types";
import { request, toQuery, tokenStore } from "./http";

/**
 * HTTP adapter — talks to the Express API in `server/`.
 * Same `Backend` contract as the embedded provider, so the UI is identical
 * whichever one is active. All authorisation happens server-side here.
 */
export function createHttpAdapter(currentUserId: () => string | null): Backend {
  // Kept as a hook point for the interface; the server derives identity from
  // the bearer token and deliberately ignores any client-supplied user id.
  void currentUserId;

  return {
    ping: () => request("/system/status"),

    auth: {
      login: (email, password) =>
        request<{ user: User; token: string }>("/auth/login", {
          method: "POST",
          body: { email, password },
          unsafe: true,
        }),
      register: (input) =>
        request<{ user: User; token: string }>("/auth/register", {
          method: "POST",
          body: input,
          unsafe: true,
        }),
      me: () => request<User | null>("/auth/me"),
      logout: () => request<void>("/auth/logout", { method: "POST" }),
      updateProfile: (input) => request<User>("/auth/me", { method: "PATCH", body: input }),
      changePassword: (input) =>
        request<void>("/auth/password", { method: "PATCH", body: input }),
    },

    users: {
      list: (q: PageQuery) => request<Page<User>>("/users", { query: toQuery(q) }),
      get: (id) => request(`/users/${encodeURIComponent(id)}`),
      update: (id, patch) => request(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
      anonymize: (id) => request(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },

    content: {
      list: (q) => request("/content", { query: toQuery(q) }),
      getPublished: (kind, slug) =>
        request(`/content/public/${kind}/${encodeURIComponent(slug)}`),
      save: (item) => (item.id
        ? request(`/content/${encodeURIComponent(item.id)}`, { method: "PATCH", body: item })
        : request("/content", { method: "POST", body: item })),
      remove: (id) => request(`/content/${encodeURIComponent(id)}`, { method: "DELETE" }),
      nav: () => request("/content/navigation"),
      saveNav: (items) => request("/content/navigation", { method: "PUT", body: { items } }),
    },

    settings: {
      get: () => request("/settings"),
      save: (patch) => request("/settings", { method: "PATCH", body: patch }),
    },

    activity: {
      track: (event) =>
        request<void>("/activity", {
          method: "POST",
          body: event,
          // Fire-and-forget tracking must never block or break the UI.
        }).catch(() => undefined),
      list: (q) => request("/activity", { query: toQuery(q) }),
    },

    audit: {
      list: (q) => request("/audit", { query: toQuery(q) }),
    },

    analytics: {
      overview: () => request<AnalyticsOverview>("/analytics/overview"),
    },

    notifications: {
      list: () => request("/notifications"),
      markAllRead: () => request("/notifications/read-all", { method: "POST" }),
    },
  };
}

/** Clears the local credential without a network round-trip (used on 401). */
export const dropSession = () => tokenStore.clear();
