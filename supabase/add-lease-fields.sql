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
