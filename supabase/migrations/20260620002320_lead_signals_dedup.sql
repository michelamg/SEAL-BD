-- Backstop the application-level signal de-dup with a DB constraint.
-- lib/sources/signalKey() de-dups gathered signals against stored rows before
-- insert, but two concurrent POST /api/signals/refresh for the same company can
-- both read the same `existing` snapshot and both insert → duplicate signals
-- (a TOCTOU race). This unique constraint makes the same (company, source, type,
-- date) tuple idempotent at the DB. NULLS NOT DISTINCT (PG15+) ensures undated
-- signals (observed_at IS NULL) also collide instead of slipping through as
-- distinct rows. The route upserts with ignoreDuplicates so the race resolves to
-- a no-op, not a 23505 error.
ALTER TABLE lead_signals
  ADD CONSTRAINT lead_signals_dedup
  UNIQUE NULLS NOT DISTINCT (company_id, source, signal_type, observed_at);
