import {
  type ActivityEvent,
  type AnalyticsOverview,
  type AuditLog,
  type Backend,
  type ContentItem,
  type ContentKind,
  type NavItem,
  type Notification,
  type Page,
  type PageQuery,
  type Permission,
  type Role,
  type SiteSettings,
  type SystemStatus,
  type User,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  err,
} from "./types";
import { API_MODE } from "./http";

/**
 * Embedded provider — implements the same `Backend` contract as the Express
 * server in `server/`. It exists so the product is fully usable before a
 * backend is deployed. It is a stand-in, NOT a security boundary: real
 * authorisation happens server-side. Switching providers is an env change.
 */

const KEY = "planar.db.v2";
const SESSION_KEY = "planar.session.v2";

export type StoredUser = User & { passwordHash: string; passwordSalt: string };

type DB = {
  users: StoredUser[];
  sessions: { token: string; userId: string; createdAt: string }[];
  activity: ActivityEvent[];
  audit: AuditLog[];
  content: ContentItem[];
  nav: NavItem[];
  settings: SiteSettings;
  notifications: Notification[];
};

/* ----------------------------- utilities ----------------------------- */

let seedCounter = 7;
/** Deterministic PRNG so demo metrics stay stable across reloads. */
const rnd = () => {
  seedCounter = (seedCounter * 1103515245 + 12345) % 2147483648;
  return seedCounter / 2147483648;
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const iso = (d: Date) => d.toISOString();
const day = (offset: number) => {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
};
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const AVATARS = ["bg-primary text-white", "bg-secondary text-gray-900", "bg-accent text-gray-900", "bg-foreground text-white"];

/** PBKDF2-SHA256, 210k iterations. Server equivalent: argon2id or bcrypt. */
async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  if (!globalThis.crypto?.subtle) {
    // Non-secure-context fallback; unreachable on HTTPS deployments.
    let h = 2166136261;
    const s = `${salt}:${password}`;
    for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
    return `fallback:${(h >>> 0).toString(16)}`;
  }
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 210000, hash: "SHA-256" },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const toPublic = (u: StoredUser): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  avatarColor: u.avatarColor,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
  loginCount: u.loginCount,
  hasCredential: u.hasCredential,
});

/* ------------------------------- seeding ------------------------------- */

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Planar",
  tagline: "Every project. One plane.",
  logoText: "planar",
  primaryColor: "",
  contactEmail: "hello@planar.app",
  social: { x: "https://x.com/planar", github: "https://github.com/planar", linkedin: "" },
  siteUrl: import.meta.env.VITE_SITE_URL ?? "https://planar.example.com",
  seo: {
    title: "Planar — Every project. One plane.",
    description:
      "Planar strips project management down to what matters: solid blocks of work, clear owners, and zero clutter.",
    canonicalBase: import.meta.env.VITE_SITE_URL ?? "https://planar.example.com",
    ogImage: "/og-cover.png",
    twitter: "@planar",
    noindex: false,
  },
  footer: {
    blurb: "Project planning with the clutter removed. Built for teams that ship.",
    legal: "© Planar Inc. All rights reserved.",
  },
  maintenanceMode: false,
  maintenanceMessage: "We're upgrading the database. Back within the hour.",
  features: { registrationsOpen: true, analyticsEnabled: true, announcements: true },
  notifications: { emailOnSignup: true, emailOnContact: false, digestWeekly: true },
};

function seedContent(): ContentItem[] {
  const now = iso(day(0));
  const mk = (
    kind: ContentKind,
    slug: string,
    title: string,
    data: Record<string, unknown>,
    sortOrder: number,
  ): ContentItem => ({
    id: uid("cnt"),
    kind,
    slug,
    title,
    body: "",
    status: "published",
    data,
    sortOrder,
    updatedAt: now,
    updatedBy: "Ada Okafor",
  });

  return [
    mk("section", "hero", "Hero", {
      eyebrow: "New · Timelines 2.0",
      titleTop: "Every project.",
      highlight: "One",
      titleBottom: "flat plane.",
      description:
        "Planar strips project management down to what matters: solid blocks of work, clear owners, and zero clutter.",
      primaryCta: "Start free",
      secondaryCta: "See how it works",
      proofs: ["Free forever plan", "No credit card", "Setup in 60s"],
    }, 1),
    mk("section", "features-heading", "Features heading", {
      eyebrow: "Features",
      title: "Everything you need. Nothing you don't.",
      description: "Five tools, one surface. Each feature is designed to disappear until you need it.",
    }, 2),
    mk("section", "testimonials", "Testimonial", {
      quote: "We replaced three tools and a weekly status meeting with one Planar board.",
      highlight: "Our roadmap finally fits on a single screen.",
      author: "Maya Rodriguez",
      role: "VP Product, Northwind",
      initials: "MR",
    }, 3),
    mk("section", "cta", "Closing CTA", {
      titleTop: "Flatten your",
      titleBottom: "backlog today.",
      description: "Join 12,000+ teams who plan on one plane. Free forever for small teams.",
    }, 4),
    mk("faq", "faq", "Frequently asked questions", {
      heading: "Questions, answered.",
      items: [
        { q: "Can I import my existing projects?", a: "Yes. Planar imports directly from Jira, Asana, Trello, Linear, Notion and CSV. Statuses, assignees and due dates map automatically — most teams are fully migrated in an afternoon." },
        { q: "Is there really a free plan?", a: "Forever. The Starter plan includes 3 boards and 5 members with no time limit and no credit card required. Upgrade only when you outgrow it." },
        { q: "How does yearly billing work?", a: "Pay annually and you get two months free — roughly 17% off the monthly price. Switch between monthly and yearly any time from settings." },
        { q: "Is my data secure?", a: "Planar is SOC 2 Type II certified, encrypts data at rest and in transit, and offers SSO, SCIM and audit logs on the Scale plan. EU data residency is available." },
        { q: "Can I cancel anytime?", a: "Absolutely. No contracts on monthly plans. If you cancel you keep access until the end of your billing period and can export everything." },
      ],
    }, 5),
    mk("announcement", "banner", "Announcement bar", {
      enabled: true,
      text: "Timelines 2.0 is live — dependencies now auto-reschedule.",
      href: "#features",
    }, 6),
  ];
}

async function seedUsers(): Promise<StoredUser[]> {
  const mk = async (name: string, email: string, role: Role, createdAt: Date): Promise<StoredUser> => {
    const salt = uid("s");
    const pw = email.startsWith("admin@") ? "Admin#2026" : email.startsWith("mod@") ? "Moderator#2026" : "Password#2026";
    return {
      id: uid("usr"),
      email,
      name,
      role,
      status: "active",
      avatarColor: AVATARS[seedCounter % AVATARS.length],
      createdAt: iso(createdAt),
      lastLoginAt: iso(day(Math.floor(rnd() * 5))),
      loginCount: 3 + Math.floor(rnd() * 60),
      hasCredential: true,
      passwordSalt: salt,
      passwordHash: await hashPassword(pw, salt),
    };
  };

  const first = ["Ada", "Maya", "Luis", "Sana", "Tom", "Ines", "Kofi", "Yuki", "Nora", "Omar", "Ruth", "Ivan"];
  const last = ["Okafor", "Rodriguez", "Ferreira", "Kapoor", "Bauer", "Costa", "Mensah", "Tanaka", "Lindqvist", "Haddad", "Okonkwo", "Petrov"];
  const roles: Role[] = ["user", "user", "user", "moderator", "user", "admin", "user", "user"];

  const out: StoredUser[] = [
    await mk("Ada Okafor", "admin@planar.app", "super_admin", day(220)),
    await mk("Sana Kapoor", "mod@planar.app", "moderator", day(180)),
    await mk("Tom Bauer", "user@planar.app", "user", day(30)),
  ];
  for (let i = 0; i < 44; i++) {
    const name = `${pick(first)} ${pick(last)}`;
    const status: StoredUser["status"] = rnd() > 0.9 ? (rnd() > 0.5 ? "suspended" : "inactive") : "active";
    const salt = uid("s");
    out.push({
      id: uid("usr"),
      email: `${name.toLowerCase().replace(/[^a-z]/g, ".")}@example.com`,
      name,
      role: i % 11 === 0 ? "admin" : pick(roles),
      status,
      avatarColor: AVATARS[i % AVATARS.length],
      createdAt: iso(day(2 + Math.floor(rnd() * 150))),
      lastLoginAt: rnd() > 0.15 ? iso(day(Math.floor(rnd() * 40))) : null,
      loginCount: Math.floor(rnd() * 90),
      hasCredential: true,
      passwordSalt: salt,
      passwordHash: await hashPassword("Password#2026", salt),
    });
  }
  return out;
}

/* ---------------------------- store handling ---------------------------- */

let db: DB | null = null;

async function initialise(): Promise<void> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) db = JSON.parse(raw) as DB;
  } catch {
    db = null;
  }
  if (db?.users?.length) return;

  seedCounter = 7;
  const users = await seedUsers();

  const paths = ["/", "/#features", "/#pricing", "/#faq", "/#how", "/login", "/register", "/account", "/#benefits"];
  const weights = [38, 14, 12, 8, 8, 7, 6, 5, 2];
  const pathPool: string[] = [];
  paths.forEach((p, i) => {
    for (let n = 0; n < weights[i]; n++) pathPool.push(p);
  });
  const featureNames = ["Board", "Timeline", "Automations", "Comments", "Capacity"];
  const activity: ActivityEvent[] = users.map((u, idx) => ({
    id: uid("act"),
    userId: u.id,
    type: "auth.register" as const,
    path: "/register",
    createdAt: u.createdAt,
    meta: { source: idx < 3 ? "seed" : "organic" },
  }));

  for (let d = 59; d >= 0; d--) {
    const base = day(d);
    const volume = Math.round(28 + 26 * Math.sin((59 - d) / 7) + rnd() * 22);
    const eligible = users.filter((u) => u.createdAt <= iso(base));
    const activeUsers = eligible.filter(() => rnd() > 0.35).slice(0, Math.max(3, Math.round(volume / 3)));

    for (let n = 0; n < volume; n++) {
      const ts = new Date(base);
      ts.setMinutes(Math.floor(rnd() * 600));
      const u = pick(activeUsers);
      activity.push({ id: uid("act"), userId: u?.id ?? null, type: "page.view", path: pick(pathPool), createdAt: iso(ts) });
    }
    activeUsers.slice(0, 8).forEach((u) => {
      const ts = new Date(base);
      ts.setMinutes(Math.floor(rnd() * 600));
      activity.push({ id: uid("act"), userId: u.id, type: "feature.use", label: pick(featureNames), createdAt: iso(ts) });
    });
    if (d % 4 === 0) {
      const ts = new Date(base);
      ts.setMinutes(Math.floor(rnd() * 600));
      activity.push({ id: uid("act"), userId: null, type: "auth.login_failed", path: "/login", createdAt: iso(ts), meta: { reason: "invalid_password" } });
    }
  }
  activity.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  db = {
    users,
    sessions: [],
    activity,
    audit: [
      {
        id: uid("aud"),
        actorId: users[0].id,
        actorName: users[0].name,
        action: "settings.update",
        targetType: "site_settings",
        targetId: "global",
        summary: "Updated SEO description",
        ip: "10.0.0.4",
        createdAt: iso(day(2)),
      },
      {
        id: uid("aud"),
        actorId: users[0].id,
        actorName: users[0].name,
        action: "user.role_change",
        targetType: "user",
        targetId: users[5].id,
        summary: `Granted role admin to ${users[5].name}`,
        ip: "10.0.0.4",
        createdAt: iso(day(6)),
      },
    ],
    content: seedContent(),
    nav: [
      { id: uid("nav"), label: "Features", href: "#features", sortOrder: 1, visible: true },
      { id: uid("nav"), label: "How it works", href: "#how", sortOrder: 2, visible: true },
      { id: uid("nav"), label: "Pricing", href: "#pricing", sortOrder: 3, visible: true },
      { id: uid("nav"), label: "FAQ", href: "#faq", sortOrder: 4, visible: true },
    ],
    settings: DEFAULT_SETTINGS,
    notifications: [
      { id: uid("ntf"), title: "5 failed logins in the last hour", body: "Brute-force protection triggered a temporary lockout for one IP address.", tone: "warning", read: false, createdAt: iso(day(0)) },
      { id: uid("ntf"), title: "Weekly digest ready", body: "Traffic up 12% week over week.", tone: "success", read: false, createdAt: iso(day(1)) },
    ],
  };
  persist();
}

function persist() {
  try {
    if (db) localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded → continue in memory */
  }
}

const ensure = async (): Promise<DB> => {
  if (!db) await initialise();
  return db as DB;
};

/* ------------------------------ pagination ------------------------------ */

function paginate<T>(items: T[], q: PageQuery): Page<T> {
  const page = Math.max(1, q.page ?? 1);
  const perPage = Math.min(100, Math.max(1, q.perPage ?? 20));
  const total = items.length;
  return {
    items: items.slice((page - 1) * perPage, page * perPage),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

const inRange = (value: string, q: PageQuery) => {
  if (q.from && value < q.from) return false;
  if (q.to && value > `${q.to}T23:59:59.999Z`) return false;
  return true;
};

/* ------------------------------- adapter ------------------------------- */

export function createLocalAdapter(currentUserId: () => string | null): Backend {
  const actor = async (): Promise<StoredUser | null> => {
    const d = await ensure();
    return d.users.find((u) => u.id === currentUserId()) ?? null;
  };

  /** Mirrors the server's `requirePermission` middleware. */
  const requirePermission = async (permission: Permission): Promise<StoredUser> => {
    const me = await actor();
    if (!me) throw err(401, "unauthenticated", "Please sign in to continue.");
    if (me.status !== "active") throw err(403, "forbidden", "This account can't perform that action.");
    if (!ROLE_PERMISSIONS[me.role].includes(permission)) {
      throw err(403, "forbidden", "You don't have permission to do that.");
    }
    return me;
  };

  const logAudit = async (
    a: { id: string; name: string },
    action: string,
    targetType: string,
    targetId: string,
    summary: string,
  ) => {
    const d = await ensure();
    d.audit.unshift({
      id: uid("aud"),
      actorId: a.id,
      actorName: a.name,
      action,
      targetType,
      targetId,
      summary,
      ip: "self",
      createdAt: iso(new Date()),
    });
  };

  const push = (d: DB, event: Omit<ActivityEvent, "id" | "createdAt">) => {
    d.activity.push({ ...event, id: uid("act"), createdAt: iso(new Date()) });
  };

  return {
    async ping(): Promise<SystemStatus> {
      const started = performance.now();
      await ensure();
      return {
        api: "ok",
        database: "ok",
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        version: import.meta.env.VITE_APP_VERSION ?? "1.0.0",
        uptimeHours: 720,
        alerts: API_MODE === "local"
          ? [{ level: "warning", message: "Running on the embedded provider. Set VITE_API_URL to use the real API." }]
          : [],
      };
    },

    auth: {
      async login(email, password) {
        const d = await ensure();
        const user = d.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
        // Records the attempt and returns the error to throw. The uniform
        // message below never reveals whether the account exists.
        const reject = (reason: "invalid_password" | "unknown_email") => {
          push(d, { userId: user?.id ?? null, type: "auth.login_failed", path: "/login", meta: { reason } });
          persist();
          return err(401, "invalid_credentials", "Email or password is incorrect.");
        };

        if (!user) throw reject("unknown_email");
        if (user.status === "suspended") throw err(403, "suspended", "This account is suspended. Contact support.");
        if (user.status === "inactive") throw err(403, "inactive", "This account is deactivated. Contact support.");

        if ((await hashPassword(password, user.passwordSalt)) !== user.passwordHash) throw reject("invalid_password");

        user.lastLoginAt = iso(new Date());
        user.loginCount += 1;
        const token = uid("tok");
        d.sessions.push({ token, userId: user.id, createdAt: iso(new Date()) });
        push(d, { userId: user.id, type: "auth.login", path: "/login" });
        persist();
        return { user: toPublic(user), token };
      },

      async register(input) {
        const d = await ensure();
        if (!d.settings.features.registrationsOpen) {
          throw err(403, "registrations_closed", "Registrations are currently closed.");
        }
        const email = input.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw err(422, "validation", "Enter a valid email address.", "email");
        if (input.password.length < 10) throw err(422, "validation", "Use at least 10 characters.", "password");
        if (input.name.length > 80) throw err(422, "validation", "Name is too long.", "name");
        if (d.users.some((u) => u.email.toLowerCase() === email)) {
          throw err(409, "email_taken", "That email is already registered.", "email");
        }
        const salt = uid("s");
        const user: StoredUser = {
          id: uid("usr"),
          email,
          name: input.name.trim() || email.split("@")[0],
          role: "user",
          status: "active",
          avatarColor: AVATARS[d.users.length % AVATARS.length],
          createdAt: iso(new Date()),
          lastLoginAt: iso(new Date()),
          loginCount: 1,
          hasCredential: true,
          passwordSalt: salt,
          passwordHash: await hashPassword(input.password, salt),
        };
        d.users.push(user);
        const token = uid("tok");
        d.sessions.push({ token, userId: user.id, createdAt: iso(new Date()) });
        push(d, { userId: user.id, type: "auth.register", path: "/register", meta: { source: "web" } });
        persist();
        return { user: toPublic(user), token };
      },

      async me() {
        const d = await ensure();
        const id = currentUserId();
        if (!id) return null;
        const u = d.users.find((x) => x.id === id);
        return u ? toPublic(u) : null;
      },

      async logout() {
        const d = await ensure();
        const id = currentUserId();
        if (!id) return;
        d.sessions = d.sessions.filter((s) => s.userId !== id);
        push(d, { userId: id, type: "auth.logout", path: "/account" });
        persist();
      },

      async updateProfile(input) {
        const me = await actor();
        if (!me) throw err(401, "unauthenticated", "Please sign in to continue.");
        const d = await ensure();
        if (input.email) {
          const email = input.email.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw err(422, "validation", "Enter a valid email address.", "email");
          if (d.users.some((u) => u.email === email && u.id !== me.id)) {
            throw err(409, "email_taken", "That email is already registered.", "email");
          }
          me.email = email;
        }
        if (input.name !== undefined) me.name = input.name.trim().slice(0, 80) || me.name;
        push(d, { userId: me.id, type: "profile.update", path: "/account" });
        persist();
        return toPublic(me);
      },

      async changePassword({ current, next }) {
        const me = await actor();
        if (!me) throw err(401, "unauthenticated", "Please sign in to continue.");
        if (next.length < 10) throw err(422, "validation", "Use at least 10 characters.", "next");
        if ((await hashPassword(current, me.passwordSalt)) !== me.passwordHash) {
          throw err(400, "invalid_credentials", "Your current password is incorrect.", "current");
        }
        me.passwordSalt = uid("s");
        me.passwordHash = await hashPassword(next, me.passwordSalt);
        await logAudit(me, "user.password_change", "user", me.id, "Changed own password");
        persist();
      },
    },

    users: {
      async list(q) {
        const me = await requirePermission("users:read");
        const d = await ensure();
        let rows = [...d.users];
        // Moderators never see super admins.
        if (ROLE_RANK[me.role] < ROLE_RANK.super_admin) {
          rows = rows.filter((u) => ROLE_RANK[u.role] < ROLE_RANK.super_admin);
        }
        const s = q.search?.trim().toLowerCase();
        if (s) rows = rows.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
        if (q.role && q.role !== "all") rows = rows.filter((u) => u.role === q.role);
        if (q.status && q.status !== "all") rows = rows.filter((u) => u.status === q.status);
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return paginate(rows.map(toPublic), q);
      },

      async get(id) {
        await requirePermission("users:read");
        const d = await ensure();
        const u = d.users.find((x) => x.id === id);
        if (!u) throw err(404, "not_found", "That user no longer exists.");
        return toPublic(u);
      },

      async update(id, patch) {
        const me = await requirePermission("users:write");
        const d = await ensure();
        const target = d.users.find((u) => u.id === id);
        if (!target) throw err(404, "not_found", "That user no longer exists.");
        if (me.id !== target.id && ROLE_RANK[patch.role ?? target.role] >= ROLE_RANK[me.role]) {
          throw err(403, "forbidden", "You can't modify an account at or above your own level.");
        }
        if (patch.role && patch.role !== target.role) {
          await logAudit(me, "user.role_change", "user", id, `Changed role ${target.role} → ${patch.role} for ${target.name}`);
          target.role = patch.role;
          push(d, { userId: id, type: "account.role_change", meta: { by: me.id, role: patch.role } });
        }
        if (patch.status && patch.status !== target.status) {
          await logAudit(me, "user.status_change", "user", id, `Set status ${target.status} → ${patch.status} for ${target.name}`);
          target.status = patch.status;
          if (patch.status !== "active") d.sessions = d.sessions.filter((s) => s.userId !== id);
          push(d, { userId: id, type: "account.status_change", meta: { by: me.id, status: patch.status } });
        }
        if (patch.name) target.name = patch.name.trim().slice(0, 80);
        persist();
        return toPublic(target);
      },

      /** GDPR-friendly: scrub identity, keep aggregate metrics intact. */
      async anonymize(id) {
        const me = await requirePermission("users:delete");
        const d = await ensure();
        const target = d.users.find((u) => u.id === id);
        if (!target) throw err(404, "not_found", "That user no longer exists.");
        if (target.role === "super_admin") throw err(403, "forbidden", "A super admin account can't be anonymised.");
        await logAudit(me, "user.anonymize", "user", id, `Anonymised account ${target.email}`);
        d.activity = d.activity.map((e) => (e.userId === id ? { ...e, userId: null } : e));
        d.sessions = d.sessions.filter((s) => s.userId !== id);
        target.name = "Removed user";
        target.email = `removed.${target.id}@invalid.local`;
        target.status = "inactive";
        target.hasCredential = false;
        target.lastLoginAt = null;
        push(d, { userId: null, type: "account.deleted", meta: { anonymised: true } });
        persist();
      },
    },

    content: {
      async list(q) {
        await requirePermission("content:read");
        const d = await ensure();
        let rows = [...d.content].sort((a, b) => a.sortOrder - b.sortOrder);
        if (q.kind && q.kind !== "all") rows = rows.filter((c) => c.kind === q.kind);
        const s = q.search?.trim().toLowerCase();
        if (s) rows = rows.filter((c) => c.title.toLowerCase().includes(s) || c.slug.includes(s));
        return paginate(rows, q);
      },

      async getPublished(kind, slug) {
        const d = await ensure();
        return d.content.find((x) => x.kind === kind && x.slug === slug && x.status === "published") ?? null;
      },

      async save(item) {
        const me = await requirePermission("content:write");
        const d = await ensure();
        if (!item.id) {
          const created: ContentItem = {
            id: uid("cnt"),
            kind: item.kind ?? "post",
            slug: (item.slug ?? item.title ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
            title: item.title ?? "Untitled",
            body: item.body ?? "",
            status: item.status ?? "draft",
            data: item.data ?? {},
            sortOrder: item.sortOrder ?? d.content.length + 1,
            updatedAt: iso(new Date()),
            updatedBy: me.name,
          };
          d.content.push(created);
          await logAudit(me, "content.create", created.kind, created.id, `Created "${created.title}"`);
          persist();
          return created;
        }
        const existing = d.content.find((c) => c.id === item.id);
        if (!existing) throw err(404, "not_found", "That content item no longer exists.");
        const { id: _omit, ...rest } = item;
        Object.assign(existing, rest, { updatedAt: iso(new Date()), updatedBy: me.name });
        await logAudit(me, "content.update", existing.kind, existing.id, `Updated "${existing.title}"`);
        persist();
        return existing;
      },

      async remove(id) {
        const me = await requirePermission("content:write");
        const d = await ensure();
        const c = d.content.find((x) => x.id === id);
        if (!c) throw err(404, "not_found", "That content item no longer exists.");
        d.content = d.content.filter((x) => x.id !== id);
        await logAudit(me, "content.delete", c.kind, id, `Deleted "${c.title}"`);
        persist();
      },

      async nav() {
        const d = await ensure();
        return [...d.nav].sort((a, b) => a.sortOrder - b.sortOrder);
      },

      async saveNav(items) {
        const me = await requirePermission("settings:write");
        const d = await ensure();
        d.nav = items.map((i, idx) => ({ ...i, sortOrder: idx + 1 }));
        await logAudit(me, "navigation.update", "navigation", "global", `Updated ${items.length} navigation items`);
        persist();
      },
    },

    settings: {
      async get() {
        const d = await ensure();
        return d.settings;
      },
      async save(patch) {
        const me = await requirePermission("settings:write");
        const d = await ensure();
        d.settings = { ...d.settings, ...patch };
        await logAudit(me, "settings.update", "site_settings", "global", `Updated ${Object.keys(patch).join(", ") || "settings"}`);
        persist();
        return d.settings;
      },
    },

    activity: {
      async track(event) {
        const d = await ensure();
        if (event.type === "page.view" && !d.settings.features.analyticsEnabled) return;
        d.activity.push({
          ...event,
          id: uid("act"),
          userId: currentUserId(),
          createdAt: iso(new Date()),
        });
        if (d.activity.length > 40000) d.activity = d.activity.slice(-30000);
        persist();
      },

      async list(q) {
        await requirePermission("activity:read");
        const d = await ensure();
        let rows = [...d.activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (q.type && q.type !== "all") rows = rows.filter((e) => e.type === q.type);
        if (q.from || q.to) rows = rows.filter((e) => inRange(e.createdAt, q));
        if (q.search?.trim()) {
          const term = q.search.trim().toLowerCase();
          const ids = new Set(
            d.users
              .filter((u) => u.email.toLowerCase().includes(term) || u.name.toLowerCase().includes(term))
              .map((u) => u.id),
          );
          rows = rows.filter(
            (e) =>
              (e.userId !== null && ids.has(e.userId)) ||
              e.path?.toLowerCase().includes(term) === true ||
              e.label?.toLowerCase().includes(term) === true,
          );
        }
        return paginate(rows, { ...q, perPage: q.perPage ?? 25 });
      },
    },

    audit: {
      async list(q) {
        await requirePermission("audit:read");
        const d = await ensure();
        let rows = [...d.audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const s = q.search?.trim().toLowerCase();
        if (s) rows = rows.filter((a) => a.summary.toLowerCase().includes(s) || a.actorName.toLowerCase().includes(s) || a.action.includes(s));
        if (q.from || q.to) rows = rows.filter((a) => inRange(a.createdAt, q));
        return paginate(rows, { ...q, perPage: q.perPage ?? 25 });
      },
    },

    analytics: {
      async overview(): Promise<AnalyticsOverview> {
        await requirePermission("analytics:read");
        const d = await ensure();
        const now = new Date();
        const today = dateKey(now);
        const weekAgo = dateKey(new Date(now.getTime() - 6 * 864e5));
        const monthAgo = dateKey(new Date(now.getTime() - 29 * 864e5));

        const views = d.activity.filter((e) => e.type === "page.view");
        const byDay = new Map<string, { views: number; users: Set<string>; signups: number }>();
        for (let i = 29; i >= 0; i--) byDay.set(dateKey(day(i)), { views: 0, users: new Set(), signups: 0 });
        views.forEach((e) => {
          const bucket = byDay.get(e.createdAt.slice(0, 10));
          if (!bucket) return;
          bucket.views += 1;
          if (e.userId) bucket.users.add(e.userId);
        });
        d.activity.filter((e) => e.type === "auth.register").forEach((e) => {
          const bucket = byDay.get(e.createdAt.slice(0, 10));
          if (bucket) bucket.signups += 1;
        });

        const pageMap = new Map<string, number>();
        views.forEach((e) => pageMap.set(e.path ?? "/", (pageMap.get(e.path ?? "/") ?? 0) + 1));
        const featureMap = new Map<string, number>();
        d.activity.filter((e) => e.type === "feature.use").forEach((e) => {
          if (e.label) featureMap.set(e.label, (featureMap.get(e.label) ?? 0) + 1);
        });

        const activeSince = (from: string, to?: string) =>
          new Set(
            d.activity
              .filter((e) => e.userId && e.createdAt.slice(0, 10) >= from && (!to || e.createdAt.slice(0, 10) <= to))
              .map((e) => e.userId),
          ).size;

        const cohorts = new Map<string, string[]>();
        d.users.forEach((u) => {
          const m = u.createdAt.slice(0, 7);
          cohorts.set(m, [...(cohorts.get(m) ?? []), u.id]);
        });
        const retention = [...cohorts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-5)
          .map(([cohort, ids]) => ({
            cohort,
            size: ids.length,
            retained: ids.filter((id) => d.activity.some((e) => e.userId === id && e.createdAt.slice(0, 7) > cohort)).length,
          }));

        const newThisMonth = d.users.filter((u) => u.createdAt.slice(0, 10) >= monthAgo).length;

        return {
          totals: {
            users: d.users.length,
            activeToday: activeSince(today, today),
            activeWeek: activeSince(weekAgo),
            activeMonth: activeSince(monthAgo),
            newThisWeek: d.users.filter((u) => u.createdAt.slice(0, 10) >= weekAgo).length,
            newThisMonth,
            pageViews: views.filter((e) => e.createdAt.slice(0, 10) >= monthAgo).length,
            returningUsers: Math.max(0, activeSince(monthAgo) - newThisMonth),
          },
          daily: [...byDay.entries()].map(([date, v]) => ({ date, views: v.views, users: v.users.size, signups: v.signups })),
          monthly: [...cohorts.keys()].sort().slice(-6).map((month) => ({
            month,
            views: views.filter((e) => e.createdAt.slice(0, 7) === month).length,
            users: cohorts.get(month)?.length ?? 0,
          })),
          topPages: [...pageMap.entries()]
            .map(([path, count]) => ({ path, views: count }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 8),
          featureUsage: [...featureMap.entries()]
            .map(([feature, count]) => ({ feature, count }))
            .sort((a, b) => b.count - a.count),
          retention,
        };
      },
    },

    notifications: {
      async list() {
        const d = await ensure();
        return [...d.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async markAllRead() {
        const d = await ensure();
        d.notifications = d.notifications.map((n) => ({ ...n, read: true }));
        persist();
      },
    },
  };
}

export { SESSION_KEY };
