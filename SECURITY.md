# Security

Seal Team BD holds real prospect PII and is the C&W San Diego team's shared
pipeline. This document describes the security model and how to report a
vulnerability.

## Trust boundaries

- **Production data lives only in C&W's Supabase.** Real prospect PII never
  leaves C&W-owned infrastructure. Dev/staging runs against synthetic/seed data.
- **The database is the authority.** Authorization is enforced in Postgres via
  Row-Level Security, not in application code alone. A bug in a route cannot widen
  access beyond what RLS permits for that session.
- **The browser is never trusted.** Service-role keys and all third-party API keys
  are server-only. Anything `NEXT_PUBLIC_` is assumed public.

## Authentication & identity

- **Supabase Auth** (email/password + magic link). C&W SSO (SAML/OIDC) is a later
  configuration, not a code change.
- A Postgres trigger (`handle_new_user`) auto-creates a `profiles` row for every
  new auth user. **New accounts start `approved = FALSE` and see nothing.**
- Roles are an enum (`app_role`): `admin` and `broker`.
- Server code always validates the token with `supabase.auth.getUser()` — never
  `getSession()`, which is unverified.

## Row-Level Security (the authorization model)

RLS is defined in `supabase/rls.sql` and applied after `supabase/schema.sql`.

- **Shared-team workspace.** Every *approved* member reads and writes the full
  pipeline. `owner` is an assignment/accountability attribute, **not** a visibility
  wall — the dedup audit check and the team-visibility dashboard depend on this.
- **Approved-member gating.** All business-table policies gate on `is_member()`
  (= an `approved` profile). An account created by bypassing the app (signing up
  directly against Supabase Auth) is unapproved and reads/writes nothing. The
  strongest control is also disabling open sign-ups in Supabase Auth settings.
- **Admin-only delete.** `DELETE` requires `is_admin()`. Disqualify and defer are
  *states*, never deletions — leads are never hard-deleted (the compounding-database
  invariant).
- **No privilege self-escalation.** `profiles_update_self` lets a user edit their
  own row, but `WITH CHECK` pins `role` and `approved` to their current values. Only
  admins (via `profiles_admin_all`) can change them.
- `is_member()` and `is_admin()` are `SECURITY DEFINER STABLE` helpers with a pinned
  `search_path`, so policies evaluate them without recursing into `profiles`' own RLS.

## Append-only audit trail & column-locked audits

- **`lead_signals` and `company_events` are append-only**: they have SELECT and
  INSERT policies but **no UPDATE policy**, so scores, narratives, and timeline
  entries cannot be rewritten by clients.
- **`lead_audits` is column-locked at the database.** `REVOKE UPDATE ... FROM
  authenticated`, then `GRANT UPDATE (decision, decision_reason, decided_by,
  decided_at)` only — the deterministic `score`, `narrative`, `factors`, and the
  frozen `signals_snapshot` are immutable once written. Re-scoring inserts a *new*
  audit row, so the score history is itself an audit trail.
- **`audit_log`** (login / export / decision / data_change events) is INSERT-only for
  approved members and **SELECT-only for admins**; no UPDATE/DELETE policy exists, so
  it is immutable to clients.

## Route-level auth & rate limiting

- Every protected route goes through `requireUser()` (`lib/api/auth.ts`), the single
  authorization choke point: it returns the authenticated user plus a request-scoped,
  RLS-enforcing Supabase client, or a `401`. `requireAdmin()` additionally checks
  `role = 'admin' AND approved`.
- The Next 16 request interceptor (`proxy.ts` → `lib/supabase/proxy.ts`) refreshes the
  session on every request and redirects unauthenticated users to `/login`. Only
  `/login`, `/auth`, and `/api/health` are public.
- **Rate limiting** (`lib/api/rate-limit.ts`) is a fixed-window limiter guarding the
  paid LLM/data routes (`audit`, `leads`, `enrich`, `outreach`, `listings/discover`,
  `thought-leadership`, `imports`) against runaway cost. The in-process store is
  correct for a single instance and swappable for Redis/Upstash in production. Over
  limit returns `429` with `Retry-After`.
- Route errors return generic messages — raw error strings are never leaked to
  clients. Import routes enforce a 10MB body cap.

## Security headers & CSP

Set in `next.config.ts` for all paths:

- `Strict-Transport-Security` (2 years, includeSubDomains, preload)
- `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `poweredByHeader: false` (don't advertise the framework)

**CSP ships as `Content-Security-Policy-Report-Only` first** so it can't break
Next/Tailwind inline injection during rollout. Promote it to the enforcing
`Content-Security-Policy` header once validated against a staging build — see
[DEPLOYMENT.md](./DEPLOYMENT.md).

## Secrets handling

- The **service-role key** is read only by `lib/supabase/admin.ts`, which throws if
  evaluated in a browser and throws if the key is missing (no silent fallback to the
  anon key). It bypasses RLS, so it is used only by trusted server routes (bulk
  imports) that do their own `getUser()` check first.
- Third-party API keys (OpenAI, Apollo, SerpAPI, ZoomInfo) are **server-only** and
  never prefixed `NEXT_PUBLIC_`, so Next never inlines them into the client bundle.
- Env is validated by `lib/env.ts` (zod): in production a missing/invalid required
  var fails fast; required server secrets are asserted at the call site via
  `requireServerEnv()`.
- Real secrets live in `.env.local` (gitignored) locally and in Vercel env vars in
  production. `.env.example` documents the variables with placeholders only.

## No-fabrication / verified-signals trust boundary

This is a product-level security property as much as a code one:

- The lead score is **fully deterministic** (`lib/scoring.ts`). The LLM never
  produces or adjusts it.
- The LLM narrative is **constrained to verified signals only**: with no verified
  signal, no model call is made and the honest limitation is stated. Scoring rules
  live in the system message; untrusted company/signal text is wrapped in a delimited
  data block the model is told to treat as data, not instructions. The worst a prompt
  injection can do is steer prose — never the number or the decision.
- Lease timing is **best-effort and always flagged "unverified, confirm before
  outreach"** unless an authoritative source verified it. A lease date is never
  fabricated.
- The legacy "invent a company" fallback was removed; signals carry a source link.

## Reporting a vulnerability

Do not open a public GitHub issue for security problems. Email the engagement lead
(Neil Bajaj, neilbajaj72@hotmail.com) and the C&W platform owner with:

- a description and impact assessment,
- reproduction steps or a proof of concept, and
- any affected routes/tables.

You will get an acknowledgement, and fixes for confirmed issues are prioritized
ahead of feature work. Please give a reasonable window to remediate before any
disclosure.
