/**
 * Domain + transport types shared by the UI and every backend adapter.
 * Nothing here is browser-specific or provider-specific, so the same types
 * can be reused by a future React Native client.
 */

export type Role = "super_admin" | "admin" | "moderator" | "user";
export type UserStatus = "active" | "inactive" | "suspended";

/** Roles ordered by power. Higher index wins. */
export const ROLE_RANK: Record<Role, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  moderator: "Moderator",
  user: "User",
};

/** Fine-grained permissions. Roles are just bundles of these, so new roles are additive. */
export type Permission =
  | "users:read"
  | "users:write"
  | "users:delete"
  | "content:read"
  | "content:write"
  | "settings:read"
  | "settings:write"
  | "activity:read"
  | "analytics:read"
  | "audit:read"
  | "system:admin";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "users:read", "users:write", "users:delete",
    "content:read", "content:write",
    "settings:read", "settings:write",
    "activity:read", "analytics:read", "audit:read", "system:admin",
  ],
  admin: [
    "users:read", "users:write",
    "content:read", "content:write",
    "settings:read", "settings:write",
    "activity:read", "analytics:read", "audit:read",
  ],
  moderator: ["users:read", "content:read", "content:write", "activity:read", "analytics:read"],
  user: [],
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  avatarColor: string;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  /** Never expose password hashes/secrets through the API — admins get this flag only. */
  hasCredential: boolean;
};

export type ActivityType =
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset"
  | "page.view"
  | "cta.click"
  | "form.submit"
  | "profile.update"
  | "feature.use"
  | "account.status_change"
  | "account.role_change"
  | "account.deleted"
  | "admin.action";

export type ActivityEvent = {
  id: string;
  userId: string | null;
  type: ActivityType;
  path?: string;
  label?: string;
  meta?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  ip: string;
  createdAt: string;
};

export type ContentStatus = "published" | "draft";
export type ContentKind = "section" | "post" | "faq" | "announcement";

export type ContentItem = {
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  body: string;
  status: ContentStatus;
  /** Arbitrary, validated JSON payload (e.g. { features: [...] }). */
  data: Record<string, unknown>;
  sortOrder: number;
  updatedAt: string;
  updatedBy: string;
};

export type NavItem = { id: string; label: string; href: string; sortOrder: number; visible: boolean };

export type SiteSettings = {
  siteName: string;
  tagline: string;
  logoText: string;
  /** Accent override for the flat palette. Empty string = use token default. */
  primaryColor: string;
  contactEmail: string;
  social: { x?: string; github?: string; linkedin?: string };
  seo: { title: string; description: string; canonicalBase: string; ogImage: string; twitter: string; noindex: boolean };
  footer: { blurb: string; legal: string };
  /** deployment target, e.g. https://planar.example.com — drives canonical/OG/sitemap */
  siteUrl: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  features: { registrationsOpen: boolean; analyticsEnabled: boolean; announcements: boolean };
  notifications: { emailOnSignup: boolean; emailOnContact: boolean; digestWeekly: boolean };
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warning" | "danger";
  read: boolean;
  createdAt: string;
};

export type PageQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  role?: Role | "all";
  status?: UserStatus | "all";
  type?: ActivityType | "all";
  from?: string;
  to?: string;
  sort?: string;
};

export type Page<T> = { items: T[]; total: number; page: number; perPage: number; pageCount: number };

export type AnalyticsOverview = {
  totals: {
    users: number;
    activeToday: number;
    activeWeek: number;
    activeMonth: number;
    newThisWeek: number;
    newThisMonth: number;
    pageViews: number;
    returningUsers: number;
  };
  daily: { date: string; views: number; users: number; signups: number }[];
  monthly: { month: string; views: number; users: number }[];
  topPages: { path: string; views: number }[];
  featureUsage: { feature: string; count: number }[];
  retention: { cohort: string; size: number; retained: number }[];
};

export type SystemStatus = {
  api: "ok" | "degraded" | "down";
  database: "ok" | "degraded" | "down";
  latencyMs: number;
  version: string;
  uptimeHours: number;
  alerts: { level: "info" | "warning" | "danger"; message: string }[];
};

/** Every adapter implements exactly this. Swap providers without touching components. */
export interface Backend {
  ping(): Promise<SystemStatus>;

  auth: {
    login(email: string, password: string): Promise<{ user: User; token: string }>;
    register(input: { name: string; email: string; password: string }): Promise<{ user: User; token: string }>;
    me(): Promise<User | null>;
    logout(): Promise<void>;
    updateProfile(input: { name?: string; email?: string }): Promise<User>;
    changePassword(input: { current: string; next: string }): Promise<void>;
  };

  users: {
    list(query: PageQuery): Promise<Page<User>>;
    get(id: string): Promise<User>;
    update(id: string, patch: Partial<Pick<User, "role" | "status" | "name">>): Promise<User>;
    anonymize(id: string): Promise<void>;
  };

  content: {
    list(query: PageQuery & { kind?: ContentKind | "all" }): Promise<Page<ContentItem>>;
    getPublished(kind: ContentKind, slug: string): Promise<ContentItem | null>;
    save(item: Partial<ContentItem> & { id?: string }): Promise<ContentItem>;
    remove(id: string): Promise<void>;
    nav(): Promise<NavItem[]>;
    saveNav(items: NavItem[]): Promise<void>;
  };

  settings: {
    get(): Promise<SiteSettings>;
    save(patch: Partial<SiteSettings>): Promise<SiteSettings>;
  };

  activity: {
    track(event: { type: ActivityType; path?: string; label?: string; meta?: ActivityEvent["meta"] }): Promise<void>;
    list(query: PageQuery): Promise<Page<ActivityEvent>>;
  };

  audit: {
    list(query: PageQuery): Promise<Page<AuditLog>>;
  };

  analytics: {
    overview(): Promise<AnalyticsOverview>;
  };

  notifications: {
    list(): Promise<Notification[]>;
    markAllRead(): Promise<void>;
  };
}

/** Normalised error shape — UI never parses raw provider errors. */
export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export const err = (status: number, code: string, message: string, field?: string) =>
  new ApiError(status, code, message, field);
