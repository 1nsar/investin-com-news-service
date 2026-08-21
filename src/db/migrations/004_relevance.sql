-- ---------------------------------------------------------------------------
-- 004: article quality and relevance.
--
-- Fetching news is only half the job; a feed for investors also has to be
-- trustworthy. Three problems measured on this catalogue drive these columns:
--
--   * Misattribution. Name-based search filed a film review under Kid ASA and
--     a BMW story under Jensen-Group. Only 63% of name-matched articles even
--     contained the company's name.
--   * Round-ups. "Today's top movers in the S&P500" is filed against 28
--     companies and is news about none of them.
--   * Source quality. 87% of articles came from three aggregators rather than
--     a primary wire.
--
-- Unverifiable links are now rejected at ingest rather than stored and hidden,
-- so these columns describe what survived, not what was filtered.
-- ---------------------------------------------------------------------------

-- 1 = primary wire / newspaper of record, 2 = established financial media,
-- 3 = aggregator, screener or syndicated commentary (also the default).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS source_tier SMALLINT NOT NULL DEFAULT 3;

-- Market-wide news: macro, geopolitical or sector stories that move prices
-- without naming a company. Linked to companies by exposure, not by mention.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_market_wide BOOLEAN NOT NULL DEFAULT FALSE;

-- 0..1. How likely this article is genuinely about this company.
ALTER TABLE article_companies ADD COLUMN IF NOT EXISTS relevance NUMERIC(3,2) NOT NULL DEFAULT 0.90;
-- Human-readable justification, so a low score can always be explained.
ALTER TABLE article_companies ADD COLUMN IF NOT EXISTS relevance_reason TEXT;

CREATE INDEX IF NOT EXISTS articles_source_tier_idx ON articles (source_tier);
CREATE INDEX IF NOT EXISTS articles_market_wide_idx ON articles (is_market_wide) WHERE is_market_wide;
CREATE INDEX IF NOT EXISTS ac_relevance_idx ON article_companies (company_id, relevance DESC);
