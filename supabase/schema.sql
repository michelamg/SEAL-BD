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
