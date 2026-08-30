import { query, queryOne } from "../db/pool.js";
import { roundupPenaltySql } from "../ingest/relevance.js";

/** Read models for the HTTP layer. Kept apart from the ingest's write paths so
 *  a change to how news is collected cannot quietly reshape the API contract. */

export interface CompanyListFilters {
  q?: string;
  country?: string;
  exchange?: string;
  usListed?: boolean;
  resolutionStatus?: string;
  limit: number;
  offset: number;
}

export interface CompanyRecord {
  ticker: string;
  company_name: string;
  country: string | null;
  sector: string | null;
  catalogue_exchange_hint: string | null;
  catalogue_is_us_listed: boolean | null;
  resolution_status: string;
  resolution_note: string | null;
  resolved_at: Date | null;
  listings: unknown[];
  article_count: number;
  latest_article_at: Date | null;
}

const COMPANY_SELECT = `
  SELECT c.ticker_raw AS ticker,
         c.company_name,
         c.country_raw  AS country,
         c.sector_raw   AS sector,
         c.exchange_hint_raw AS catalogue_exchange_hint,
         c.is_us_listed_raw  AS catalogue_is_us_listed,
         c.resolution_status,
         c.resolution_note,
         c.resolved_at,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'exchange', l.exchange_code, 'mic', l.mic, 'symbol', l.symbol,
                    'symbolFormat', l.symbol_format, 'securityKind', l.security_kind,
                    'country', l.country, 'currency', l.currency,
                    'figi', l.figi, 'shareClassFigi', l.share_class_figi,
                    'isPrimary', l.is_primary, 'isUs', l.is_us,
                    'confidence', l.confidence, 'source', l.source)
                    ORDER BY l.is_primary DESC, l.confidence DESC, l.exchange_code)
             FROM listings l WHERE l.company_id = c.id), '[]'::json) AS listings,
         COALESCE((SELECT count(*) FROM article_companies ac WHERE ac.company_id = c.id), 0)::int AS article_count,
         (SELECT max(a.published_at) FROM article_companies ac
            JOIN articles a ON a.id = ac.article_id
           WHERE ac.company_id = c.id) AS latest_article_at
    FROM companies c`;

export async function listCompanies(
  filters: CompanyListFilters,
): Promise<{ items: CompanyRecord[]; total: number }> {
  const where: string[] = ["c.is_active"];
  const params: unknown[] = [];

  if (filters.q) {
    // Escape LIKE wildcards so `q=%` is a literal search, not a full scan.
    const pattern = filters.q.toLowerCase().replace(/[\\%_]/g, "\\$&");
    params.push(`%${pattern}%`);
    where.push(
      `(lower(c.company_name) LIKE $${params.length} ESCAPE '\\'` +
        ` OR lower(c.ticker_raw) LIKE $${params.length} ESCAPE '\\')`,
    );
  }
  if (filters.country) {
    params.push(filters.country.toUpperCase());
    where.push(`c.country_raw = $${params.length}`);
  }
  if (filters.exchange) {
    params.push(filters.exchange.toUpperCase());
    where.push(`EXISTS (SELECT 1 FROM listings l WHERE l.company_id = c.id AND upper(l.exchange_code) = $${params.length})`);
  }
  if (filters.usListed !== undefined) {
    where.push(
      filters.usListed
        ? "EXISTS (SELECT 1 FROM listings l WHERE l.company_id = c.id AND l.is_us)"
        : "NOT EXISTS (SELECT 1 FROM listings l WHERE l.company_id = c.id AND l.is_us)",
    );
  }
  if (filters.resolutionStatus) {
    params.push(filters.resolutionStatus);
    where.push(`c.resolution_status = $${params.length}`);
  }

  const clause = where.join(" AND ");
  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM companies c WHERE ${clause}`,
    params,
  );

  params.push(filters.limit, filters.offset);
  const items = await query<CompanyRecord>(
    `${COMPANY_SELECT} WHERE ${clause} ORDER BY c.ticker_raw LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { items, total: totalRow?.count ?? 0 };
}

export async function getCompany(ticker: string): Promise<CompanyRecord | undefined> {
  return queryOne<CompanyRecord>(
    `${COMPANY_SELECT} WHERE c.is_active AND upper(c.ticker_raw) = upper($1)`,
    [ticker],
  );
}

export interface NewsFilters {
  ticker?: string;
  from?: Date;
  to?: Date;
  provider?: string;
  matchMethod?: string;
  minConfidence?: number;
  /** Drop round-ups: articles filed against more than this many companies. */
  maxCompanies?: number;
  /** Restrict to (or exclude) market-wide macro stories. */
  marketWide?: boolean;
  /** 1 = primary wires only, 2 = plus established financial media. */
  maxSourceTier?: number;
  minRelevance?: number;
  limit: number;
  offset: number;
}

export interface ArticleCompanyRef {
  ticker: string;
  companyName: string;
  matchMethod: string;
  confidence: number;
}

export interface ArticleRecord {
  id: number;
  headline: string;
  url: string;
  source: string | null;
  provider: string;
  published_at: Date;
  summary: string | null;
  image_url: string | null;
  language: string | null;
  source_tier: number;
  is_market_wide: boolean;
  /** Stored intrinsic relevance minus the live round-up penalty. */
  relevance: number;
  /** Every company this story was filed against. A wire story naming three
   *  companies is ONE article with three entries here - never three rows. */
  companies: ArticleCompanyRef[];
  /** How many companies it was filed against. High counts mark round-ups
   *  ("today's top movers") rather than news about a particular business. */
  company_count: number;
}

/** Cross-company and per-company news.
 *
 *  Returns one row per ARTICLE, with the companies it mentions aggregated
 *  into `companies`. The join table has one row per (article, company) pair,
 *  so selecting from it directly returns the same story once per company -
 *  which is exactly how a feed ends up looking duplicated. Aggregating here
 *  means the API cannot expose that mistake to any consumer.
 *
 *  `total` counts distinct articles for the same reason. */
export async function listNews(
  filters: NewsFilters,
): Promise<{ items: ArticleRecord[]; total: number }> {
  const where: string[] = ["c.is_active"];
  const params: unknown[] = [];

  if (filters.ticker) {
    params.push(filters.ticker);
    where.push(`upper(c.ticker_raw) = upper($${params.length})`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`a.published_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`a.published_at <= $${params.length}`);
  }
  if (filters.provider) {
    params.push(filters.provider);
    where.push(`a.provider = $${params.length}`);
  }
  if (filters.matchMethod) {
    params.push(filters.matchMethod);
    where.push(`ac.match_method = $${params.length}`);
  }
  if (filters.minConfidence !== undefined) {
    params.push(filters.minConfidence);
    where.push(`ac.confidence >= $${params.length}`);
  }
  if (filters.marketWide !== undefined) {
    params.push(filters.marketWide);
    where.push(`a.is_market_wide = $${params.length}`);
  }
  if (filters.maxSourceTier !== undefined) {
    params.push(filters.maxSourceTier);
    where.push(`a.source_tier <= $${params.length}`);
  }
  if (filters.minRelevance !== undefined) {
    params.push(filters.minRelevance);
    // Effective relevance, not the stored column. The stored value is
    // intrinsic (match method, verification, source); the round-up penalty
    // depends on how many companies the article was ultimately filed against,
    // which is only knowable here.
    where.push(
      `ac.relevance - ${roundupPenaltySql(
        "(SELECT count(*) FROM article_companies rc WHERE rc.article_id = a.id)",
      )} >= $${params.length}`,
    );
  }
  if (filters.maxCompanies !== undefined) {
    params.push(filters.maxCompanies);
    where.push(
      `(SELECT count(*) FROM article_companies x WHERE x.article_id = a.id) <= $${params.length}`,
    );
  }

  const clause = where.join(" AND ");
  // Which articles match, deduplicated. Selecting ids first keeps the
  // aggregate join below cheap and makes `total` a distinct-article count.
  const matching = `SELECT DISTINCT a.id, a.published_at
                      FROM article_companies ac
                      JOIN articles  a ON a.id = ac.article_id
                      JOIN companies c ON c.id = ac.company_id
                     WHERE ${clause}`;

  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM (${matching}) m`,
    params,
  );

  params.push(filters.limit, filters.offset);
  const items = await query<ArticleRecord>(
    `WITH matching AS (
       ${matching}
       ORDER BY published_at DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}
     )
     SELECT a.id, a.headline, a.url, a.source, a.provider, a.published_at,
            a.summary, a.image_url, a.language, a.source_tier, a.is_market_wide,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'ticker', c2.ticker_raw,
                       'companyName', c2.company_name,
                       'matchMethod', ac2.match_method,
                       'confidence', ac2.confidence)
                       ORDER BY ac2.confidence DESC, c2.ticker_raw)
                FROM article_companies ac2
                JOIN companies c2 ON c2.id = ac2.company_id
               WHERE ac2.article_id = a.id AND c2.is_active), '[]'::json) AS companies,
            (SELECT count(*)::int FROM article_companies x WHERE x.article_id = a.id) AS company_count,
            GREATEST(0, round((
              COALESCE((SELECT max(rc.relevance) FROM article_companies rc
                         WHERE rc.article_id = a.id), 0.9)
              - ${roundupPenaltySql(
                  "(SELECT count(*) FROM article_companies rc2 WHERE rc2.article_id = a.id)",
                )}
            )::numeric, 2)) AS relevance
       FROM matching m JOIN articles a ON a.id = m.id
      ORDER BY a.published_at DESC, a.id DESC`,
    params,
  );

  return { items, total: totalRow?.count ?? 0 };
}

/** Market-wide news: macro, geopolitical and sector stories that move prices
 *  without being about one company. Not company-scoped, so it does not go
 *  through the article_companies join at all. */
export async function listMarketNews(filters: {
  from?: Date;
  to?: Date;
  maxSourceTier?: number;
  limit: number;
  offset: number;
}): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const where: string[] = ["a.is_market_wide"];
  const params: unknown[] = [];
  if (filters.from) {
    params.push(filters.from);
    where.push(`a.published_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`a.published_at <= $${params.length}`);
  }
  if (filters.maxSourceTier !== undefined) {
    params.push(filters.maxSourceTier);
    where.push(`a.source_tier <= $${params.length}`);
  }
  const clause = where.join(" AND ");

  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM articles a WHERE ${clause}`,
    params,
  );

  params.push(filters.limit, filters.offset);
  const items = await query(
    `SELECT a.id, a.headline, a.url, a.source, a.provider, a.published_at,
            a.summary, a.image_url, a.source_tier,
            COALESCE((
              SELECT json_agg(json_build_object('ticker', c.ticker_raw, 'companyName', c.company_name)
                       ORDER BY c.ticker_raw)
                FROM article_companies ac JOIN companies c ON c.id = ac.company_id
               WHERE ac.article_id = a.id AND c.is_active), '[]'::json) AS companies
       FROM articles a
      WHERE ${clause}
      ORDER BY a.published_at DESC, a.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items, total: totalRow?.count ?? 0 };
}

/** The resolved exchange/listing mapping - a named deliverable, exposed as an
 *  endpoint so it can be pulled as data rather than shipped as a file. */
export async function listingMapping(limit: number, offset: number): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT c.ticker_raw AS catalogue_ticker,
            c.company_name,
            c.exchange_hint_raw AS catalogue_exchange_hint,
            c.is_us_listed_raw  AS catalogue_is_us_listed,
            c.resolution_status,
            l.exchange_code, l.mic, l.symbol, l.symbol_format, l.security_kind,
            l.country, l.currency, l.figi, l.share_class_figi,
            l.is_primary, l.is_us, l.confidence, l.source
       FROM companies c
       LEFT JOIN listings l ON l.company_id = c.id
      WHERE c.is_active
      -- l.id breaks ties: without it the ordering is not total and LIMIT/OFFSET
      -- can repeat or skip rows between pages (17 groups here tie on all three
      -- leading columns).
      ORDER BY c.ticker_raw, l.is_primary DESC NULLS LAST, l.confidence DESC NULLS LAST, l.id
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
}

export async function serviceCounts(): Promise<Record<string, number>> {
  const row = await queryOne<Record<string, number>>(`
    SELECT
      (SELECT count(*) FROM companies WHERE is_active)::int AS companies,
      (SELECT count(*) FROM companies WHERE is_active AND resolution_status = 'resolved')::int AS companies_resolved,
      (SELECT count(*) FROM companies WHERE is_active AND resolution_status <> 'resolved')::int AS companies_unresolved,
      (SELECT count(*) FROM listings)::int AS listings,
      (SELECT count(*) FROM articles)::int AS articles,
      (SELECT count(*) FROM article_companies)::int AS article_links
  `);
  return row ?? {};
}

export interface ConnectivityRow {
  state: string;
  companies: number;
  tickers: string[];
}

/** Connectivity, which is a different question from coverage.
 *
 *  "No news in the window" is a legitimate answer for a quiet company and must
 *  not be reported as a fault. "We never got a definitive answer" - the fetch
 *  was rate limited, errored, or never ran - is a fault, because until it is
 *  resolved we cannot say whether that company would receive news if news
 *  existed. Separating the two is the difference between an alert worth waking
 *  someone for and normal quiet.
 *
 *  Tickers are listed for the two faulty states so an operator can act, and
 *  capped so a widespread outage cannot return a 1,500-element array. */
export async function connectivity(): Promise<ConnectivityRow[]> {
  return query<ConnectivityRow>(`
    WITH latest AS (
      -- The most recent DEFINITIVE answer, from the most recent run that
      -- actually reached this company.
      --
      -- Two things this must get right. First, a definitive answer is looked
      -- for in provider_attempts, not the run-level outcome: a run recorded as
      -- rate_limited can still contain a provider that returned a clean zero,
      -- and reporting that company as "never answered" is wrong. Second, the
      -- answer is bounded to recent runs - without a bound, an outcome from any
      -- point in history outranks every later attempt, so a company whose
      -- listing was re-resolved yesterday keeps reporting the verdict from
      -- before the fix.
      SELECT DISTINCT ON (f.company_id) f.company_id,
             CASE WHEN f.outcome IN ('ok', 'no_news', 'skipped') THEN f.outcome
                  ELSE (SELECT x.outcome
                          FROM jsonb_to_recordset(f.provider_attempts)
                               AS x(provider text, outcome text)
                         WHERE x.outcome IN ('ok', 'no_news')
                         LIMIT 1)
             END AS outcome
        FROM fetch_run_companies f
        JOIN fetch_runs r ON r.id = f.run_id
       WHERE r.started_at > now() - interval '14 days'
         AND (f.outcome IN ('ok', 'no_news', 'skipped')
              OR EXISTS (SELECT 1 FROM jsonb_to_recordset(f.provider_attempts)
                                AS y(provider text, outcome text)
                          WHERE y.outcome IN ('ok', 'no_news')))
       ORDER BY f.company_id, f.run_id DESC
    ), classified AS (
      SELECT c.ticker_raw,
             CASE
               WHEN c.resolution_status <> 'resolved' THEN 'not_connected_unresolved'
               WHEN EXISTS(SELECT 1 FROM article_companies ac WHERE ac.company_id = c.id)
                 THEN 'connected_has_news'
               WHEN l.outcome = 'no_news' THEN 'connected_no_news_in_window'
               -- 'skipped' is a definitive answer, not an unknown: every
               -- provider declined and said why. It needs a source for that
               -- market, which is a different action from a retry.
               WHEN l.outcome = 'skipped' THEN 'no_provider_covers_this_market'
               ELSE 'no_definitive_answer'
             END AS state
        FROM companies c LEFT JOIN latest l ON l.company_id = c.id
    )
    SELECT state,
           count(*)::int AS companies,
           CASE WHEN state IN ('not_connected_unresolved','no_definitive_answer','no_provider_covers_this_market')
                THEN (array_agg(ticker_raw ORDER BY ticker_raw))[1:50]
                ELSE ARRAY[]::text[] END AS tickers
      FROM classified GROUP BY state ORDER BY companies DESC`);
}
