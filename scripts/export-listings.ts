import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { closePool, query } from "../src/db/pool.js";
import { logger } from "../src/util/logger.js";

/** Export the resolved exchange/listing mapping - a named deliverable.
 *
 *   npm run export:listings                  -> data/listings-mapping.csv + .json
 *   npm run export:listings -- path/prefix
 *
 *  Every row carries the catalogue's original claim next to what we resolved,
 *  so the mapping doubles as the evidence for where the supplied data was
 *  wrong. */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0] as Record<string, unknown>);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");
}

async function main(): Promise<void> {
  // Default writes the tracked deliverable copy. Pass a prefix to write
  // elsewhere, e.g. `npm run export:listings -- data/listings-mapping`.
  const prefix = process.argv[2] ?? "data/listings-mapping";

  const rows = await query(`
    SELECT c.ticker_raw           AS catalogue_ticker,
           c.company_name,
           c.country_raw          AS catalogue_country,
           c.exchange_hint_raw    AS catalogue_exchange_hint,
           c.is_us_listed_raw     AS catalogue_is_us_listed,
           c.resolution_status,
           c.resolution_note,
           l.exchange_code, l.mic, l.symbol, l.symbol_format, l.security_kind,
           l.country              AS listing_country,
           l.currency, l.figi, l.share_class_figi, l.isin,
           l.is_primary, l.is_us, l.confidence, l.source
      FROM companies c
      LEFT JOIN listings l ON l.company_id = c.id
     WHERE c.is_active
     ORDER BY c.ticker_raw, l.is_primary DESC NULLS LAST, l.confidence DESC NULLS LAST
  `);

  await mkdir(dirname(prefix), { recursive: true });
  await writeFile(`${prefix}.csv`, toCsv(rows), "utf8");
  await writeFile(`${prefix}.json`, JSON.stringify(rows, null, 2), "utf8");

  const companies = new Set(rows.map((row) => (row as Record<string, unknown>).catalogue_ticker));
  logger.info(
    { rows: rows.length, companies: companies.size, files: [`${prefix}.csv`, `${prefix}.json`] },
    "listing mapping exported",
  );
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "export failed");
    await closePool();
    process.exit(1);
  });
