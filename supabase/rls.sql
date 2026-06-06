-- Seal Team BD — Security & Audit-Engine migration
-- Run AFTER schema.sql, in the C&W-owned Supabase project.
--
-- Adds (per CONTEXT.md decisions):
--   • Roles + profiles + auto-provisioning trigger          (D1)
--   • Row-Level Security with shared-team policies           (D2)
--   • Append-only access/audit log                          (security foundation)
--   • Lead-audit engine: lead_audits, lead_signals,          (D4/D8/D9/D10)
--     company_events timeline, + lease-clock/score columns
--
-- Idempotent: safe to re-run. Enum creation is guarded; policies are dropped
-- and recreated; columns use ADD COLUMN IF NOT EXISTS.

-- ─── 1 · ROLES, PROFILES, HELPERS (D1) ───────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'broker');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_decision AS ENUM ('pending', 'approved', 'deferred', 'disqualified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_confidence AS ENUM ('verified', 'estimated', 'unverified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  role        app_role NOT NULL DEFAULT 'broker',
  -- New accounts start UNAPPROVED and see nothing until an admin approves them.
  -- This is the real gate: even if someone signs up directly against Supabase
  -- Auth (bypassing the app's allowlist), every business-table policy requires
  -- is_member() = approved, so an unapproved account reads/writes nothing.
  approved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Backfill for re-runs against an older profiles table.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE;

-- Auto-create a profile row whenever a Supabase auth user is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SECURITY DEFINER so policies can call these without recursing into profiles' RLS.
-- is_member(): an approved account (the gate for all shared-team access).
CREATE OR REPLACE FUNCTION public.is_member()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND approved
  );
$$;

-- ─── 2 · LEAD-AUDIT ENGINE TABLES (D4 / D8 / D9 / D10) ────────────────────────

-- Compounding lease-clock + last score, surfaced directly on the company (D8/D9).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_lease_expiration DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS lease_clock_confidence signal_confidence DEFAULT 'unverified';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_score INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ;

-- One scorecard per audit run. The deterministic breakdown lives in `factors`
-- (every point traces to a rule); `narrative` is the LLM "why now", constrained
-- to verified signals only. Audits are never deleted — re-scoring inserts a new
-- row, so the score history is itself an audit trail.
CREATE TABLE IF NOT EXISTS lead_audits (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  score              INTEGER NOT NULL,                 -- 0–100, deterministic
  score_band         TEXT,                             -- 'hot' | 'warm' | 'cool' | 'cold'
  decision           audit_decision NOT NULL DEFAULT 'pending',
  decision_reason    TEXT,                             -- structured triage reason
  decided_by         TEXT,
  decided_at         TIMESTAMPTZ,
  lease_timing       TEXT,                             -- best-effort human read
  lease_confidence   signal_confidence DEFAULT 'unverified',
  lease_window_start DATE,
  lease_window_end   DATE,
  recommended_action TEXT,
  narrative          TEXT,                             -- LLM, verified signals only
  factors            JSONB NOT NULL DEFAULT '[]'::jsonb,-- per-factor score trace
  signals_snapshot   JSONB NOT NULL DEFAULT '[]'::jsonb,-- exact signals scored, frozen at audit time
  corroboration      INTEGER DEFAULT 0,                -- # multi-source-verified signals
  model_version      TEXT,
  scored_by          TEXT,
  scored_at          TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Every signal that fed a score, with its source link (D10) and the date the
-- event actually happened (`observed_at`) so freshness decay (D9) is computable.
CREATE TABLE IF NOT EXISTS lead_signals (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  signal_type        TEXT NOT NULL,                    -- funding | hiring | leadership | lease | expansion | gov_contract | filing
  summary            TEXT,
  source             TEXT,                             -- 'SEC EDGAR' | 'Apollo' | 'SerpAPI' | ...
  source_url         TEXT,
  observed_at        DATE,                             -- when the event happened (drives freshness)
  confidence         signal_confidence DEFAULT 'unverified',
  corroboration_count INTEGER DEFAULT 1,               -- # independent sources confirming
  raw                JSONB,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Permanent, append-only company timeline (D8). Never deleted; powers re-warming.
CREATE TABLE IF NOT EXISTS company_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,                         -- signal_added | scored | status_change | note | rewarmed
  description   TEXT,
  score_before  INTEGER,
  score_after   INTEGER,
  actor_email   TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3 · ACCESS / AUDIT LOG (append-only, admin-readable) ─────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id     UUID,
  actor_email  TEXT,
  action       TEXT NOT NULL,                          -- login | export | decision | data_change | ...
  entity_type  TEXT,
  entity_id    UUID,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4 · INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lead_audits_company  ON lead_audits(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_audits_decision ON lead_audits(decision);
CREATE INDEX IF NOT EXISTS idx_lead_audits_score    ON lead_audits(score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_signals_company ON lead_signals(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_signals_observed ON lead_signals(observed_at);
CREATE INDEX IF NOT EXISTS idx_company_events_company ON company_events(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created    ON audit_log(created_at);

-- ─── 5 · updated_at TRIGGERS for new tables ───────────────────────────────────
-- (update_updated_at() is defined in schema.sql)

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_lead_audits_updated ON lead_audits;
CREATE TRIGGER trg_lead_audits_updated BEFORE UPDATE ON lead_audits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 6 · ROW-LEVEL SECURITY ───────────────────────────────────────────────────
-- D2 shared team workspace: every authenticated C&W user reads & writes the full
-- pipeline; `owner` is an assignment attribute, not a wall. Hard DELETE is
-- admin-only (D8: disqualify/defer are *states*, never deletions). The service
-- role bypasses RLS for trusted server routes (bulk imports).

-- Full-CRUD shared tables: approved members read/insert/update; only admins delete.
DO $$
DECLARE
  t   TEXT;
  tbls TEXT[] := ARRAY[
    'companies','contacts','listings','listing_prospects','outreach_activities',
    'cadences','pitchbook_reports','pitchbook_companies','lease_comps',
    'thought_leadership','deals','post_close_checkins','lead_audits'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS team_select ON public.%I;', t);
    EXECUTE format('CREATE POLICY team_select ON public.%I FOR SELECT TO authenticated USING (public.is_member());', t);

    EXECUTE format('DROP POLICY IF EXISTS team_insert ON public.%I;', t);
    EXECUTE format('CREATE POLICY team_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_member());', t);

    EXECUTE format('DROP POLICY IF EXISTS team_update ON public.%I;', t);
    EXECUTE format('CREATE POLICY team_update ON public.%I FOR UPDATE TO authenticated USING (public.is_member()) WITH CHECK (public.is_member());', t);

    EXECUTE format('DROP POLICY IF EXISTS admin_delete ON public.%I;', t);
    EXECUTE format('CREATE POLICY admin_delete ON public.%I FOR DELETE TO authenticated USING (public.is_admin());', t);
  END LOOP;
END $$;

-- Column-level lock on lead_audits: members may UPDATE (triage decisions need
-- it), but ONLY the decision columns. Score/narrative/factors/snapshot are frozen
-- once written, so the scorecard can't be rewritten after the fact.
REVOKE UPDATE ON public.lead_audits FROM authenticated;
GRANT UPDATE (decision, decision_reason, decided_by, decided_at) ON public.lead_audits TO authenticated;

-- Append-only history (D8): the signal log and the company timeline are an audit
-- trail. Approved members read + insert; NOBODY (except service role / admin
-- delete) can UPDATE them, so scores/narratives/timeline entries can't be rewritten.
DO $$
DECLARE
  t   TEXT;
  tbls TEXT[] := ARRAY['lead_signals','company_events'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS team_select ON public.%I;', t);
    EXECUTE format('CREATE POLICY team_select ON public.%I FOR SELECT TO authenticated USING (public.is_member());', t);

    EXECUTE format('DROP POLICY IF EXISTS team_insert ON public.%I;', t);
    EXECUTE format('CREATE POLICY team_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_member());', t);

    -- no UPDATE policy → append-only
    EXECUTE format('DROP POLICY IF EXISTS admin_delete ON public.%I;', t);
    EXECUTE format('CREATE POLICY admin_delete ON public.%I FOR DELETE TO authenticated USING (public.is_admin());', t);
  END LOOP;
END $$;

-- profiles: a user always sees their own row; approved members see the full
-- roster (owner names). Self-update is allowed but CANNOT change role/approved
-- (prevents privilege self-escalation) — only admins change those.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_member());
DROP POLICY IF EXISTS profiles_update_self ON profiles;
CREATE POLICY profiles_update_self ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND approved = (SELECT p.approved FROM public.profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS profiles_admin_all ON profiles;
CREATE POLICY profiles_admin_all ON profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- audit_log: append-only for approved members; readable by admins only;
-- no UPDATE/DELETE policy at all → immutable to clients.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_insert ON audit_log FOR INSERT TO authenticated WITH CHECK (public.is_member());
DROP POLICY IF EXISTS audit_admin_read ON audit_log;
CREATE POLICY audit_admin_read ON audit_log FOR SELECT TO authenticated USING (public.is_admin());

-- ─── 7 · BOOTSTRAP NOTE ───────────────────────────────────────────────────────
-- New accounts are unapproved (see nothing). Seed the first admin via the
-- Supabase dashboard (Auth → Add user), then:
--   UPDATE public.profiles SET role = 'admin', approved = TRUE WHERE email = 'andy@...';
-- Approve teammates with:
--   UPDATE public.profiles SET approved = TRUE WHERE email = '...';
-- Strongest control: also disable open sign-ups in Supabase Auth settings.
