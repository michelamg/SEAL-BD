# Deployment runbook

Production runs on **C&W-owned Supabase + Vercel**. Real prospect PII lives only in
C&W production. Dev/staging runs against synthetic/seed data. Nothing deploys until
C&W provisions these accounts.

## 1. Provision infrastructure

1. **Supabase** — C&W creates the project. Capture the Project URL, anon key, and
   service-role key (Project Settings → API).
2. **Vercel** — C&W creates the project, connected to this repo. Framework: Next.js
   (auto-detected; `vercel.json` pins build/dev/install to npm).
3. Add the engagement engineer as a scoped, revocable collaborator on both.

## 2. Apply the database schema (order matters)

In the Supabase SQL editor, run in this order:

1. **`supabase/schema.sql`** — tables, enums, indexes, `update_updated_at()`,
   seed listings.
2. **`supabase/rls.sql`** — roles/profiles + auto-provision trigger, the lead-audit
   engine tables, the append-only `audit_log`, and all RLS policies. Idempotent and
   safe to re-run.

> Apply `schema.sql` first — `rls.sql` adds columns to `companies` and references
> tables/functions (`update_updated_at()`) from `schema.sql`.

## 3. Set environment variables

Set these in Vercel (Project Settings → Environment Variables) for Preview and
Production. See `.env.example` for the full annotated list.

| Variable                        | Required | Notes                                   |
| ------------------------------- | -------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes      | Project URL                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes      | Browser-safe; RLS is the guard          |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes      | Server-only; bypasses RLS               |
| `OPENAI_API_KEY`                | yes      | Audit narration + generation routes     |
| `APOLLO_API_KEY`                | as used  | Contact enrichment                      |
| `SERP_API_KEY`                  | as used  | Company/news discovery                  |
| `ZOOMINFO_CLIENT_ID` / `ZOOMINFO_PRIVATE_KEY` | as used | Firmographic enrichment      |
| `ALLOWED_SIGNUP_DOMAINS`        | optional | Comma-separated; set to C&W's domain    |
| `SEC_EDGAR_UA`                  | optional | Descriptive UA w/ contact, or EDGAR 403s |

Env is validated by `lib/env.ts`: in production a missing/invalid **required** var
fails fast at startup. Never set a secret with the `NEXT_PUBLIC_` prefix.

## 4. Seed the first admin

New accounts are unapproved and see nothing, so the first admin is seeded manually:

1. Supabase dashboard → Auth → **Add user** (this fires the trigger that creates the
   `profiles` row).
2. In the SQL editor:
   ```sql
   UPDATE public.profiles
   SET role = 'admin', approved = TRUE
   WHERE email = 'andy@cushwake.com';
   ```
3. Approve teammates as they sign up:
   ```sql
   UPDATE public.profiles SET approved = TRUE WHERE email = '...';
   ```
4. **Strongest control:** disable open sign-ups in Supabase Auth settings, so only
   invited users exist at all.

## 5. CI gates

`.github/workflows/ci.yml` runs on every push/PR and must be green before deploy:

- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest unit suite
- `npm run lint` — ESLint (hard gate)
- `npm run build` — compiles all routes

Vercel builds Preview deployments for PRs and Production on the default branch.

## 6. Health probe

`GET /api/health` is unauthenticated (a public prefix in the proxy). It returns
`{ status: "ok", checks: { db } }` where `db` is `ok` / `unavailable` based on a
lightweight `profiles` reachability check. Use `status` for liveness and `checks.db`
for readiness. It intentionally exposes no internal detail. Wire it into Vercel /
uptime monitoring.

## 7. Promote CSP from Report-Only to enforcing

CSP ships as `Content-Security-Policy-Report-Only` (in `next.config.ts`) so it can't
break Next/Tailwind inline injection during rollout. To enforce:

1. Deploy to staging and exercise every page with the browser console open.
2. Collect CSP violation reports; widen the policy only for legitimate sources.
3. In `next.config.ts`, change the header key from
   `Content-Security-Policy-Report-Only` to **`Content-Security-Policy`** (keep the
   same `csp` value).
4. Re-verify on staging, then promote to production.

## 8. First live smoke test

Once keys land, run the manual RLS test plan in
[docs/rls-verification.md](./docs/rls-verification.md): confirm shared-team read,
that brokers cannot self-escalate, append-only enforcement, that unapproved users see
nothing, and admin-only delete. Then seed a few companies + signals, run an audit
end-to-end, and verify the scorecard, triage, signal refresh, and Salesforce export.
