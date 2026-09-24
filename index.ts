import { API_MODE, tokenStore } from "./http";
import { createHttpAdapter } from "./httpAdapter";
import { createLocalAdapter } from "./localProvider";
import { session } from "./session";
import type { Backend } from "./types";

/**
 * The single place where a backend provider is chosen.
 *
 *   VITE_API_URL set  → real Express API in `server/`
 *   otherwise         → embedded provider (works immediately, no server)
 *
 * Components only ever import `api`, so changing providers touches nothing else.
 */
const resolveUser = () => session.userId;

const backend: Backend =
  API_MODE === "http" ? createHttpAdapter(resolveUser) : createLocalAdapter(resolveUser);

export { backend as api, tokenStore };
export { API_MODE, API_URL } from "./http";
export type { Backend };
