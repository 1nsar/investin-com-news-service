import { mkdir, writeFile } from "node:fs/promises";
import { closePool, query } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { getProviders } from "../src/providers/registry.js";
import type { FetchableCompany } from "../src/providers/types.js";
import { mapWithConcurrency } from "../src/util/async.js";
import { logger } from "../src/util/logger.js";

/** Measure a provider against the segments where coverage is actually missing.
 *
 *   npm run evaluate -- --per-segment 8
 *
 *  `coverage:probe` samples the whole catalogue evenly, which is right for a
 *  general comparison and wrong for this question. Three quarters of the
 *  catalogue is US-exchange-listed and already well served; sampling it evenly
 *  spends most of a small free-tier quota re-confirming what already works.
 *
 *  This script samples the FAILING segments instead - OTC-only, no US line,
 *  unresolved - plus a US control group. On a 100 request/day free tier that
 *  is the difference between a usable answer and none.
 */
type Segment = "us_exchange_control" | "us_otc_only" | "no_us_line" | "unresolved";

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

interface Row {
  id: number;
  ticker: string;
  company_name: string;
  country: string | null;
  segment: Segment;
  listings: FetchableCompany["listings"] | null;
}

async function sample(perSegment: number): Promise<Row[]> {
  await query("SELECT setseed(0.42)");
  return query<Row>(
    `WITH classified AS (
       SELECT c.id, c.ticker_raw AS ticker, c.company_name, c.country_raw AS country,
              CASE
                WHEN c.resolution_status <> 'resolved' THEN 'unresolved'
                WHEN NOT EXISTS (SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us)
                  THEN 'no_us_line'
                WHEN NOT EXISTS (SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us AND l.mic<>'OOTC')
                  THEN 'us_otc_only'
                ELSE 'us_exchange_control'
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
  const perSegment = Number(argValue("--per-segment", "8"));
  const lookbackDays = Number(argValue("--lookback", "7"));
  const only = argValue("--provider", "");

  const rows = await sample(perSegment);
  let providers = getProviders();
  if (only) providers = providers.filter((p) => p.name === only);
  if (providers.length === 0) throw new Error(`no configured provider${only ? ` named ${only}` : ""}`);

  const to = new Date();
  const from = new Date(to.getTime() - lookbackDays * 86_400_000);

  const budget = providers.length * rows.length;
  process.stdout.write(
    `\nEvaluating ${providers.map((p) => p.name).join(", ")} on ${rows.length} companies` +
      ` (${lookbackDays}-day window)\n` +
      `Approx ${budget} requests total — check this against your daily quota.\n`,
  );

  interface Cell { n: number; hit: number; noNews: number; refused: number; error: number; declined: number; articles: number }
  const cells = new Map<string, Cell>();
  const cell = (p: string, s: string): Cell => {
    const key = `${p}|${s}`;
    let c = cells.get(key);
    if (!c) { c = { n: 0, hit: 0, noNews: 0, refused: 0, error: 0, declined: 0, articles: 0 }; cells.set(key, c); }
    return c;
  };
  const detail: Record<string, unknown>[] = [];

  for (const provider of providers) {
    await mapWithConcurrency(rows, 3, async (row) => {
      const company: FetchableCompany = {
        id: row.id, ticker: row.ticker, companyName: row.company_name,
        country: row.country, listings: row.listings ?? [],
      };
      const c = cell(provider.name, row.segment);
      c.n += 1;
      const outcome = await provider.fetch({ company, from, to }).catch((e) => ({
        kind: "error" as const, message: e instanceof Error ? e.message : String(e),
      }));
      switch (outcome.kind) {
        case "ok": c.hit += 1; c.articles += outcome.articles.length; break;
        case "no_news": c.noNews += 1; break;
        case "refused": c.refused += 1; break;
        case "unsupported": c.declined += 1; break;
        default: c.error += 1; break;
      }
      detail.push({
        provider: provider.name, segment: row.segment, ticker: row.ticker,
        company: row.company_name, outcome: outcome.kind,
        articles: outcome.kind === "ok" ? outcome.articles.length : 0,
        note: "message" in outcome ? outcome.message : "reason" in outcome ? outcome.reason : null,
      });
    });
  }

  const segments: Segment[] = ["us_exchange_control", "us_otc_only", "no_us_line", "unresolved"];
  const head = `\n  ${"provider".padEnd(17)}${"segment".padEnd(22)}${"n".padStart(3)}${"hit%".padStart(6)}${"none".padStart(6)}${"refus".padStart(6)}${"err".padStart(5)}${"n/a".padStart(5)}${"art/hit".padStart(9)}`;
  process.stdout.write(`${head}\n  ${"-".repeat(head.length - 3)}\n`);
  for (const provider of providers) {
    for (const segment of segments) {
      const c = cells.get(`${provider.name}|${segment}`);
      if (!c || c.n === 0) continue;
      const usable = c.n - c.declined;
      const rate = usable > 0 ? `${Math.round((c.hit / usable) * 100)}` : "-";
      const per = c.hit > 0 ? (c.articles / c.hit).toFixed(1) : "0";
      process.stdout.write(
        `  ${provider.name.padEnd(17)}${segment.padEnd(22)}${String(c.n).padStart(3)}${rate.padStart(6)}` +
          `${String(c.noNews).padStart(6)}${String(c.refused).padStart(6)}${String(c.error).padStart(5)}` +
          `${String(c.declined).padStart(5)}${per.padStart(9)}\n`,
      );
    }
  }

  await mkdir("data/out", { recursive: true });
  await writeFile("data/out/provider-evaluation.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), lookbackDays, perSegment, detail }, null, 2), "utf8");
  process.stdout.write("\n  Per-company detail: data/out/provider-evaluation.json\n\n");
}

main().then(closePool).catch(async (error) => {
  logger.error({ err: error }, "evaluation failed");
  await closePool();
  process.exit(1);
});
