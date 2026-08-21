-- ---------------------------------------------------------------------------
-- 003: make provider fallthrough visible.
--
-- fetch_run_companies records one row per company per run, carrying the
-- outcome of the provider that ultimately served it. That hid the thing the
-- brief cares most about: when the primary provider fails and a fallback
-- succeeds, the run reported a clean success and the primary's failure left no
-- trace at all. A provider could degrade to failing on every company and the
-- run summary would still look healthy.
--
-- Every provider attempted for a company is now recorded here, in order, so a
-- silent downgrade is queryable:
--
--   [{"provider":"finnhub","outcome":"error","ms":20001,"error":"timed out"},
--    {"provider":"google_news_rss","outcome":"ok","ms":8100}]
-- ---------------------------------------------------------------------------

ALTER TABLE fetch_run_companies
  ADD COLUMN IF NOT EXISTS provider_attempts JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Companies where an earlier provider failed before a later one succeeded.
CREATE INDEX IF NOT EXISTS frc_attempts_idx
  ON fetch_run_companies USING gin (provider_attempts);
