# Architecture

Seal Team BD is a Next.js 16 (App Router) application backed by Supabase Postgres,
with OpenAI used only for narration. This document covers the system shape, data
model, scoring engine, source pipeline, Salesforce export, and request lifecycle.

## System overview

```
Browser (React 19 client components)
   │  fetch
   ▼
proxy.ts ── refresh session, gate auth ──► App Router routes
                                              │  Server Components / route handlers
                                              ▼
                              requireUser()  →  RLS-enforcing Supabase client  ──► Postgres (RLS)
                              service role   →  lib/supabase/admin.ts (bypass)  ──► Postgres (trusted imports)
                                              │
                                              ├─► lib/scoring.ts   (deterministic score — pure)
                                              ├─► lib/sources/*    (pluggable signal sources)
                                              ├─► OpenAI           (verified-signals narration only)
                                              └─► lib/salesforce-export.ts (CSV export)
```

Three Supabase client surfaces, intentionally separated:

- `lib/supabase.ts` — browser singleton (lazy `@supabase/ssr` browser client,
  session-aware so RLS sees the real user). **Browser-only.**
- `lib/supabase/server.ts` `createClient()` — server session client for Server
  Components, Server Actions, and route handlers. Enforces RLS as the caller.
- `lib/supabase/admin.ts` `getSupabaseServer()` — service role, **bypasses RLS**,
  server-only, throws in the browser or if the key is missing.

## Data model

Base schema in `supabase/schema.sql`; security + engine tables in `supabase/rls.sql`.

| Table             | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `companies`       | Prospect firmographics; plus `current_score`, `last_scored_at`, and the lease clock (`current_lease_expiration`, `lease_clock_confidence`) |
| `contacts`        | People at a company; `is_c_suite` drives reachability scoring              |
| `listings`        | Track-B building/space assignments (Torreyana, Dallesport, GLC, …)         |
| `lead_audits`     | One scorecard per audit run: deterministic `score`/`factors`, LLM `narrative`, frozen `signals_snapshot`, and the triage `decision`. Column-locked — only decision fields are mutable |
| `lead_signals`    | Every signal that fed a score, with `source`, `source_url`, `observed_at` (drives freshness), `confidence`, `corroboration_count`. Append-only |
| `company_events`  | Permanent, append-only company timeline (signal_added / scored / status_change / rewarmed) with `score_before`/`score_after` — powers re-warming (D8) |
| `profiles`        | Auth-user mirror: `role` (admin/broker) + `approved` gate                  |
| `audit_log`       | Append-only access/action log; admin-readable                              |

Supporting tables: `listing_prospects`, `outreach_activities`, `cadences`,
`pitchbook_reports`, `pitchbook_companies`, `lease_comps`, `thought_leadership`,
`deals`, `post_close_checkins`. Enums (`signal_confidence`, `audit_decision`,
`app_role`, plus the schema's vertical/stage/status enums) keep states explicit.

**Invariant:** leads are never hard-deleted. Disqualify/defer are *states*. Re-scoring
inserts a new `lead_audits` row, so score history is itself an audit trail.

## Deterministic lead-audit scoring engine

`lib/scoring.ts` is pure, side-effect-free, and unit-tested (`asOf` is injectable so
tests control "now"). It is the qualification layer the platform lacked.

- **Six weighted factors summing to 100** (`FACTOR_MAX`): trigger signals (35),
  lease timing (20), vertical fit (15), company size (12), reachability (10),
  footprint (8). Every factor returns `points`, `max`, a plain-English `rationale`,
  and backing `sources` — every point traces to a rule (D4).
- **Freshness decay (D9):** each signal type has a window (`FRESHNESS_WINDOWS`); a
  14-day grace period keeps fresh signals at full weight, then weight decays linearly
  to zero. Implausibly future-dated signals get partial credit, not full (anti-forgery).
- **Corroboration (D10):** signals confirmed by 2+ independent sources get a
  multiplier (×1.2 for 2, ×1.3 for 3+) and are counted as `corroboratedSignals`.
- **Confidence multiplier:** verified ×1.0, estimated ×0.7, unverified ×0.5.
- **Lease factor (D3):** best-effort read of months-to-expiry (6–18 months is the
  CRE sweet spot), **always flagged unverified** unless an authoritative source
  confirmed it; never fabricated. Lease signals are scored here, not double-counted
  in the trigger-signal factor.
- Output: a `Scorecard` with `score`, `band` (hot ≥70 / warm ≥50 / cool ≥30 / cold),
  per-factor breakdown, lease read, and a recommended action.

**The LLM narrates verified signals only.** `app/api/audit/route.ts` runs the
deterministic score, then calls OpenAI to write a 2–3 sentence "why now" using only
`confidence === 'verified'` signals. With none, it skips the model and states the
honest limitation. Scoring rules sit in the system message; untrusted company/signal
text is fenced in a delimited data block — an injection can steer prose but never the
number. On model failure it falls back to the raw verified facts, never fabricating.

## Pluggable source pipeline

`lib/sources/` is a source-agnostic registry (D10). Each connector implements the
`LeadSource` contract (`name`, `enabled`, `fetchSignals(company)` → normalized
`RawSignal[]`). Add a connector to `SOURCES` and the whole pipeline picks it up.

- **SEC EDGAR** (`sec-edgar.ts`) is the Phase 1 connector: free, authoritative, no API
  key (requires a descriptive `SEC_EDGAR_UA`). It maps filing forms to signal types
  (S-1/424B → funding, 8-K → filing) at `confidence: 'verified'`. The parsing
  (`parseEdgarHits`) is pure and unit-tested.
- `gatherSignals()` runs every enabled source with `Promise.allSettled` (a flaky
  source is dropped, never fails the gather), then `corroborate()` cross-references
  signals of the same type within a time window to set `corroboration_count`.
- `app/api/signals/refresh/route.ts` gathers → de-dupes → persists into `lead_signals`.
- Phase 2 adds USPTO, county permits, FDA/DoD awards, ATS hiring, dedicated news as
  additional connectors; SerpAPI/Apollo/ZoomInfo can be adapted into `LeadSource`s.

## Salesforce export

`lib/salesforce-export.ts` (D7) is a pure, configurable field-mapping layer:
our fields → C&W's Salesforce-import fields, adjustable without code once their SF
admin provides the schema. It emits RFC-4180 CSV with a formula-injection guard
(neutralizes leading `= + - @`, including after whitespace) and a slugified filename.
**No direct write to Salesforce** — `app/api/export/salesforce/route.ts` streams the
CSV for their standard import. This future-proofs a later two-way sync.

## Request lifecycle

1. **Proxy** (`proxy.ts` → `lib/supabase/proxy.ts`, matched on all non-asset paths):
   refreshes the Supabase session via `getUser()` and redirects unauthenticated users
   to `/login?next=…`. Public prefixes: `/login`, `/auth`, `/api/health`.
2. **Route handler / Server Component**: calls `requireUser()` (`lib/api/auth.ts`) —
   the single auth choke point — to get the user and an RLS-enforcing client, or a 401.
   Paid routes also pass through `rateLimit()` first.
3. **Data access**: queries run as the authenticated user, so **RLS enforces
   shared-team visibility and the admin/approved gates** server-side. Trusted bulk
   imports use the service-role client (after their own auth check).
4. **Side effects**: audits persist a `lead_audits` row + a `company_events` entry +
   an `audit_log` entry, and update the company's score/lease clock — all attributed
   to the acting user.
