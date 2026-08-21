import type { PoolClient } from "pg";
import { query, transaction } from "../db/pool.js";
import type { CanonicalArticle } from "./canonicalize.js";
import { RELEVANCE_FLOOR, scoreRelevance, sourceTier } from "./relevance.js";
import type { FetchableCompany } from "../providers/types.js";

export interface StoredArticleResult {
  seen: number;
  inserted: number;
  /** Links rejected because the article could not be verified as being about
   *  this company. Reported per run so filtering is visible, not silent. */
  rejected: number;
}

/** Insert a batch of articles for one company.
 *
 *  Idempotent by construction: the unique index on `dedupe_hash` absorbs a
 *  repeat of the same URL, and `article_companies` has a composite primary key
 *  so re-linking an existing article to the same company is a no-op. A daily
 *  re-run over an overlapping window therefore inserts nothing new, which is
 *  exactly what criterion 4 asks for.
 *
 *  Article rows are shared: if two companies are both mentioned in one story,
 *  there is one article row and two links. */
export async function storeArticles(
  companyId: number,
  provider: string,
  matchMethod: "ticker" | "name_match",
  listingId: number | undefined,
  articles: CanonicalArticle[],
  companyName = "",
): Promise<StoredArticleResult> {
  if (articles.length === 0) return { seen: 0, inserted: 0, rejected: 0 };

  return transaction(async (client: PoolClient) => {
    let inserted = 0;

    // Headline+day duplicates already linked to THIS company. Scoped per
    // company so an identical routine headline from a different company is
    // still stored.
    const existingContent = new Set(
      (
        await client.query<{ content_hash: string }>(
          `SELECT a.content_hash
             FROM articles a
             JOIN article_companies ac ON ac.article_id = a.id
            WHERE ac.company_id = $1
              AND a.content_hash = ANY($2::text[])`,
          [companyId, articles.map((article) => article.contentHash)],
        )
      ).rows.map((row) => row.content_hash),
    );

    const seenInBatch = new Set<string>();
    let rejected = 0;

    for (const article of articles) {
      if (seenInBatch.has(article.dedupeHash)) continue;
      seenInBatch.add(article.dedupeHash);
      if (existingContent.has(article.contentHash)) continue;

      // Relevance gate. A link we already know is wrong is not stored: keeping
      // it "just in case" is how a feed loses trust.
      //
      // This score is INTRINSIC - match method, name verification, source
      // quality. The round-up penalty is not applied here because the number
      // of companies an article ends up filed against is not yet known; the
      // API applies it at read time from the live count.
      const relevance = scoreRelevance({
        matchMethod,
        companyName,
        headline: article.headline,
        summary: article.summary,
        source: article.source,
      });
      if (relevance.score < RELEVANCE_FLOOR) {
        rejected += 1;
        continue;
      }

      const upsert = await client.query<{ id: number; inserted: boolean }>(
        `INSERT INTO articles
           (dedupe_hash, content_hash, url, url_canonical, headline, summary,
            source, provider, published_at, language, image_url, source_tier)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (dedupe_hash) DO UPDATE SET
           -- Touch a stable column so RETURNING yields the existing row.
           headline = articles.headline
         RETURNING id, (xmax = 0) AS inserted`,
        [
          article.dedupeHash,
          article.contentHash,
          article.url,
          article.urlCanonical,
          article.headline,
          article.summary,
          article.source,
          provider,
          article.publishedAt,
          article.language,
          article.imageUrl,
          sourceTier(article.source),
        ],
      );

      const row = upsert.rows[0];
      if (!row) continue;
      if (row.inserted) inserted += 1;
      existingContent.add(article.contentHash);

      await client.query(
        `INSERT INTO article_companies
           (article_id, company_id, listing_id, match_method, confidence, relevance, relevance_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (article_id, company_id) DO NOTHING`,
        [
          row.id,
          companyId,
          listingId ?? null,
          matchMethod,
          matchMethod === "ticker" ? 1.0 : 0.7,
          relevance.score,
          relevance.reason,
        ],
      );
    }

    return { seen: articles.length, inserted, rejected };
  });
}

/** Refresh tiers, derived from measured news velocity.
 *
 *  News volume across this catalogue is extremely skewed: 9% of companies
 *  produce 60% of the articles, while 28% produce none at all in a given week.
 *  Refreshing all 1,515 at one cadence therefore spends most of its request
 *  budget asking quiet companies whether anything happened, while the busiest
 *  names wait just as long as the silent ones.
 *
 *  Tiers let a scheduler run the hot names often and the quiet ones rarely.
 *  Boundaries are in articles per 7 days:
 *
 *    hot    >= 21   (~3+/day)  the 9% that generate most of the news
 *    active  3..20             the working middle, plus anything never fetched
 *    quiet   0..2              silent or nearly so
 *
 *  A company with no history counts as `active` so a newly added listing is
 *  picked up promptly rather than waiting for the slowest cadence. */
export type RefreshTier = "hot" | "active" | "quiet" | "all";

const TIER_WINDOW_DAYS = 7;

function tierPredicate(tier: RefreshTier): string {
  if (tier === "all") return "TRUE";
  const velocity = `(SELECT count(*) FROM article_companies ac
                       JOIN articles a ON a.id = ac.article_id
                      WHERE ac.company_id = c.id
                        AND a.published_at > now() - interval '${TIER_WINDOW_DAYS} days')`;
  const everFetched = `EXISTS (SELECT 1 FROM company_fetch_state s WHERE s.company_id = c.id)`;
  switch (tier) {
    case "hot":
      return `${velocity} >= 21`;
    case "active":
      return `(${velocity} BETWEEN 3 AND 20 OR NOT ${everFetched})`;
    case "quiet":
      return `(${velocity} <= 2 AND ${everFetched})`;
  }
}

/** Companies to fetch, each with its resolved listings attached. Unresolved
 *  companies are included on purpose: the run must report them as
 *  `unresolved` rather than pretending they do not exist. */
export async function companiesForFetch(options: {
  limit?: number;
  tickers?: string[];
  tier?: RefreshTier;
}): Promise<FetchableCompany[]> {
  const rows = await query<{
    id: number;
    ticker_raw: string;
    company_name: string;
    country_raw: string | null;
    listings: FetchableCompany["listings"] | null;
  }>(
    `SELECT c.id, c.ticker_raw, c.company_name, c.country_raw,
            (SELECT json_agg(json_build_object(
                      'id', l.id, 'exchangeCode', l.exchange_code, 'mic', l.mic,
                      'symbol', l.symbol, 'symbolFormat', l.symbol_format,
                      'securityKind', l.security_kind, 'country', l.country,
                      'isUs', l.is_us, 'isPrimary', l.is_primary,
                      'confidence', l.confidence)
                      ORDER BY l.is_primary DESC, l.confidence DESC)
               FROM listings l WHERE l.company_id = c.id) AS listings
       FROM companies c
      WHERE c.is_active
        AND ($1::text[] IS NULL OR c.ticker_raw = ANY($1::text[]))
        AND ${tierPredicate(options.tier ?? "all")}
      ORDER BY c.id
      ${options.limit ? "LIMIT " + Number(options.limit) : ""}`,
    [options.tickers?.length ? options.tickers : null],
  );

  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker_raw,
    companyName: row.company_name,
    country: row.country_raw,
    listings: row.listings ?? [],
  }));
}

export interface FetchStateRow {
  companyId: number;
  provider: string;
  lastSuccessAt: Date | null;
  lastArticleAt: Date | null;
  consecutiveFailures: number;
  suppressedUntil: Date | null;
}

export async function loadFetchState(): Promise<Map<string, FetchStateRow>> {
  const rows = await query<{
    company_id: number;
    provider: string;
    last_success_at: Date | null;
    last_article_at: Date | null;
    consecutive_failures: number;
    suppressed_until: Date | null;
  }>("SELECT * FROM company_fetch_state");

  const map = new Map<string, FetchStateRow>();
  for (const row of rows) {
    map.set(`${row.company_id}:${row.provider}`, {
      companyId: row.company_id,
      provider: row.provider,
      lastSuccessAt: row.last_success_at,
      lastArticleAt: row.last_article_at,
      consecutiveFailures: row.consecutive_failures,
      suppressedUntil: row.suppressed_until,
    });
  }
  return map;
}

/** Record the outcome and decide whether to back a company off.
 *
 *  Repeated refusals are the signal that a provider has stopped serving a
 *  company (a delisting, a plan change, a symbol that no longer exists).
 *  Continuing to call costs budget and buries the signal, so after several in
 *  a row the company is suppressed for a while and reported in the status
 *  endpoint instead. Suppression always expires - it must never become a
 *  permanent silent drop. */
export async function recordFetchState(
  companyId: number,
  provider: string,
  outcome: string,
  latestArticleAt: Date | null,
): Promise<void> {
  const failed = outcome === "error" || outcome === "refused" || outcome === "rate_limited";
  await query(
    `INSERT INTO company_fetch_state
       (company_id, provider, last_success_at, last_article_at, last_outcome,
        consecutive_failures, suppressed_until, updated_at)
     VALUES ($1, $2,
             CASE WHEN $3 THEN NULL ELSE now() END,
             $4, $5,
             CASE WHEN $3 THEN 1 ELSE 0 END,
             NULL, now())
     ON CONFLICT (company_id, provider) DO UPDATE SET
       last_success_at = CASE WHEN $3 THEN company_fetch_state.last_success_at ELSE now() END,
       last_article_at = GREATEST(company_fetch_state.last_article_at, EXCLUDED.last_article_at),
       last_outcome = EXCLUDED.last_outcome,
       consecutive_failures = CASE WHEN $3 THEN company_fetch_state.consecutive_failures + 1 ELSE 0 END,
       suppressed_until = CASE
         WHEN $3 AND company_fetch_state.consecutive_failures + 1 >= 5
           THEN now() + interval '24 hours'
         ELSE NULL END,
       updated_at = now()`,
    [companyId, provider, failed, latestArticleAt, outcome],
  );
}

