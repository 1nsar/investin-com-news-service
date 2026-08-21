-- ---------------------------------------------------------------------------
-- 005: backfill source_tier for articles stored before it existed.
--
-- 004 added the column with a default of 3 (aggregator), which is the right
-- default for an unknown publisher but wrong for the Reuters, CNBC and
-- Bloomberg articles already in the table. Left alone it makes the corpus look
-- uniformly low-quality and any tier-based filter silently useless.
--
-- Kept in SQL rather than application code so it applies exactly once, in
-- order, to any deployment - the same guarantee as every other migration.
--
-- NOTE: this is a one-off backfill, not a second classifier. New rows are
-- tiered by `sourceTier()` in src/ingest/relevance.ts, which is the single
-- source of truth. The patterns below are intentionally a subset - they only
-- need to catch what was already stored when this migration ran. Do not
-- extend them; change relevance.ts and re-run the ingest instead.
-- ---------------------------------------------------------------------------

UPDATE articles SET source_tier = 1
 WHERE source IS NOT NULL AND source_tier <> 1
   AND source ~* '(reuters|bloomberg|associated press|dow jones|wall street journal|wsj|financial times|nikkei|handelsblatt|new york times|nytimes|washington post|guardian|bbc|cnbc|npr|axios|politico)';

UPDATE articles SET source_tier = 2
 WHERE source IS NOT NULL AND source_tier = 3
   AND source ~* '(marketwatch|barron|investor''s business daily|forbes|fortune|business insider|economist|morningstar|investing\.com|globe and mail|south china morning post|straits times|economic times|business standard|livemint)';
