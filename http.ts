import { tokenStore } from "./tokenStore";
import { ApiError } from "./types";

/**
 * Thin fetch wrapper used by the HTTP adapter.
 *
 * Responsibilities kept deliberately narrow: base URL resolution, credential
 * attachment, CSRF token echo, timeout, and normalising every failure into an
 * `ApiError` so components never see raw Response objects or stack traces.
 */

export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const API_MODE: "http" | "local" =
  API_URL.length > 0 ? "http" : ((import.meta.env.VITE_API_MODE as "http" | "local") ?? "local");

export { tokenStore } from "./tokenStore";

/** Read the CSRF cookie emitted by the backend (double-submit pattern). */
function csrfToken(): string | null {
  const m = /(?:^|;\s*)csrf=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** Mutating requests must send CSRF; reads skip it. */
  unsafe?: boolean;
};

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, query, signal } = opts;
  const url = new URL(`${API_URL}/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const csrf = csrfToken();
  if (csrf && method !== "GET") headers["X-CSRF-Token"] = csrf;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      credentials: "include",
      signal: signal ?? AbortSignal.timeout(15000),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Never leak network internals; give the UI a stable, actionable error.
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const data = (payload?.error ?? {}) as { code?: string; message?: string; field?: string };
    throw new ApiError(
      res.status,
      data.code ?? "request_failed",
      data.message ?? "Something went wrong. Please try again.",
      data.field,
    );
  }
  return (payload?.data ?? payload) as T;
}

/** Builds a query object, dropping empty values so URLs stay clean. */
export function toQuery(q: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(q).filter(([, v]) => v !== undefined && v !== "" && v !== "all") as [
      string,
      string | number,
    ][],
  );
}
