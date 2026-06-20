-- Seal Team BD — consolidated initial migration
-- Generated 2026-06-20T00:06:40Z from schema.sql + add-lease-fields.sql + rls.sql
-- Apply order matters: base schema/enums → lease columns → security/audit-engine.

-- ════════════════════════════════════════════════════════════════════
-- PART 1/3 · schema.sql (base tables, enums, extensions)
-- ════════════════════════════════════════════════════════════════════
-- Seal Team BD Platform - Full Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE vertical_type AS ENUM ('NIC', 'Tech', 'Life Sci', 'Defense', 'Pro Services', 'Other');
CREATE TYPE track_type AS ENUM ('A', 'B', 'both');
CREATE TYPE company_stage AS ENUM ('prospect', 'qualifying', 'active', 'nurturing', 'won', 'lost', 'disqualified');
CREATE TYPE listing_status AS ENUM ('active', 'under_negotiation', 'closed', 'off_market');
CREATE TYPE prospect_status AS ENUM ('identified', 'contacted', 'touring', 'negotiating', 'closed', 'dead');
CREATE TYPE activity_type AS ENUM ('email', 'call', 'meeting', 'content_drop', 'linkedin', 'proposal');
CREATE TYPE activity_status AS ENUM ('draft', 'sent', 'opened', 'replied', 'no_response', 'bounced');
CREATE TYPE deal_type AS ENUM ('tenant_rep', 'global_advisory', 'listing');
CREATE TYPE checkin_type AS ENUM ('30_day', '60_day', '90_day');

-- ─── COMPANIES ────────────────────────────────────────────────────────────────

CREATE TABLE companies (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  website       TEXT,
  industry      TEXT,
  vertical      vertical_type,
  size          TEXT,                           -- '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'
  employee_count INTEGER,
  location      TEXT,
  city          TEXT,
  state         TEXT,
  description   TEXT,
  track         track_type DEFAULT 'A',
  stage         company_stage DEFAULT 'prospect',
  estimated_sf  INTEGER,                        -- estimated sq footage need
  priority      TEXT DEFAULT 'medium',          -- 'high', 'medium', 'low'
  trigger_signal TEXT,                          -- funding, expansion, C-suite change, etc.
  source        TEXT,                           -- 'pitchbook', 'apollo', 'zoominfo', 'manual', 'lead_finder'
  source_id     TEXT,                           -- external system ID
  apollo_id     TEXT,
  zoominfo_id   TEXT,
  notes         TEXT,
  owner         TEXT,                           -- BD team member assigned
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTACTS ────────────────────────────────────────────────────────────────

CREATE TABLE contacts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  title         TEXT,
  email         TEXT,
  phone         TEXT,
  linkedin_url  TEXT,
  is_c_suite    BOOLEAN DEFAULT FALSE,
  source        TEXT,
  apollo_id     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LISTINGS (Track B) ───────────────────────────────────────────────────────

CREATE TABLE listings (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name              TEXT NOT NULL,             -- 'Torreyana', 'Dallesport', 'GLC'
  address           TEXT,
  city              TEXT,
  state             TEXT,
  submarket         TEXT,
  size_sf           INTEGER,
  min_sf            INTEGER,
  max_sf            INTEGER,
  asking_rate       NUMERIC(10,2),             -- $/SF/year
  lease_type        TEXT,                      -- 'NNN', 'Gross', 'Modified Gross'
  available_date    DATE,
  status            listing_status DEFAULT 'active',
  target_verticals  vertical_type[],
  description       TEXT,
  client_name       TEXT,                      -- building owner/landlord
  amenities         TEXT[],
  highlights        TEXT[],
  image_url         TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LISTING PROSPECTS (Track B) ─────────────────────────────────────────────

CREATE TABLE listing_prospects (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id      UUID REFERENCES listings(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  status          prospect_status DEFAULT 'identified',
  interest_signals TEXT,
  sf_needed       INTEGER,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, company_id)
);

-- ─── OUTREACH ACTIVITIES ──────────────────────────────────────────────────────

CREATE TABLE outreach_activities (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
  track           track_type,
  type            activity_type NOT NULL,
  subject         TEXT,
  body            TEXT,
  status          activity_status DEFAULT 'draft',
  sent_at         TIMESTAMPTZ,
  follow_up_date  DATE,
  ai_generated    BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CADENCES (Touch Schedule) ────────────────────────────────────────────────

CREATE TABLE cadences (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
  track           track_type,
  touch_number    INTEGER DEFAULT 1,           -- which touch in sequence
  next_touch_date DATE,
  touch_type      activity_type,
  status          TEXT DEFAULT 'pending',      -- 'pending', 'completed', 'skipped'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PITCHBOOK REPORTS (Upload) ───────────────────────────────────────────────

CREATE TABLE pitchbook_reports (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename      TEXT NOT NULL,
  upload_date   TIMESTAMPTZ DEFAULT NOW(),
  processed     BOOLEAN DEFAULT FALSE,
  record_count  INTEGER DEFAULT 0,
  new_companies INTEGER DEFAULT 0,
  updated_companies INTEGER DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PITCHBOOK COMPANIES (from report rows) ───────────────────────────────────

CREATE TABLE pitchbook_companies (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id     UUID REFERENCES pitchbook_reports(id) ON DELETE CASCADE,
  company_name  TEXT,
  description   TEXT,
  industry      TEXT,
  website       TEXT,
  hq_location   TEXT,
  employee_count TEXT,
  total_funding TEXT,
  last_funding_type TEXT,
  last_funding_date DATE,
  last_funding_amount TEXT,
  investors     TEXT,
  ceo_name      TEXT,
  cfo_name      TEXT,
  revenue       TEXT,
  status        TEXT DEFAULT 'new',            -- 'new', 'imported', 'skipped'
  matched_company_id UUID REFERENCES companies(id),
  raw_data      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LEASE COMPS ──────────────────────────────────────────────────────────────

CREATE TABLE lease_comps (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_name   TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  submarket     TEXT,
  size_sf       INTEGER,
  rate_per_sf   NUMERIC(10,2),
  lease_term    TEXT,
  lease_type    TEXT,
  deal_date     DATE,
  vertical      vertical_type,
  notes         TEXT,
  source        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── THOUGHT LEADERSHIP ───────────────────────────────────────────────────────

CREATE TABLE thought_leadership (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT NOT NULL,
  vertical        vertical_type,
  quarter         TEXT,                        -- 'Q1 2026', etc.
  description     TEXT,
  file_url        TEXT,
  distributed_count INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DEALS (Won Engagements) ──────────────────────────────────────────────────

CREATE TABLE deals (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        UUID REFERENCES companies(id),
  listing_id        UUID REFERENCES listings(id),
  track             track_type,
  vertical          vertical_type,
  lead_source       TEXT,
  deal_type         deal_type,
  sf                INTEGER,
  commission_estimate NUMERIC(12,2),
  close_date        DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── POST-CLOSE FOLLOW-UPS ────────────────────────────────────────────────────

CREATE TABLE post_close_checkins (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id       UUID REFERENCES deals(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id),
  checkin_type  checkin_type NOT NULL,
  scheduled_date DATE,
  completed_at  TIMESTAMPTZ,
  notes         TEXT,
  status        TEXT DEFAULT 'pending',        -- 'pending', 'completed', 'skipped'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_companies_vertical ON companies(vertical);
CREATE INDEX idx_companies_stage ON companies(stage);
CREATE INDEX idx_companies_track ON companies(track);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_c_suite ON contacts(is_c_suite);
CREATE INDEX idx_listing_prospects_listing ON listing_prospects(listing_id);
CREATE INDEX idx_listing_prospects_company ON listing_prospects(company_id);
CREATE INDEX idx_outreach_company ON outreach_activities(company_id);
CREATE INDEX idx_outreach_track ON outreach_activities(track);
CREATE INDEX idx_cadences_company ON cadences(company_id);
CREATE INDEX idx_cadences_date ON cadences(next_touch_date);
CREATE INDEX idx_pitchbook_companies_report ON pitchbook_companies(report_id);
CREATE INDEX idx_post_close_status ON post_close_checkins(status);
CREATE INDEX idx_post_close_date ON post_close_checkins(scheduled_date);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_listings_updated BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_listing_prospects_updated BEFORE UPDATE ON listing_prospects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── SEED: LISTINGS ───────────────────────────────────────────────────────────

INSERT INTO listings (name, city, state, status, description, target_verticals) VALUES
  ('Torreyana', 'San Diego', 'CA', 'active', 'Torreyana - active listing assignment', ARRAY['Tech', 'Life Sci', 'Defense']::vertical_type[]),
  ('Dallesport', 'Dallesport', 'WA', 'active', 'Dallesport - active listing assignment', ARRAY['Defense', 'NIC']::vertical_type[]),
  ('GLC', 'San Diego', 'CA', 'active', 'GLC - active listing assignment', ARRAY['NIC', 'Tech', 'Pro Services']::vertical_type[]);

-- ════════════════════════════════════════════════════════════════════
-- PART 2/3 · add-lease-fields.sql (lease columns on companies)
-- ════════════════════════════════════════════════════════════════════
-- Add lease/property fields to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS property_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS owner_sublessor TEXT,
  ADD COLUMN IF NOT EXISTS date_leased DATE,
  ADD COLUMN IF NOT EXISTS lease_term TEXT,
  ADD COLUMN IF NOT EXISTS leased_sf INTEGER,
  ADD COLUMN IF NOT EXISTS base_rent TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date DATE,
  ADD COLUMN IF NOT EXISTS listing_agents TEXT,
  ADD COLUMN IF NOT EXISTS procuring_agents TEXT;

-- ════════════════════════════════════════════════════════════════════
-- PART 3/3 · rls.sql (roles, RLS, audit engine — idempotent)
-- ════════════════════════════════════════════════════════════════════
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
