# Seal Team BD — Supabase operational runbook

Live project: `rvrnzoxqoxnojmhurukf` ("lead_finder", PG17, us-east-1).

## Current security posture (verified 2026-06-20)

- **RLS on every table** (17/17), enforced per-persona — see `supabase/tests/rls-persona-e2e.py`.
- **Approval-gated:** new accounts land `approved=false` and see **zero data** until an admin approves them (`is_member()` gates all business tables; `is_admin()` gates deletes).
- **Open signup is DISABLED** (`disable_signup=true`). Random self-registration is rejected (`signup_disabled`, HTTP 422). Accounts must be created by an admin until/unless signup is re-opened.
- Email confirmation required (`mailer_autoconfirm=false`).

## Seed the first admin

Signup is disabled, so the first admin is created out-of-band, then promoted.

**1. Create the auth user** — either:
- Dashboard → Authentication → Users → *Add user* (set email, password, mark email confirmed), **or**
- Admin API:
  ```bash
  curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@cushwake.com","password":"<temp-password>","email_confirm":true}'
  ```
  (`$SR_KEY` = service-role key. The `on_auth_user_created` trigger auto-creates the `profiles` row.)

**2. Promote to approved admin** — run in the SQL editor (or via the Management API query endpoint):
```sql
update public.profiles
set approved = true, role = 'admin'
where email = 'admin@cushwake.com';
```

That admin can then approve teammates from the app (or you onboard them as below).

## Onboard a broker (while signup is disabled)

1. Admin creates the auth user (same Admin API call as above, or dashboard).
2. Approve them (default role `broker` is correct — leave `role` alone):
   ```sql
   update public.profiles set approved = true where email = 'broker@cushwake.com';
   ```

## Re-open self-signup (optional, when ready for self-onboarding)

Self-signup is still safe to re-enable because the **domain allowlist** (`ALLOWED_SIGNUP_DOMAINS` in the app) plus the **approval gate** mean a self-registered account is both domain-restricted and data-blind until approved.

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/rvrnzoxqoxnojmhurukf/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"disable_signup": false}'
```
Before re-opening, confirm `ALLOWED_SIGNUP_DOMAINS` is set to C&W's domains in the deployed env.

## Re-run the RLS verification after any policy change

```bash
export SUPABASE_URL=https://rvrnzoxqoxnojmhurukf.supabase.co
export ANON_KEY=<anon key>   # NEXT_PUBLIC_SUPABASE_ANON_KEY
export SR_KEY=<service role key>
python3 supabase/tests/rls-persona-e2e.py   # exit 0 = all personas correct
```
Prefer running this against a dev/staging project — it creates and deletes real auth users + rows (self-cleans, but mutates the target DB).
