-- ---------------------------------------------------------------------------
-- 006: make ingest-time rejection observable.
--
-- The relevance gate drops articles that cannot be verified as being about a
-- company. That is the right behaviour, but it was invisible: the count went
-- to logger.debug (below the default log level) and nowhere else. A company
-- with zero articles because it is genuinely quiet looked identical to one
-- whose entire feed was rejected by a matching rule - which is exactly the
-- "silent failure" this component is otherwise careful to avoid.
--
-- articles_seen - articles_new also conflated deduplication with rejection.
-- ---------------------------------------------------------------------------

ALTER TABLE fetch_run_companies
  ADD COLUMN IF NOT EXISTS articles_rejected INTEGER NOT NULL DEFAULT 0;

ALTER TABLE fetch_runs
  ADD COLUMN IF NOT EXISTS articles_rejected INTEGER NOT NULL DEFAULT 0;

-- Find companies whose feed was filtered away rather than simply empty.
CREATE INDEX IF NOT EXISTS frc_rejected_idx
  ON fetch_run_companies (run_id) WHERE articles_rejected > 0;
