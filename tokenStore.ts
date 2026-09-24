import { session } from "./session";

export const tokenStore = {
  get: () => session.token,
  set: (t: string) => session.set(t, session.userId ?? ""),
  clear: () => session.clear(),
};
