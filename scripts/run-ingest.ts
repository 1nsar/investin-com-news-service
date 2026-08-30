import { closePool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { runIngestExclusive } from "../src/ingest/runner.js";
import type { RefreshTier } from "../src/ingest/store.js";
import { runProviderBreakdown } from "../src/observability/runs.js";
import { logger } from "../src/util/logger.js";

/** Fetch news for the catalogue.
 *
 *   npm run ingest
 *   npm run ingest -- --limit 50        (first 50 by catalogue order, not a
 *                                         random sample - handy for a smoke
 *                                         test, not representative of coverage)
 *   npm run ingest -- --tickers AAPL,MSFT,7203
 *   npm run ingest -- --lookback 7
 *   npm run ingest -- --tier hot        (busiest ~9%; run hourly)
 *   npm run ingest -- --tier active     (working middle; run every 6h)
 *   npm run ingest -- --tier quiet      (silent names; daily is plenty)
 *
 *  This is the command a scheduler runs. It is a standalone process on
 *  purpose: a crashed API server must not silently skip a day, and a stuck
 *  ingest must not take the API down with it.
 */
function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  await migrate();

  const limitArg = argValue("--limit");
  const tickersArg = argValue("--tickers");
  const lookbackArg = argValue("--lookback");
  const tierArg = argValue("--tier");
  const validTiers: RefreshTier[] = ["hot", "active", "quiet", "all"];
  if (tierArg && !validTiers.includes(tierArg as RefreshTier)) {
    throw new Error(`--tier must be one of: ${validTiers.join(", ")}`);
  }

  const result = await runIngestExclusive({
    trigger: "manual",
    limit: limitArg ? Number(limitArg) : undefined,
    tickers: tickersArg ? tickersArg.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined,
    lookbackDays: lookbackArg ? Number(lookbackArg) : undefined,
    tier: (tierArg as RefreshTier) ?? undefined,
  });

  const line = (label: string, value: unknown) =>
    process.stdout.write(`  ${label.padEnd(30)} ${String(value)}\n`);

  process.stdout.write(
    `\nRun #${result.runId} finished in ${(result.durationMs / 1000).toFixed(1)}s` +
      `${tierArg ? ` (tier: ${tierArg})` : ""}\n`,
  );
  line("companies attempted", result.companiesTotal);
  line("with articles", result.companiesOk);
  line("no news (clean zero)", result.companiesNoNews);
  line("provider refused", result.companiesRefused);
  line("failed", result.companiesFailed);
  line("unresolved (no listing)", result.companiesUnresolved);
  line("articles seen", result.articlesSeen);
  line("articles new", result.articlesNew);
  line("articles rejected (not relevant)", result.articlesRejected);

  const breakdown = await runProviderBreakdown(result.runId);
  if (breakdown.length > 0) {
    process.stdout.write("\nBy provider and outcome\n");
    for (const row of breakdown) {
      process.stdout.write(
        `  ${(row.provider ?? "-").padEnd(18)} ${row.outcome.padEnd(14)} ${String(row.companies).padStart(5)} companies` +
          `${row.articles_new ? `, ${row.articles_new} new articles` : ""}\n`,
      );
    }
  }
  process.stdout.write("\n");
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "ingest command failed");
    await closePool();
    process.exit(1);
  });
