import { closePool, query, queryOne } from "../src/db/pool.js";
import { logger } from "../src/util/logger.js";

/** Regenerate every number quoted in docs/REPORT.md from the live database.
 *
 *   npm run metrics
 *
 *  This exists because a review found several report figures had drifted from
 *  the data after re-ingests. A stale number in a submission is worse than a
 *  missing one, so the claims are now reproducible with one command rather
 *  than transcribed by hand.
 */
async function main(): Promise<void> {
  const out = (label: string, value: unknown) =>
    process.stdout.write(`  ${label.padEnd(44)} ${String(value)}\n`);
  const section = (title: string) => process.stdout.write(`\n${title}\n${"-".repeat(72)}\n`);

  section("Catalogue and resolution");
  const res = await queryOne<Record<string, number>>(`
    SELECT count(*)::int AS companies,
           count(*) FILTER (WHERE resolution_status='resolved')::int AS resolved,
           count(*) FILTER (WHERE resolution_status<>'resolved')::int AS unresolved,
           (SELECT count(*) FROM listings)::int AS listings,
           (SELECT count(*) FROM listings WHERE security_kind IN ('adr','gdr'))::int AS depositary
      FROM companies WHERE is_active`);
  out("companies", res?.companies);
  const pct = (part: number | undefined, whole: number | undefined): string =>
    part !== undefined && whole ? `${((part / whole) * 100).toFixed(1)}%` : "n/a";
  out("resolved", `${res?.resolved} (${pct(res?.resolved, res?.companies)})`);
  out("unresolved", res?.unresolved);
  out("listings", res?.listings);
  out("depositary receipts (ADR/GDR)", res?.depositary);

  const seg = await query<{ segment: string; companies: number; pct: number }>(`
    SELECT CASE
        WHEN c.resolution_status<>'resolved' THEN 'unresolved'
        WHEN EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us AND l.mic<>'OOTC') THEN 'US exchange listing'
        WHEN EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us) THEN 'US OTC line only'
        ELSE 'no US line' END AS segment,
      count(*)::int AS companies,
      round(100.0*count(*)/sum(count(*)) OVER (),1)::float AS pct
    FROM companies c WHERE c.is_active GROUP BY 1 ORDER BY 2 DESC`);
  for (const row of seg) out(`  ${row.segment}`, `${row.companies} (${row.pct}%)`);

  section("Coverage");
  const cov = await queryOne<Record<string, number>>(`
    SELECT count(*)::int AS companies,
           count(*) FILTER (WHERE n>0)::int AS with_news,
           round(100.0*count(*) FILTER (WHERE n>0)/count(*),1)::float AS pct,
           round(avg(n) FILTER (WHERE n>0),1)::float AS avg_articles
      FROM companies c
      LEFT JOIN LATERAL (SELECT count(*) n FROM article_companies x WHERE x.company_id=c.id) a ON TRUE
     WHERE c.is_active`);
  out("companies returning news", `${cov?.with_news} (${cov?.pct}%)`);
  out("average articles per covered company", cov?.avg_articles);

  section("Articles and attribution");
  const art = await queryOne<Record<string, number>>(`
    SELECT (SELECT count(*) FROM articles)::int AS articles,
           (SELECT count(*) FROM articles WHERE is_market_wide)::int AS market_wide,
           (SELECT count(*) FROM articles WHERE NOT is_market_wide)::int AS company_scope,
           (SELECT count(*) FROM article_companies)::int AS links,
           (SELECT count(DISTINCT source) FROM articles WHERE source IS NOT NULL)::int AS publishers,
           -- The report quotes publisher DOMAINS, not the provider's own source
           -- label. Both are printed so every figure in the docs is reproducible
           -- from this one command without ambiguity.
           (SELECT count(DISTINCT split_part(regexp_replace(url,'^https?://(www\\.)?','','i'),'/',1))
              FROM articles)::int AS publisher_domains`);
  out("articles (total)", art?.articles);
  out("  company-scope", art?.company_scope);
  out("  market-wide", art?.market_wide);
  out("article-company links", art?.links);
  out("distinct source labels", art?.publishers);
  out("distinct publisher domains", art?.publisher_domains);

  const attr = await query<{ match_method: string; links: number; pct: number }>(`
    SELECT match_method, count(*)::int AS links,
           round(100.0*count(*)/sum(count(*)) OVER (),1)::float AS pct
      FROM article_companies GROUP BY 1 ORDER BY 2 DESC`);
  for (const row of attr) out(`  links by ${row.match_method}`, `${row.links} (${row.pct}%)`);

  const artLevel = await queryOne<Record<string, number>>(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE has_ticker)::int AS ticker_native
      FROM (SELECT a.id, bool_or(ac.match_method='ticker') AS has_ticker
              FROM articles a JOIN article_companies ac ON ac.article_id=a.id
             GROUP BY a.id) t`);
  out(
    "ARTICLES with ticker-native attribution",
    `${artLevel?.ticker_native}/${artLevel?.total} (${pct(artLevel?.ticker_native, artLevel?.total)})`,
  );

  section("Publishers by provider");
  const pub = await query<{ provider: string; publishers: number; articles: number }>(`
    SELECT provider, count(DISTINCT source)::int AS publishers, count(*)::int AS articles
      FROM articles WHERE source IS NOT NULL GROUP BY 1 ORDER BY 3 DESC`);
  for (const row of pub) out(`  ${row.provider}`, `${row.publishers} publishers, ${row.articles} articles`);

  section("Source tier");
  const tier = await query<{ feed: string; source_tier: number; articles: number; pct: number }>(`
    SELECT CASE WHEN is_market_wide THEN 'market-wide' ELSE 'company' END AS feed,
           source_tier, count(*)::int AS articles,
           round(100.0*count(*)/sum(count(*)) OVER (PARTITION BY is_market_wide),1)::float AS pct
      FROM articles GROUP BY 1,2,is_market_wide ORDER BY 1 DESC,2`);
  for (const row of tier) out(`  ${row.feed} tier ${row.source_tier}`, `${row.articles} (${row.pct}%)`);

  section("Latest full run");
  const run = await queryOne<Record<string, number | string>>(`
    SELECT id, status, round(duration_ms/1000.0,1)::float AS seconds, companies_total, companies_ok,
           companies_no_news, companies_refused, companies_failed, companies_unresolved,
           articles_seen, articles_new, articles_rejected
      FROM fetch_runs WHERE companies_total > 100 ORDER BY id DESC LIMIT 1`);
  if (run) for (const [k, v] of Object.entries(run)) out(`  ${k}`, v);

  section("News velocity (7-day window, drives refresh tiers)");
  const vel = await query<{ band: string; companies: number; articles: number; pct_articles: number }>(`
    WITH v AS (SELECT c.id, (SELECT count(*) FROM article_companies ac JOIN articles a ON a.id=ac.article_id
                              WHERE ac.company_id=c.id AND a.published_at > now()-interval '7 days') AS n
                 FROM companies c WHERE c.is_active)
    SELECT CASE WHEN n=0 THEN '0 (silent)' WHEN n<=2 THEN '1-2' WHEN n<=6 THEN '3-6'
                WHEN n<=20 THEN '7-20' ELSE '21+' END AS band,
           count(*)::int AS companies, sum(n)::int AS articles,
           round(100.0*sum(n)/sum(sum(n)) OVER (),1)::float AS pct_articles
      FROM v GROUP BY 1 ORDER BY 1`);
  for (const row of vel) out(`  ${row.band}`, `${row.companies} companies, ${row.articles} articles (${row.pct_articles}%)`);

  process.stdout.write("\n");
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "metrics failed");
    await closePool();
    process.exit(1);
  });
