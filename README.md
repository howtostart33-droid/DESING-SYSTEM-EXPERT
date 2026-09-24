# DESING-SYSTEM-EXPERT

A production-ready React application: flat-design marketing site, user accounts, and a
secure admin console for managing users, content, settings, activity and analytics.

**Stack:** React 19 · Vite 7 · TypeScript · Tailwind CSS v4 · Express · PostgreSQL

---

## A. Architecture

```
Visitor
  ↓ HTTPS
Domain (free subdomain or your own)
  ↓
Static frontend  ── Vite SPA on Vercel / Netlify / Cloudflare Pages
  ↓ fetch (JSON, Bearer token)
Secure API       ── Express on Render / Railway / Fly.io
  ↓ parameterised SQL
PostgreSQL       ── Neon / Supabase (free tier)
```

Two deliberate decisions:

1. **The frontend never talks to the database.** Every privileged operation goes
   through the API, where authorisation is checked server-side.
2. **The frontend depends on an interface, not an implementation.**
   `src/api/index.ts` chooses a provider from `VITE_API_URL`:

   | Setting | Behaviour |
   |---|---|
   | `VITE_API_URL` empty | Embedded provider (`src/api/localProvider.ts`) — fully working app, no server needed |
   | `VITE_API_URL=https://api…` | HTTP adapter (`src/api/httpAdapter.ts`) → Express + PostgreSQL |

   Both implement the same `Backend` interface in `src/api/types.ts`. Changing
   provider touches **zero** components. A future React Native app reuses the
   HTTP adapter contract and the same endpoints.

---

## B. File structure

```
.
├── index.html                    # HTML shell: SEO, Open Graph, favicon
├── public/
│   ├── og-cover.png              # social share image
│   ├── robots.txt                # /admin, /account excluded
│   └── sitemap.xml
├── src/
│   ├── api/                      # ── backend abstraction ──
│   │   ├── types.ts              # domain types + `Backend` interface
│   │   ├── http.ts               # fetch wrapper: token, CSRF, error normalisation
│   │   ├── httpAdapter.ts        # → real Express API
│   │   ├── localProvider.ts      # → embedded provider (browser storage)
│   │   ├── session.ts            # the only place credentials touch the browser
│   │   └── index.ts              # picks the provider from env
│   ├── app/
│   │   ├── router.tsx            # routes, code splitting, guards, page-view tracking
│   │   ├── AuthContext.tsx       # session + `can(permission)`
│   │   ├── SettingsContext.tsx   # CMS settings → <head>, palette, maintenance
│   │   └── ToastContext.tsx
│   ├── components/
│   │   ├── ui/                   # Button, Card, Badge, Input, Modal, form fields…
│   │   ├── data.tsx              # DataTable (table ⇄ mobile cards), pagination
│   │   ├── charts/               # flat SVG charts, no chart library
│   │   ├── layout/index.tsx      # public shell + admin shell (responsive nav)
│   │   └── sections/             # Hero, Features, FAQ, CTA… all accept `content`
│   ├── hooks/                    # useAsync, useCountUp
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── AuthPages.tsx         # login + register
│   │   ├── AccountPage.tsx
│   │   ├── Errors.tsx            # 404 / 500 / 403 / maintenance
│   │   └── admin/                # Dashboard, Users, Content, Activity, Analytics, Settings
│   ├── data/content.ts           # shipped copy — also the CMS fallback
│   └── index.css                 # design tokens (@theme)
├── server/                       # ── backend (own package) ──
│   ├── src/
│   │   ├── config.ts             # zod-validated env; refuses to boot if wrong
│   │   ├── db.ts                 # pg pool, parameterised `query`, transactions
│   │   ├── middleware.ts         # auth, permissions, argon2, audit, error handler
│   │   ├── app.ts                # helmet, CORS, rate limits, routes
│   │   ├── index.ts              # bootstrap + first-admin seeding
│   │   └── routes/               # auth · users · content · site
│   └── .env.example
├── database/
│   └── schema.sql                # tables, indexes, constraints, seed data, views
├── docs/DEPLOYMENT.md            # step-by-step deploy + domain guide
└── .env.example                  # frontend variables
```

---

## C. Database

PostgreSQL — see `database/schema.sql`. Every table uses UUID or BIGSERIAL keys,
`created_at`/`updated_at` timestamps, and CHECK constraints where a value is an enum.

| Table | Purpose |
|---|---|
| `roles`, `permissions`, `role_permissions` | Normalised RBAC; add a role by inserting rows, not by shipping code |
| `users` | Account + `password_hash` (argon2id) + `role_code` + `status` |
| `user_sessions` | SHA-256 **hash** of each token, IP, user agent, `expires_at`, `revoked_at` |
| `user_activity` | Append-only event log (type, path, label, `meta` JSONB, IP) |
| `audit_logs` | Who changed what, when, from where |
| `site_settings` | Key → JSONB, so new settings need no migration |
| `content` | Versionable CMS slots, `UNIQUE (kind, slug)` |
| `navigation_items` | Ordered public nav links |
| `notifications` | Per-user or broadcast notices |
| `daily_metrics` (view) | Pre-aggregated views/signups per day for fast analytics |

Indexes cover every filter used by the admin screens (status, role, created_at,
last_login_at, activity type/date/user).

---

## D. API

Base URL `https://<api-host>/api`. All responses are `{ "data": … }` or
`{ "error": { "code", "message", "field?" } }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness probe |
| POST | `/auth/register` | public (rate limited) | Create account |
| POST | `/auth/login` | public (rate limited) | Sign in, returns token |
| GET | `/auth/me` | user | Current profile |
| PATCH | `/auth/me` | user | Update name/email |
| PATCH | `/auth/password` | user | Change password, revokes all sessions |
| POST | `/auth/logout` | user | Revoke current session |
| GET | `/users` | `users:read` | Paginated list, search + role/status filters |
| PATCH | `/users/:id` | `users:write` | Change role / status / name |
| DELETE | `/users/:id` | `users:delete` | Anonymise (GDPR-safe) |
| GET | `/content/public/:kind/:slug` | — | Published content (edge-cacheable) |
| GET/PUT | `/content/navigation` | public / `settings:write` | Nav links |
| GET/POST/PATCH/DELETE | `/content` | `content:read` / `content:write` | CMS CRUD |
| GET/PATCH | `/settings` | public read / `settings:write` | Site configuration |
| POST | `/activity` | optional | Track an event (user id taken from token only) |
| GET | `/activity` | `activity:read` | Filtered, paginated log |
| GET | `/audit` | `audit:read` | Admin action trail |
| GET | `/analytics/overview` | `analytics:read` | Aggregated metrics |
| GET | `/notifications` · `/notifications/read-all` | user | Notices |
| GET | `/system/status` | `analytics:read` | API/DB health + alerts (any staff role) |

---

## E. Authentication & authorisation

- **Hashing:** argon2id (memory-hard) on the server. Passwords are never logged,
  returned, or visible to administrators — the admin UI says so explicitly.
- **Tokens:** JWT (12 h default) issued at login, returned to the client and sent
  as `Authorization: Bearer`. Only the SHA-256 of each token is stored, so a
  database leak cannot be replayed.
- **Sessions are revocable:** changing a password, suspending, deactivating or
  anonymising an account revokes every active session immediately.
- **Two layers of authorisation:**
  1. UI — `useAuth().can("users:write")` hides controls ( UX only).
  2. Server — `requirePermission("users:write")` middleware (authoritative).
  3. Plus `assertCanModify`, which stops admins from touching accounts at or
     above their own level.
- **Login failures are indistinguishable** for unknown emails and wrong
  passwords, and a dummy hash is verified to keep timing even.
- **Mobile-ready:** tokens are bearer-based, so an iOS/Android client uses the
  identical endpoints with its own secure storage.

**Roles:** `super_admin` → `admin` → `moderator` → `user`. Roles are bundles of
permissions in `database/schema.sql` and `src/api/types.ts`; adding a role means
inserting rows, not rewriting logic.

---

## F. Admin panel (`/admin`)

Reachable only to signed-in users with the relevant permission; `noindex` always.

- **Overview** — total users, active today/week/month, 30-day page views,
  returning users, 30-day traffic chart, system status (API + DB, latency,
  version, uptime), newest accounts, top pages, live activity feed, alerts.
- **Users** — search by name/email, filter by role and status, paginated table
  (stacked cards on phones), per-user panel to activate, deactivate, suspend,
  restore, change role, and (super admin) anonymise. Shows registration date,
  last login, sign-in count. Explains that passwords are hashed and not visible.
- **Content** — edit every public copy slot (hero, features heading, testimonial,
  CTA, FAQ, announcement banner) with friendly fields, or raw JSON for list
  content. Save as draft or publish. Publishing updates the live site on the
  next fetch.
- **Settings** — five sections: identity & contact (site name, tagline, logo
  text, primary colour, emails, social links, footer), SEO & sharing (title,
  description, canonical base, OG image, Twitter handle, noindex) plus
  maintenance mode and its message, feature toggles (registrations, analytics
  collection, announcement bar), navigation editor (reorder, relabel, hide), and
  notification preferences.
- **Activity** — two tabs: user activity (search, event-type filter, date range,
  pagination) and the admin audit trail.
- **Analytics** — DAU/WAU/MAU, signups, traffic trend with fortnight-over-fortnight
  delta, page views, most-visited pages, feature usage, signup cohort retention,
  registrations by month.

Nothing here is hardcoded: change the site name, colours, nav, SEO or feature
flags in Settings and the public site reflects it.

---

## G. Activity tracking

Stored in `user_activity`: `id`, `user_id` (nullable), `type`, `path`, `label`,
`meta` JSONB, `ip`, `created_at`.

**Tracked events:** `auth.register`, `auth.login`, `auth.login_failed`,
`auth.logout`, `auth.password_reset`, `page.view`, `cta.click`, `form.submit`,
`profile.update`, `feature.use`, `account.status_change`, `account.role_change`,
`account.deleted`, `admin.action`.

**Deliberately not collected:** passwords, form free-text, payment data,
fingerprints, third-party ad identifiers, precise location.

**Privacy controls:** page-view tracking stops entirely when the analytics
feature toggle is off; anonymising a user nulls their `user_id` on historical
events so aggregates survive but the person can't be re-identified; admins get a
searchable, filterable, paginated log with date ranges.

---

## H. Security

| Protection | Where |
|---|---|
| Password hashing (argon2id) | `server/src/middleware.ts` |
| Parameterised SQL only | `server/src/db.ts`, all routes |
| zod validation on every body/query | every route file |
| RBAC middleware (`requirePermission`, `assertCanModify`) | `server/src/middleware.ts` |
| Session revocation on privilege change | `user.routes.ts`, `auth.routes.ts` |
| Brute-force limit (8 auth attempts / 15 min, IP) | `server/src/app.ts` |
| Global request limit | `server/src/app.ts` |
| CSRF double-submit for cookie clients | `server/src/app.ts` |
| Strict CSP, HSTS, `frame-ancestors: none`, no-sniff | `helmet` in `app.ts` |
| CORS allow-list (no wildcards, credentials honoured) | `app.ts` |
| 64 kB JSON body cap | `app.ts` |
| Uniform errors; stack traces never returned | `errorHandler` |
| Secrets only in server env (never `VITE_*`) | `.env.example`, `server/.env.example` |
| Input sanitisation, output length caps | schema in each route |
| Uploads | none today — add MIME + size validation before enabling |

---

## I. Deployment

Full walkthrough: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Short version:

1. Create a free PostgreSQL database (Neon or Supabase) and run
   `psql "$DATABASE_URL" -f database/schema.sql`.
2. Deploy `server/` to Render/Railway, setting the variables from
   `server/.env.example` (including a 48-byte `JWT_SECRET` and
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`).
3. Deploy the frontend to Vercel/Netlify/Cloudflare Pages with
   `VITE_API_URL=https://<your-api-host>` and `VITE_SITE_URL=https://<your-domain>`.
4. Sign in with the seeded admin, then rotate that password.
5. Connect the domain and update `CORS_ORIGINS` + `SITE_URL`.

---

## J. Domain options

Honest cost breakdown — **the domain is the only part that realistically costs money**:

| Option | Cost | Notes |
|---|---|---|
| Platform subdomain (`project.vercel.app`, `site.pages.dev`) | **Free** | HTTPS automatic, zero config. Fine for testing; not memorable. |
| Free third-party subdomain (`planar.js.org`, `planar.netlify.app`) | **Free** | `js.org` issues free subdomains to open-source projects after review. |
| **Your own domain** (`.com` ~$10–15/yr, `.app` ~$12–20/yr) | Paid | The professional option. HTTPS is still free via Let's Encrypt on every host below. |

Nothing here is free that isn't — a custom `.com` requires an annual registrar
fee, and "free domain" offers are usually bundled with paid hosting.

Because the domain lives in `VITE_SITE_URL`, `SITE_URL`, `CORS_ORIGINS` and
`site_settings.seo.canonicalBase` — never in components — switching is a config
change plus a redeploy.

---

## K. Future development

- **Add a page:** create `src/pages/FooPage.tsx`, add a lazy route in
  `src/app/router.tsx`. That's it.
- **Add content the admin can edit:** insert a `content` row (see
  `database/schema.sql`), then read it with `api.content.getPublished(kind, slug)`
  and pass it to a section's `content` prop. Sections already accept optional
  content with static fallbacks.
- **Add a feature toggle:** add the key to `features` in `site_settings`, the
  `SiteSettings` type, and a `Toggle` in `SettingsPage`.
- **Add a role:** `INSERT INTO roles` + `role_permissions`, then extend
  `ROLE_PERMISSIONS` in `server/src/middleware.ts` and `src/api/types.ts`.
- **Add an endpoint:** create `server/src/routes/foo.routes.ts`, validate with
  zod, guard with `requirePermission`, mount in `app.ts`, add a method to the
  `Backend` interface and both adapters.
- **Add a mobile app:** reuse `server/` as-is. Implement `src/api/session.ts`
  against Keychain/Keystore and call the same endpoints.

Run `npm run build` for the frontend and `npm run build && npm start` inside
`server/` for the API. `npm run typecheck` covers both.
