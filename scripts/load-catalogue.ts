import { config } from "../src/config/index.js";
import { loadCatalogue } from "../src/catalogue/loader.js";
import { closePool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { logger } from "../src/util/logger.js";

/** Load the supplier catalogue and print the data-quality audit.
 *
 *  The audit is the point as much as the load is: this catalogue contradicts
 *  itself in several ways, and the run that imports it is the right place to
 *  say so out loud. */
async function main(): Promise<void> {
  await migrate();
  const file = process.argv[2] ?? config.catalogueFile;
  const result = await loadCatalogue(file);
  const { audit } = result;

  const line = (label: string, value: unknown) =>
    process.stdout.write(`  ${label.padEnd(34)} ${String(value)}\n`);

  process.stdout.write(`\nCatalogue: ${file}\n`);
  line("rows parsed", result.parsed);
  line("inserted", result.inserted);
  line("updated", result.updated);
  line("deactivated (absent from file)", result.deactivated);

  process.stdout.write("\nData-quality audit (raw values kept as supplied)\n");
  line("us_listed flag vs venue conflict", audit.usFlagConflict.length);
  line("country vs venue conflict", audit.countryConflict.length);
  line("exchange hint missing", audit.missingExchangeHint.length);
  line("exchange hint unrecognised", audit.unknownExchangeHint.length);
  line("duplicate tickers (skipped)", audit.duplicateTickers.length);
  line("names under several tickers", audit.duplicateNames.length);

  const sample = <T,>(items: T[], count = 5): T[] => items.slice(0, count);
  if (audit.usFlagConflict.length) {
    process.stdout.write("\n  us_listed conflicts, first few:\n");
    for (const item of sample(audit.usFlagConflict)) {
      process.stdout.write(
        `    ${item.ticker.padEnd(10)} flag=${String(item.flag).padEnd(5)} venue=${item.hint} implies us=${item.impliedUs}\n`,
      );
    }
  }
  if (audit.countryConflict.length) {
    process.stdout.write("\n  country conflicts, first few:\n");
    for (const item of sample(audit.countryConflict)) {
      process.stdout.write(
        `    ${item.ticker.padEnd(10)} country=${item.country} venue=${item.hint} expects=${item.expected}\n`,
      );
    }
  }
  if (audit.unknownExchangeHint.length) {
    process.stdout.write("\n  unrecognised venues (resolved by name instead):\n");
    for (const item of sample(audit.unknownExchangeHint)) {
      process.stdout.write(`    ${item.ticker.padEnd(10)} ${item.hint}\n`);
    }
  }
  process.stdout.write("\n");
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "catalogue load failed");
    await closePool();
    process.exit(1);
  });
