# Seal Team BD

A business-development platform for the **Cushman & Wakefield San Diego** team. It
sources companies, enriches contacts, imports market data (Pitchbook, lease comps),
and runs a deterministic **lead-audit & qualification engine** that scores prospects,
narrates *why now* from verified signals only, and feeds a triage queue and a
Salesforce-import export.

The platform is the team's compounding intelligence database: every lead is stored
permanently with a full signal history and a lease clock, and dormant leads are
re-surfaced when their timing turns favorable.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Supabase** — Postgres, Auth, and Row-Level Security
- **OpenAI** — constrained narration of verified signals (never scoring or facts)
- **TypeScript**, **Tailwind**, Radix/Base UI components
- **Vitest** for unit tests, **ESLint** for linting, **GitHub Actions** for CI

> **Heads up — this is not stock Next.js.** Next 16 renames `middleware.ts` to
> `proxy.ts`, and `cookies()` / `searchParams` are async. See `AGENTS.md`. The
> `supabase` singleton in `lib/supabase.ts` is **browser-only** — server code uses
> `lib/supabase/server.ts` (session, RLS-enforcing) or `lib/supabase/admin.ts`
> (service role, bypasses RLS).

## Quickstart

```bash
git clone <repo-url>
cd SEAL-BD
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # http://localhost:3000
```

The app boots with placeholder env values (env validation only hard-fails in
production), but every Supabase-backed page will be empty until you point
`.env.local` at a real Supabase project with the schema applied. See
[DEPLOYMENT.md](./DEPLOYMENT.md) for provisioning and first-admin seeding.

## Scripts

| Script               | What it does                                |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Start the dev server on :3000 (Turbopack)   |
| `npm run build`      | Production build (compiles all routes)      |
| `npm start`          | Serve the production build                  |
| `npm test`           | Run the Vitest unit suite once              |
| `npm run test:watch` | Vitest in watch mode                        |
| `npm run typecheck`  | `tsc --noEmit` — type safety gate           |
| `npm run lint`       | ESLint — lint gate                          |

`typecheck`, `test`, `lint`, and `build` are the CI gates (see
`.github/workflows/ci.yml`).

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system overview, data model, scoring engine, source pipeline, request lifecycle
- [SECURITY.md](./SECURITY.md) — auth + RLS model, audit trail, trust boundary, vulnerability reporting
- [DEPLOYMENT.md](./DEPLOYMENT.md) — provisioning, env vars, schema/RLS apply order, first admin, CI gates, CSP promotion
- [docs/rls-verification.md](./docs/rls-verification.md) — manual RLS test plan to run once live keys land
