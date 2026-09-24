/**
 * Session storage — the only place credentials touch the browser.
 *
 * Web keeps the token here; a native client would use its own secure store and
 * re-implement just this module. Access tokens are short-lived; refresh tokens
 * are httpOnly cookies set by the server (see server/routes/auth.ts).
 */
const TOKEN_KEY = "planar.token";
const USER_KEY = "planar.uid";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage blocked — session lives in memory only */
  }
};

export const session = {
  get token() {
    return read(TOKEN_KEY);
  },
  get userId() {
    return read(USER_KEY);
  },
  set(token: string, userId: string) {
    write(TOKEN_KEY, token);
    write(USER_KEY, userId);
  },
  clear() {
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
  },
};
