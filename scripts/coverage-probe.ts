import { mkdir, writeFile } from "node:fs/promises";
import { closePool, query } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { getProviders } from "../src/providers/registry.js";
import type { FetchableCompany } from "../src/providers/types.js";
import { mapWithConcurrency } from "../src/util/async.js";
import { logger } from "../src/util/logger.js";

/** Measure real coverage, per provider, per segment of the actual catalogue.
 *
 *  Task 3 asks for hit rates from a real slice rather than vendor claims, and
 *  it asks for them on OUR list. This probe takes a stratified sample - US
 *  exchange, US OTC, foreign-with-ADR, foreign-without-ADR - because a single
 *  blended number hides the only thing that matters: coverage collapses at the
 *  segment boundary, not gradually.
 *
 *  Nothing is written to the articles tables. This measures, it does not
 *  ingest.
 *
 *    npm run coverage:probe -- --per-segment 25 --lookback 7
 */
type Segment = "us_exchange" | "us_otc" | "foreign_with_us_line" | "foreign_only" | "unresolved";

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

interface SampleRow {
  id: number;
  ticker: string;
  company_name: string;
  country: string | null;
  segment: Segment;
  listings: FetchableCompany["listings"] | null;
}

async function sample(perSegment: number): Promise<SampleRow[]> {
  // setseed makes the sample reproducible, so a rerun measures the same
  // companies and a change in hit rate means the provider changed.
  await query("SELECT setseed(0.42)");
  return query<SampleRow>(
    `WITH classified AS (
       SELECT c.id, c.ticker_raw AS ticker, c.company_name, c.country_raw AS country,
              CASE
                WHEN c.resolution_status <> 'resolved' THEN 'unresolved'
                WHEN EXISTS (SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us AND l.mic <> 'OOTC')
                     AND EXISTS (SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_primary AND l.is_us)
                  THEN 'us_exchange'
                WHEN EXISTS (SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_primary AND l.is_us)
                  THEN 'us_otc'
                WHEN EXISTS (SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us)
                  THEN 'foreign_with_us_line'
                ELSE 'foreign_only'
              END AS segment,
              (SELECT json_agg(json_build_object(
                        'id', l.id, 'exchangeCode', l.exchange_code, 'mic', l.mic,
                        'symbol', l.symbol, 'symbolFormat', l.symbol_format,
                        'securityKind', l.security_kind, 'country', l.country,
                        'isUs', l.is_us, 'isPrimary', l.is_primary, 'confidence', l.confidence)
                        ORDER BY l.is_primary DESC, l.confidence DESC)
                 FROM listings l WHERE l.company_id = c.id) AS listings
         FROM companies c WHERE c.is_active
     ), ranked AS (
       SELECT *, row_number() OVER (PARTITION BY segment ORDER BY random()) AS rank FROM classified
     )
     SELECT id, ticker, company_name, country, segment, listings
       FROM ranked WHERE rank <= $1 ORDER BY segment, ticker`,
    [perSegment],
  );
}

async function main(): Promise<void> {
  await migrate();
  const perSegment = Number(argValue("--per-segment", "25"));
  const lookbackDays = Number(argValue("--lookback", "7"));

  const rows = await sample(perSegment);
  const providers = getProviders();
  if (providers.length === 0) throw new Error("no providers configured");

  const to = new Date();
  const from = new Date(to.getTime() - lookbackDays * 86_400_000);

  logger.info(
    { companies: rows.length, providers: providers.map((p) => p.name), lookbackDays },
    "coverage probe starting",
  );

  interface Cell { attempted: number; hit: number; noNews: number; refused: number; error: number; unsupported: number; articles: number; ms: number }
  const results = new Map<string, Cell>();
  const key = (provider: string, segment: string) => `${provider}|${segment}`;
  const cell = (provider: string, segment: string): Cell => {
    const existing = results.get(key(provider, segment));
    if (existing) return existing;
    const created: Cell = { attempted: 0, hit: 0, noNews: 0, refused: 0, error: 0, unsupported: 0, articles: 0, ms: 0 };
    results.set(key(provider, segment), created);
    return created;
  };

  const detail: Record<string, unknown>[] = [];

  for (const provider of providers) {
    await mapWithConcurrency(rows, 5, async (row) => {
      const company: FetchableCompany = {
        id: row.id,
        ticker: row.ticker,
        companyName: row.company_name,
        country: row.country,
        listings: row.listings ?? [],
      };
      const bucket = cell(provider.name, row.segment);
      bucket.attempted += 1;

      const startedAt = Date.now();
      const outcome = await provider.fetch({ company, from, to }).catch((error) => ({
        kind: "error" as const,
        message: error instanceof Error ? error.message : String(error),
      }));
      const elapsed = Date.now() - startedAt;
      bucket.ms += elapsed;

      switch (outcome.kind) {
        case "ok": bucket.hit += 1; bucket.articles += outcome.articles.length; break;
        case "no_news": bucket.noNews += 1; break;
        case "refused": bucket.refused += 1; break;
        case "unsupported": bucket.unsupported += 1; break;
        default: bucket.error += 1; break;
      }

      detail.push({
        provider: provider.name,
        segment: row.segment,
        ticker: row.ticker,
        company: row.company_name,
        outcome: outcome.kind,
        articles: outcome.kind === "ok" ? outcome.articles.length : 0,
        ms: elapsed,
      });
    });
  }

  const segments: Segment[] = ["us_exchange", "us_otc", "foreign_with_us_line", "foreign_only", "unresolved"];
  process.stdout.write(`\nCoverage probe - ${lookbackDays}-day window, ${rows.length} companies\n`);
  process.stdout.write(
    "\n  hit% = provider returned at least one article. 'refused' is an access\n" +
      "  denial, which is a different problem from a company simply being quiet.\n\n",
  );

  const header = `  ${"provider".padEnd(18)}${"segment".padEnd(23)}${"n".padStart(4)}${"hit%".padStart(7)}${"no news".padStart(9)}${"refused".padStart(9)}${"error".padStart(7)}${"n/a".padStart(6)}${"art/co".padStart(8)}${"ms".padStart(7)}`;
  process.stdout.write(`${header}\n  ${"-".repeat(header.length - 2)}\n`);

  for (const provider of providers) {
    for (const segment of segments) {
      const bucket = results.get(key(provider.name, segment));
      if (!bucket || bucket.attempted === 0) continue;
      const usable = bucket.attempted - bucket.unsupported;
      const hitRate = usable > 0 ? ((bucket.hit / usable) * 100).toFixed(0) : "-";
      const perCompany = bucket.hit > 0 ? (bucket.articles / bucket.hit).toFixed(1) : "0";
      process.stdout.write(
        `  ${provider.name.padEnd(18)}${segment.padEnd(23)}${String(bucket.attempted).padStart(4)}` +
          `${String(hitRate).padStart(7)}${String(bucket.noNews).padStart(9)}${String(bucket.refused).padStart(9)}` +
          `${String(bucket.error).padStart(7)}${String(bucket.unsupported).padStart(6)}${perCompany.padStart(8)}` +
          `${String(Math.round(bucket.ms / Math.max(1, bucket.attempted))).padStart(7)}\n`,
      );
    }
  }

  await mkdir("data/out", { recursive: true });
  await writeFile(
    "data/out/coverage-probe.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), lookbackDays, perSegment, detail }, null, 2),
    "utf8",
  );
  process.stdout.write("\n  Per-company detail written to data/out/coverage-probe.json\n\n");
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "coverage probe failed");
    await closePool();
    process.exit(1);
  });
