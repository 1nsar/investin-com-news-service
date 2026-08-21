-- ---------------------------------------------------------------------------
-- 001_init: companies, resolved listings, articles, run bookkeeping.
--
-- Design notes that matter when reading this:
--   * Catalogue values arrive as HINTS. Everything the supplier gave us is kept
--     verbatim in *_raw columns and never overwritten; resolved truth lives in
--     `listings`. When the two disagree we can prove which was wrong.
--   * Articles are deduplicated globally, not per company, because one story
--     routinely mentions several companies. `article_companies` is the join.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Stable key across catalogue reloads: the supplier's ticker string.
  ticker_raw        TEXT        NOT NULL UNIQUE,
  company_name      TEXT        NOT NULL,
  name_normalized   TEXT        NOT NULL,
  country_raw       TEXT,
  sector_raw        TEXT,
  exchange_hint_raw TEXT,
  is_us_listed_raw  BOOLEAN,

  -- Filled by the resolver (see 002 comments on confidence).
  resolution_status TEXT        NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN ('pending','resolved','ambiguous','unresolved')),
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT,

  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_resolution_status_idx ON companies (resolution_status);
CREATE INDEX IF NOT EXISTS companies_name_normalized_idx   ON companies (name_normalized);
CREATE INDEX IF NOT EXISTS companies_active_idx            ON companies (is_active) WHERE is_active;

-- --------------------------------------------------------------------------
-- Every venue a company trades on. Task 2's deliverable, and a first-class
-- input to the fetch: the ingest picks a symbol from here, never from the CSV.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id       BIGINT      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  exchange_code    TEXT        NOT NULL,   -- OpenFIGI exchCode, e.g. LN, GR, US
  mic              TEXT,                   -- ISO 10383 where known, e.g. XNYS
  symbol           TEXT        NOT NULL,   -- symbol as that venue writes it
  -- The shape a provider needs: 'us' (AAPL), 'suffixed' (VOD.L), 'numeric' (7203).
  symbol_format    TEXT        NOT NULL DEFAULT 'unknown',
  -- 'ordinary' | 'adr' | 'gdr' | 'depositary' | 'other'
  security_kind    TEXT        NOT NULL DEFAULT 'ordinary',
  country          TEXT,
  currency         TEXT,

  figi             TEXT,
  composite_figi   TEXT,
  share_class_figi TEXT,
  isin             TEXT,

  is_primary       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_us            BOOLEAN     NOT NULL DEFAULT FALSE,
  -- How much we trust this row: 1.0 = exchange-hint-confirmed FIGI match,
  -- lower = inferred by share class or normalized name. Surfaced in the API so
  -- a consumer can require a floor.
  confidence       NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  source           TEXT        NOT NULL,   -- openfigi | finnhub_directory | catalogue
  resolved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, exchange_code, symbol)
);

CREATE INDEX IF NOT EXISTS listings_company_idx    ON listings (company_id);
CREATE INDEX IF NOT EXISTS listings_share_class_idx ON listings (share_class_figi);
CREATE INDEX IF NOT EXISTS listings_primary_idx    ON listings (company_id, is_primary) WHERE is_primary;
CREATE INDEX IF NOT EXISTS listings_us_idx         ON listings (company_id, is_us) WHERE is_us;

-- --------------------------------------------------------------------------
-- Canonical article. `dedupe_hash` is the idempotency key: a daily re-run over
-- an overlapping window must not create a second row.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_hash    TEXT        NOT NULL UNIQUE,
  url            TEXT        NOT NULL,
  url_canonical  TEXT        NOT NULL,
  headline       TEXT        NOT NULL,
  summary        TEXT,
  source         TEXT,                    -- publisher, e.g. Reuters
  provider       TEXT        NOT NULL,    -- adapter that produced it
  published_at   TIMESTAMPTZ NOT NULL,
  language       TEXT,
  image_url      TEXT,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_published_idx ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS articles_provider_idx  ON articles (provider);
CREATE INDEX IF NOT EXISTS articles_canonical_idx ON articles (url_canonical);

CREATE TABLE IF NOT EXISTS article_companies (
  article_id   BIGINT      NOT NULL REFERENCES articles(id)  ON DELETE CASCADE,
  company_id   BIGINT      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  listing_id   BIGINT      REFERENCES listings(id) ON DELETE SET NULL,
  -- 'ticker' when the provider is ticker-native, 'name_match' when we matched
  -- a name query. Misattribution risk differs sharply between the two.
  match_method TEXT        NOT NULL DEFAULT 'ticker',
  confidence   NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, company_id)
);

CREATE INDEX IF NOT EXISTS article_companies_company_idx ON article_companies (company_id);

-- --------------------------------------------------------------------------
-- Run bookkeeping. Per-run, per-provider, per-company outcomes, because
-- "no news" and "provider refused" must be alertable separately.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fetch_runs (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status         TEXT        NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','partial','failed')),
  trigger        TEXT        NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual','api','schedule','backfill')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  duration_ms    BIGINT,
  companies_total     INTEGER NOT NULL DEFAULT 0,
  companies_ok        INTEGER NOT NULL DEFAULT 0,
  companies_no_news   INTEGER NOT NULL DEFAULT 0,
  companies_refused   INTEGER NOT NULL DEFAULT 0,
  companies_failed    INTEGER NOT NULL DEFAULT 0,
  companies_unresolved INTEGER NOT NULL DEFAULT 0,
  articles_seen  INTEGER NOT NULL DEFAULT 0,
  articles_new   INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  notes          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS fetch_runs_started_idx ON fetch_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS fetch_run_companies (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id        BIGINT      NOT NULL REFERENCES fetch_runs(id) ON DELETE CASCADE,
  company_id    BIGINT      NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  provider      TEXT,
  symbol_used   TEXT,
  -- The taxonomy the whole observability story hangs off.
  outcome       TEXT        NOT NULL
    CHECK (outcome IN ('ok','no_news','refused','rate_limited','error','unresolved','skipped')),
  http_status   INTEGER,
  articles_seen INTEGER     NOT NULL DEFAULT 0,
  articles_new  INTEGER     NOT NULL DEFAULT 0,
  attempts      INTEGER     NOT NULL DEFAULT 1,
  duration_ms   INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, company_id)
);

CREATE INDEX IF NOT EXISTS frc_run_idx      ON fetch_run_companies (run_id);
CREATE INDEX IF NOT EXISTS frc_company_idx  ON fetch_run_companies (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS frc_outcome_idx  ON fetch_run_companies (run_id, outcome);

-- Incremental state: where to resume per company/provider.
CREATE TABLE IF NOT EXISTS company_fetch_state (
  company_id          BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider            TEXT   NOT NULL,
  last_success_at     TIMESTAMPTZ,
  last_article_at     TIMESTAMPTZ,
  last_outcome        TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  -- Set when a provider keeps refusing: the ingest stops paying for calls it
  -- knows will fail, and the company shows up in the status report instead.
  suppressed_until    TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, provider)
);
