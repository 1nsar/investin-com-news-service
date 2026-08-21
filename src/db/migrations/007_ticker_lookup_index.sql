-- ---------------------------------------------------------------------------
-- 007: index the case-insensitive ticker lookup.
--
-- The API resolves companies by `upper(ticker_raw) = upper($1)`, which cannot
-- use the plain unique index on ticker_raw - EXPLAIN showed a sequential scan
-- removing 1,514 rows on every /v1/companies/:ticker and
-- /v1/companies/:ticker/news request. Cheap at this size, but it is the
-- hottest read path in the service.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS companies_ticker_upper_idx ON companies (upper(ticker_raw));
