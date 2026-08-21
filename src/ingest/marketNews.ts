import { query, transaction } from "../db/pool.js";
import { logger } from "../util/logger.js";
import { MarketNewsSource, type MarketCategory } from "../providers/marketNews.js";
import { canonicalize } from "./canonicalize.js";
import { mentionsCompanyExactly, sourceTier } from "./relevance.js";

/** Ingest market-wide news.
 *
 *  Stored with `is_market_wide = true` and, by default, linked to no company:
 *  a story about an oil embargo is not "news about Chevron" and pretending
 *  otherwise would corrupt the company feeds this component exists to serve.
 *
 *  Two exceptions produce a company link, both evidence-based:
 *
 *    1. The provider itself tagged the story with a symbol we track. That is a
 *       provider-supplied association, not our inference.
 *    2. A tracked company is named in the headline, and passes the same
 *       relevance verification every name match goes through.
 *
 *  Everything else stays market-scope only, reachable through the market feed
 *  rather than leaking into 1,500 company timelines. */

export interface MarketIngestResult {
  fetched: number;
  stored: number;
  companyLinks: number;
}

interface TrackedCompany {
  id: number;
  name: string;
  symbols: string[];
}

async function trackedCompanies(): Promise<TrackedCompany[]> {
  const rows = await query<{ id: number; company_name: string; symbols: string[] | null }>(
    `SELECT c.id, c.company_name,
            array_remove(array_agg(DISTINCT upper(l.symbol)) FILTER (WHERE l.is_us), NULL) AS symbols
       FROM companies c
       LEFT JOIN listings l ON l.company_id = c.id
      WHERE c.is_active
      GROUP BY c.id, c.company_name`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.company_name,
    symbols: row.symbols ?? [],
  }));
}

export async function ingestMarketNews(
  categories: readonly MarketCategory[] = ["general", "merger"],
): Promise<MarketIngestResult> {
  const source = new MarketNewsSource();
  if (!source.isConfigured()) {
    logger.warn("market news source is not configured; skipping");
    return { fetched: 0, stored: 0, companyLinks: 0 };
  }

  const articles = await source.fetchAll(categories);
  if (articles.length === 0) return { fetched: 0, stored: 0, companyLinks: 0 };

  const companies = await trackedCompanies();
  const bySymbol = new Map<string, TrackedCompany>();
  for (const company of companies) {
    for (const symbol of company.symbols) if (!bySymbol.has(symbol)) bySymbol.set(symbol, company);
  }

  let stored = 0;
  let companyLinks = 0;

  await transaction(async (client) => {
    for (const raw of articles) {
      const article = canonicalize(raw, source.name);
      if (!article) continue;

      const upsert = await client.query<{ id: number; inserted: boolean }>(
        `INSERT INTO articles
           (dedupe_hash, content_hash, url, url_canonical, headline, summary,
            source, provider, published_at, language, image_url, source_tier, is_market_wide)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)
         ON CONFLICT (dedupe_hash) DO UPDATE SET
           -- Only promote to market scope if this row was ALREADY market
           -- scope. Both feeds come from Finnhub and share publishers, so an
           -- unconditional flip could silently reclassify a genuine company
           -- article and move it out of the company feed.
           is_market_wide = articles.is_market_wide,
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
          source.name,
          article.publishedAt,
          article.language,
          article.imageUrl,
          sourceTier(article.source),
        ],
      );
      const row = upsert.rows[0];
      if (!row) continue;
      if (row.inserted) stored += 1;

      // 1. Symbols the provider itself attached.
      const linked = new Set<number>();
      for (const symbol of raw.relatedSymbols) {
        const company = bySymbol.get(symbol);
        if (company) linked.add(company.id);
      }

      // 2. Companies named outright in the headline. Deliberately stricter
      //    than ordinary company news: the full name must appear as a phrase.
      //    A macro story belongs in the market feed, not in 1,500 timelines.
      for (const company of companies) {
        if (linked.has(company.id)) continue;
        if (mentionsCompanyExactly(company.name, article.headline)) linked.add(company.id);
      }

      for (const companyId of linked) {
        const inserted = await client.query(
          `INSERT INTO article_companies
             (article_id, company_id, match_method, confidence, relevance, relevance_reason)
           VALUES ($1,$2,'name_match',0.7,0.6,'market-wide story naming this company')
           ON CONFLICT (article_id, company_id) DO NOTHING`,
          [row.id, companyId],
        );
        companyLinks += inserted.rowCount ?? 0;
      }
    }
  });

  logger.info(
    { fetched: articles.length, stored, companyLinks, categories },
    "market news ingested",
  );
  return { fetched: articles.length, stored, companyLinks };
}
