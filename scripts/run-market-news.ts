import { closePool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { ingestMarketNews } from "../src/ingest/marketNews.js";
import type { MarketCategory } from "../src/providers/marketNews.js";
import { logger } from "../src/util/logger.js";

/** Fetch market-wide news.
 *
 *   npm run ingest:market
 *   npm run ingest:market -- general,merger,crypto
 *
 *  Cheap enough to run far more often than the company sweep: one request per
 *  category, a couple of seconds total. This is the feed that carries macro
 *  and geopolitical stories, and it comes from primary wires.
 */
async function main(): Promise<void> {
  await migrate();
  const arg = process.argv[2];
  const categories = (arg ? arg.split(",").map((c) => c.trim()) : ["general", "merger"]) as MarketCategory[];

  const result = await ingestMarketNews(categories);
  process.stdout.write(
    `\nMarket news (${categories.join(", ")})\n` +
      `  fetched        ${result.fetched}\n` +
      `  newly stored   ${result.stored}\n` +
      `  company links  ${result.companyLinks}\n\n`,
  );
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "market news ingest failed");
    await closePool();
    process.exit(1);
  });
