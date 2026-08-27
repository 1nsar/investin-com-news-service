-- ---------------------------------------------------------------------------
-- 008: persist the skipped-company count.
--
-- `RunTotals.companiesSkipped` was accumulated in memory and then dropped:
-- there was no column to write it to. The effect was that for any run with
-- skipped companies the totals did not reconcile --
-- companies_total <> ok + no_news + refused + failed + unresolved -- and the
-- run still reported "succeeded".
-- ---------------------------------------------------------------------------

ALTER TABLE fetch_runs
  ADD COLUMN IF NOT EXISTS companies_skipped INTEGER NOT NULL DEFAULT 0;
