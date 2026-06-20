# Seal Team BD, Phase 1 Build Context

Internal engineering context for the Phase 1 engagement: bringing the existing platform to
enterprise grade and adding the lead-audit & qualification engine. Captured via a `/grill-me`
design session (2026-06-04). This is the source of truth for build decisions.

## What this is

A C&W San Diego business-development platform (Next.js 16 + React 19 + Supabase + OpenAI) built
in-house by the C&W team. It already sources companies (SerpAPI + Apollo + ZoomInfo + GPT scoring),
enriches contacts, imports spreadsheets, and has a CRM + dashboards. **Phase 1 secures it, hardens
it to enterprise standard, and adds the qualification layer it lacks.**

---

## Locked architecture decisions

### D1 · Authentication & identity
Supabase Auth (email/password + magic link) **+ Row-Level Security**, shipped immediately as the
first deliverable. C&W SSO (SAML/OIDC via Supabase) is a **later configuration**, added when their
IT engages, it is *not* a build blocker.
- *Open:* confirm C&W has no policy requiring SSO-only from day one.

### D2 · Visibility model (what RLS enforces)
**Shared team workspace.** RLS isolates at the team/org level, every authenticated C&W team
member sees the full pipeline; admins (Andy) see all. `owner` is an assignment & accountability
attribute, **not** a visibility wall.
- *Why:* the dedup/"already owned by another broker" audit check and Andy's Team Visibility
  dashboard are both impossible under per-broker data walls.

### D3 · Lease-timing audit check (no CoStar yet)
**Best-effort estimate**, inferred from expansion/relocation news, imported lease comps, and public
filings, **always flagged "unverified, confirm before outreach," with manual override.** Never
fabricate a lease date. Real CoStar lease lookups are a **fast-follow** if/when C&W provides API access.
- *Open:* does C&W have CoStar **API** access (not just seats)?

### D4 · Fit scoring
**Hybrid.** Deterministic, auditable weighted scoring on structured factors (vertical × size ×
footprint × timing × signal strength × reachability), every point traces to a rule and a source.
The **LLM is constrained to narrating verified signals only** ("why now"), never inventing the
score or facts. Replaces the current black-box `gpt-4o, temp 0.6` priority call and removes the
hallucination risk at its root.
- *Open:* qualify/disqualify rules + weights are extracted from the brokers in the working sessions
  (no written criteria assumed).

### D5 · Qualification timing
**On-demand + persistent standing queue** for Phase 1. Brokers source/qualify when they want;
results accumulate into a queue they triage. **Scheduled overnight auto-sourcing is deferred to
Phase 2**, it needs cost guardrails for unattended API spend before it's safe to ship.

### D6 · Infrastructure ownership
**Production = C&W-owned Supabase + Vercel from day one.** Real prospect PII lives *only* in C&W's
production. Dev/staging runs under Serswe control against **synthetic/seed data** (never real
PII). Neil builds as a scoped, revocable collaborator.
- *Kickoff blocker:* nothing deploys until C&W provisions these accounts.
- *Open:* is the current Supabase project Hannah's personal one or already C&W's? Migrate the
  (solid) existing schema into C&W production; decide whether to carry the seed data.
- *Provisioning status (2026-06-19):* Supabase project `rvrnzoxqoxnojmhurukf` (name "lead_finder",
  PG17, us-east-1, ACTIVE_HEALTHY). URL + anon + service-role keys wired into `.env.local`. **Schema
  applied** — was a blank slate (0 tables), now fully provisioned via the consolidated migration
  `supabase/migrations/*_init_seal_bd.sql` (schema.sql + add-lease-fields.sql + rls.sql), pushed
  through the Management API query endpoint using a CLI personal access token. **Verified live:** 17
  public tables all RLS-enabled, 63 policies, `is_member`/`is_admin` helpers, `on_auth_user_created`
  trigger, 12 enums. No data migration needed (project was empty, not Hannah's populated one).
  *Signup gated (2026-06-20):* open self-signup is now **DISABLED** (`disable_signup=true`) — random
  registration is rejected (`signup_disabled`/422). RLS verified per-persona (anon / unapproved /
  approved broker / admin) via `supabase/tests/rls-persona-e2e.py` — all pass; signup ≠ data access
  holds. ⚠ *Still open:* **no admin seeded yet** — see `supabase/RUNBOOK.md` to create + promote the
  first admin (signup is disabled, so accounts are admin-created until self-signup is re-opened).

### D7 · Salesforce export
**Configurable field-mapping layer**, your fields → their Salesforce fields, adjustable without
code, seeded with a sensible default and refined with C&W's SF admin in a working session. Parallel
export in their Salesforce-import format; no direct write. Future-proofs a later live two-way sync.
- *Open:* need C&W's Salesforce admin / a sample import template + field schema.

### D8 · Lead lifecycle, the compounding intelligence database
**Persist every lead permanently, never hard-delete.** Disqualify and defer are *states* ("not now"),
not deletions. Each company carries a full **history/timeline** (every signal, score change, status
change, dated) and a **lease-clock**. Historic leads are **re-scored and re-surfaced when their timing
turns favorable** (lease approaching, new funding, new signal), a dormant lead can outrank a fresh one.
This compounding database is C&W's proprietary moat and the long-term value engine: it grows more
valuable every month and no competitor broker has it.
- **Phase 1:** foundation, permanent storage, history/timeline, lease-clock, on-demand "revisit" re-score.
- **Phase 2:** the automated re-warming engine (scheduled re-evaluation that auto-surfaces re-warmed leads
  each morning), pairs with the deferred scheduled-sourcing (D5).

### D9 · Signal recency (freshness decay)
**Trigger signals decay with age, they do not count forever.** Each signal type has a freshness window,
and its weight in the deterministic score (D4) falls off as it ages: fresh funding (<2wk) full weight,
~3mo half, ~6mo near zero. A lead surfaced *only* by a stale signal does not reach the hot queue.
Reconciles with D8: the database keeps every lead and its full history, but "is this hot now" is driven
by **fresh signals or the advancing lease-clock**, never by an old event. Windows configurable per
signal type (funding ~90d, hiring rolling, leadership change ~120d), tuned in the working sessions.

### D10 · Pluggable sources + multi-source corroboration
Build the finder as a **source-agnostic pipeline** so new sources plug in cheaply. The audit engine
**corroborates signals across independent sources**: a "why now" confirmed by 2+ sources scores higher
and is flagged *multi-source verified*. That is the auditability win, not just more leads but more
trustworthy ones. Current sources: SerpAPI/Google, Apollo, ZoomInfo, + Pitchbook (CSV).
- **Phase 1:** the pluggable architecture + corroboration logic + one quick-win source (SEC EDGAR, free
  and authoritative for funding/filing signals).
- **Phase 2:** source expansion, each its own connector, toward higher recall: USPTO patents, county
  building permits, FDA/DoD contract awards, dedicated news, ATS hiring data.

---

## Open discovery items (confirm with C&W at kickoff)
1. **Account provisioning**, C&W creates Supabase + Vercel (kickoff blocker). Current Supabase owner?
2. **CoStar API** access, yes/no (upgrades lease-timing from best-effort to real).
3. **Identity provider** details for SSO + is SSO-only required day one?
4. **Qualify/disqualify criteria**, written, or extract from brokers in working sessions?
5. **Salesforce** admin + sample import template / field schema (for the export mapping).
6. **API subscriptions** C&W owns + keys: Apollo, ZoomInfo, SerpAPI, OpenAI, Pitchbook.

---

## Phase 1 build sequence
0. **Kickoff**, C&W provisions Supabase + Vercel; migrate existing schema to C&W production.
1. **Security foundation (A)**, Supabase Auth + RLS (shared-team policies) + roles + secrets +
   access/audit log. Lock down the currently-public app *first*.
2. **Sourcing trust (C)**, remove the hallucination/"invent a company" fallback, source-link every
   signal, persist qualified leads into the standing queue.
3. **Qualify/Audit engine (B)**, deterministic auditable scorecard (4 sourced checks + best-effort
   lease-timing) + triage workflow (Approve / Defer / Disqualify with structured reasons).
4. **Salesforce export (D)**, configurable field mapping.
5. **Pipeline visibility (E)**, wire live data into the existing dashboard + weekly digest.
6. **Quality & reliability (F, G)**, code remediation, critical-path test suite + CI, error
   handling, monitoring/alerting, staging/prod, applied throughout, with a hardening pass.
7. **Handoff (H, I, J)**, collaborative sessions woven throughout; training + IT/security docs +
   final end-to-end QA and production deploy at the end.

*Effort: ~100h. Decisions captured via /grill-me, 2026-06-04.*

---

## Build progress — RESUME HERE (last session 2026-06-06)

Building at-risk in local dev (pre-client-approval). All changes uncommitted. Run with `npm run dev` (:3000).
Verification gates: `npm run typecheck` (clean), `npm test` (47 passing), `npm run build` (compiles all routes). CI in `.github/workflows/ci.yml`.

**Done + verified (earlier sessions):**
- App boots locally (Next 16 + Turbopack). `.env.local` now has the **real C&W Supabase** URL + anon +
  service-role keys (project `rvrnzoxqoxnojmhurukf`, empty schema — see D6); API keys (OpenAI/Apollo/
  ZoomInfo/SerpAPI) remain PLACEHOLDER pending C&W subscriptions.
- Killed the data-fabrication bug in `app/api/leads/route.ts` (no invented companies; temp 0.3). Tested live.
- Auth foundation (D1/D2 gate): `@supabase/ssr`, `lib/supabase/{client,server,proxy}.ts`, root `proxy.ts`, `app/login/{page,actions}.ts`. Unauthenticated routes 307 → `/login`. App is locked.

**Done this session (2026-06-06) — all typecheck + build clean, 47 unit tests green:**
1. **Data-layer RLS refactor.** `lib/supabase.ts` `supabase` is now a *session-aware* `@supabase/ssr` browser client via a lazy proxy singleton (was a plain anon client → RLS would have seen every request as anonymous). Zero call-site churn across the 13 client components. `getSupabaseServer()` kept as the service-role server client.
2. **Sign-out + identity in chrome.** `app/layout.tsx` resolves the user server-side; the sidebar renders only when authed, shows the email, and has a sign-out form (server action). Added the **Qualify Queue** nav entry.
3. **Security + audit-engine schema → `supabase/rls.sql`** (idempotent; apply after schema.sql in C&W's project). `profiles` + `app_role` (admin/broker) + auto-provision trigger + `is_admin()`; RLS enabled with **shared-team policies (D2)** on all 15 data tables (SELECT/INSERT/UPDATE for authenticated, DELETE admin-only per D8); append-only admin-readable `audit_log`. New engine tables: `lead_audits`, `lead_signals`, `company_events` (D8 timeline) + lease-clock/score columns on `companies`.
4. **Deterministic scoring engine — `lib/scoring.ts`** (the qualification layer the app lacked). Pure, auditable: 6 weighted factors summing to 100, every point carries a rationale + sources (D4); freshness decay with a 14-day grace window (D9); corroboration multiplier (D10); best-effort lease read **always flagged unverified** (D3). 23 unit tests in `lib/scoring.test.ts`.
5. **Audit API — `app/api/audit/route.ts`.** Runs the deterministic score, then the LLM **narrates verified signals only** (no score/fact invention; honest fallback when none verified). Persists `lead_audits` + `company_events` + updates the company's score/lease-clock. `app/api/audit/decision/route.ts` records Approve/Defer/Disqualify (states, never deletes — D8; disqualify requires a reason).
6. **Qualify Queue UI — `app/qualify/page.tsx` + `components/qualify/scorecard.tsx`.** Queue (sorted by score) → evidence-backed dossier: score band, recommended action, verified-signal "why now", flagged lease read, decision-makers, the explainable factor breakdown, and triage buttons. Mirrors `prep/lead-audit-scorecard-mockup.html`.
7. **Pluggable sources + SEC EDGAR — `lib/sources/`.** Source-agnostic registry (D10) + `SEC EDGAR` connector (free, authoritative, no key; pure `parseEdgarHits` is tested) + multi-source `corroborate()`. `app/api/signals/refresh/route.ts` gathers → de-dupes → persists. 14 tests across `lib/sources/sources.test.ts` + `lib/signals.test.ts`.
8. **Salesforce export — `lib/salesforce-export.ts`** (D7). Configurable our-field→SF-field mapping, RFC-4180 CSV, no direct write. `app/api/export/salesforce/route.ts` streams the CSV; button on the Companies page. 10 tests.
9. **Test harness + CI.** vitest (`npm test`), `typecheck`, GitHub Actions (`.github/workflows/ci.yml`). Lint is non-blocking until the inherited-code lint debt is remediated.

**Security hardening (post Codex adversarial review, 2026-06-06) — all re-verified (50 tests, typecheck, build clean):**
- **Privilege escalation closed:** `profiles_update_self` can no longer change `role`/`approved` (WITH CHECK pins them to current values); only admins change them.
- **Self-signup no longer grants data access:** added `profiles.approved` (default FALSE) + `is_member()`; ALL business-table RLS now gates on `is_member()`, so an account created by bypassing the app (direct Supabase Auth) is unapproved and sees nothing. First admin seeded via dashboard (`approved=true, role='admin'`); primary control is still disabling open sign-ups in Supabase Auth.
- **Audit trail truly append-only:** `lead_signals` + `company_events` have no UPDATE policy (insert/select only); scores/narratives/timeline can't be rewritten by brokers.
- **Service-role client isolated:** moved to `lib/supabase/admin.ts` (throws in browser + throws if key missing — no silent anon fallback); removed from the client-importable `lib/supabase.ts`. Import routes (`pitchbook`,`comps`) now import it there + do an in-route `getUser()` auth check.
- **Dashboard regression fixed:** `app/dashboard/page.tsx` is a Server Component; switched it from the browser `supabase` singleton to `lib/supabase/server.ts` (the proxy refactor would have made it query as anon → empty under RLS).
- **Decision route:** `auditId` now constrained to its `companyId` (can't stamp another company's audit); rowcount-checked.
- **Prompt injection:** audit narrative now puts rules in a `system` message and the company/signal text in a delimited untrusted-data block (score stays deterministic regardless).
- **Scoring:** lease signals no longer double-counted (excluded from the trigger-signal factor); implausibly future-dated signals no longer treated as fresh; NaN guards on `asOf`/confidence.
- **CSV export:** formula-injection guard catches leading whitespace before `= + - @`; export filename slugified before the Content-Disposition header.
- **Both prior follow-ups now closed:** `lead_audits` is column-locked at the DB (REVOKE UPDATE + GRANT UPDATE only on the 4 decision columns — score/narrative/factors frozen); `lead_signals.audit_id` removed in favor of an immutable `signals_snapshot` jsonb frozen on each audit.
- **Open-redirect fixed:** `app/login/actions.ts` `safeNext()` now blocks the `/\evil.com` backslash bypass (single-finding from a follow-up security review).

**Inherited-code hardening pass (2 agent teams, 2026-06-06) — closes the SOW's code-remediation workstream for what's reachable without keys:**
- **All 18 inherited ESLint errors fixed** (set-state-in-effect on fetch-on-mount → scoped disables; unescaped entities escaped; static-components disabled where they close over state). Lint is now **0 errors**; CI lint flipped to a hard gate.
- **Untouched API routes auth-gated:** `enrich`, `ideas/generate`, `ideas/decision-makers`, `listings/discover`, `outreach/generate`, `thought-leadership/outline` now require `getUser()` (was: unauthenticated paid OpenAI/Apollo/ZoomInfo calls + PII exposure). Raw-error leakage (`String(err)`) replaced with generic messages across these + `/api/leads`. Import routes got 10MB size caps + try/catch.
- **Dead fabricator removed:** deleted unused `generateLeads()` from `lib/openai.ts` (it prompted the model to invent companies/funding — the exact trust-boundary bug killed in `/api/leads`).
- **Lib integrations hardened:** AbortController timeouts on Apollo/SERP/ZoomInfo/OpenAI; ZoomInfo token made single-flight + jwt-validated + 401-invalidating; SERP failures now logged; CSV parser bounded (`to_line`), numeric cells sanitized (`'12,500'`→12500), and formula-injection neutralized before storage.

**Enterprise-grade pass (2026-06-06, agent teams) — typecheck + 58 tests + build clean, 0 lint errors:**
- **Shared API layer** (`lib/api/`): `requireUser()`/`requireAdmin()` auth guards, `parseJson()` Zod body validation, fixed-window `rateLimit()` (in-memory, Redis-swappable), uniform `Errors`/`jsonError` responses. **All 13 API routes** standardized onto it — per-user rate limits (20/min paid, 10/min export+import), Zod-validated input, central `captureError` logging, no raw-error leakage. Response shapes preserved.
- **Env validation** (`lib/env.ts`, Zod) — fail-fast in prod, warn in dev; `requireServerEnv()` for secrets. **Structured logging** (`lib/logger.ts`) with a vendor-neutral `captureError` choke point (wire Sentry later in one place).
- **Security headers** (`next.config.ts`): HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP (Report-Only first — promote to enforcing per DEPLOYMENT.md). `poweredByHeader: false`.
- **Resilience**: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`; `/api/health` liveness+readiness probe (public via proxy).
- **CI/CD**: CI now runs typecheck + lint (hard gate) + 58 tests + build + `npm audit`; added CodeQL, Dependabot (npm + actions), gitleaks secret scan, and husky + lint-staged pre-commit.
- **Docs**: README, SECURITY.md, ARCHITECTURE.md, DEPLOYMENT.md (provisioning runbook), `.env.example`, `docs/rls-verification.md` (manual RLS test plan for when keys land).
- **Activates on C&W provisioning** (wired, not buildable without their accounts): SSO/SAML via Supabase, real error-monitoring backend behind `captureError`, Redis-backed rate limiting, DB backups/DR — each documented in DEPLOYMENT.md as a config step.

**Next (needs Neil's 3 cloud dev Supabase keys → `.env.local`):**
1. Apply `supabase/schema.sql` then `supabase/rls.sql` to the dev project.
2. Create a test user; promote to admin (`UPDATE profiles SET role='admin' …`); sign in for real; confirm RLS lets the team see the shared pipeline.
3. Seed a few companies + signals; run an audit end-to-end; verify the scorecard, triage, signal-refresh, and Salesforce export against live data.
4. Then: wire live pipeline data into the dashboard + weekly digest (E); hardening pass + remediate inherited lint/code-quality debt (F/G).

**Gotcha:** AGENTS.md is real — non-standard Next 16. `proxy.ts` not `middleware.ts`; `cookies()` / `searchParams` are async. The `supabase` singleton is browser-only (lazy proxy) — never import it server-side; route handlers use `lib/supabase/server.ts` (session) or `getSupabaseServer()` (service role).
