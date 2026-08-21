-- ---------------------------------------------------------------------------
-- 002: secondary deduplication key.
--
-- The canonical URL catches the same story fetched twice. It does not catch
-- the same wire story syndicated to several outlets, which arrives with
-- different URLs and an identical headline on the same day - common enough
-- across a 1,500 company catalogue that a feed fills up with triplicates.
--
-- Not UNIQUE on purpose: two genuinely different companies can publish
-- identically-worded routine announcements ("Q3 Results"), so this is used as
-- a per-company duplicate check inside the ingest rather than a global
-- constraint that would silently drop real articles.
-- ---------------------------------------------------------------------------

ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS articles_content_hash_idx ON articles (content_hash);
