import { readFile } from "node:fs/promises";
import { config } from "../config/index.js";
import { transaction, query } from "../db/pool.js";
import { logger } from "../util/logger.js";
import { parseCsvRecords } from "../util/csv.js";
import { normalizeName } from "./names.js";
import { exchangeForHint } from "./exchanges.js";

export interface CatalogueRow {
  ticker: string;
  companyName: string;
  sector: string | null;
  country: string | null;
  isUsListed: boolean | null;
  exchangeHint: string | null;
}

export interface CatalogueAudit {
  /** Hint present but not a venue we know how to resolve. */
  unknownExchangeHint: { ticker: string; hint: string }[];
  /** `is_us_listed` disagrees with what the exchange hint implies. */
  usFlagConflict: { ticker: string; flag: boolean; hint: string; impliedUs: boolean }[];
  /** `country` disagrees with the exchange's home country. */
  countryConflict: { ticker: string; country: string; hint: string; expected: string }[];
  missingExchangeHint: string[];
  duplicateTickers: string[];
  /** Same normalised name under several tickers - cross-listings or genuine
   *  duplicates. Task 2 resolves which. */
  duplicateNames: { name: string; tickers: string[] }[];
}

export interface CatalogueLoadResult {
  parsed: number;
  inserted: number;
  updated: number;
  deactivated: number;
  audit: CatalogueAudit;
}

const TRUE_VALUES = new Set(["true", "t", "yes", "y", "1"]);
const FALSE_VALUES = new Set(["false", "f", "no", "n", "0"]);

function parseBoolean(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return null;
}

/** Read and validate the supplier catalogue.
 *
 *  Nothing here corrects the data. The supplier's own brief calls the exchange
 *  column "a hint to verify, not ground truth", and this catalogue proves the
 *  point: US flags contradict the venue, Japanese listings carry a Canadian
 *  country code, and a Shanghai airport is filed under US. Rewriting those
 *  quietly would destroy the evidence, so every conflict is recorded and the
 *  raw values are stored untouched. The resolver decides what is true. */
export function readCatalogue(text: string): { rows: CatalogueRow[]; audit: CatalogueAudit } {
  const records = parseCsvRecords(text);
  const rows: CatalogueRow[] = [];
  const audit: CatalogueAudit = {
    unknownExchangeHint: [],
    usFlagConflict: [],
    countryConflict: [],
    missingExchangeHint: [],
    duplicateTickers: [],
    duplicateNames: [],
  };

  const seenTickers = new Set<string>();
  const byName = new Map<string, string[]>();

  for (const record of records) {
    const ticker = (record.ticker ?? "").trim();
    const companyName = (record.company_name ?? "").trim();
    if (!ticker || !companyName) continue;

    if (seenTickers.has(ticker)) {
      audit.duplicateTickers.push(ticker);
      continue;
    }
    seenTickers.add(ticker);

    const exchangeHint = (record.exchange_hint ?? "").trim() || null;
    const country = (record.country ?? "").trim() || null;
    const isUsListed = parseBoolean(record.is_us_listed ?? "");

    const row: CatalogueRow = {
      ticker,
      companyName,
      sector: (record.sector ?? "").trim() || null,
      country,
      isUsListed,
      exchangeHint,
    };
    rows.push(row);

    const normalized = normalizeName(companyName);
    if (normalized) {
      const bucket = byName.get(normalized);
      if (bucket) bucket.push(ticker);
      else byName.set(normalized, [ticker]);
    }

    if (!exchangeHint) {
      audit.missingExchangeHint.push(ticker);
      continue;
    }
    const reference = exchangeForHint(exchangeHint);
    if (!reference) {
      audit.unknownExchangeHint.push({ ticker, hint: exchangeHint });
      continue;
    }
    if (isUsListed !== null && isUsListed !== reference.isUs) {
      audit.usFlagConflict.push({
        ticker,
        flag: isUsListed,
        hint: exchangeHint,
        impliedUs: reference.isUs,
      });
    }
    // Only flag a country conflict for non-US venues: a US-listed company can
    // legitimately be headquartered anywhere, and the column is headquarters.
    if (country && !reference.isUs && country !== reference.country) {
      audit.countryConflict.push({
        ticker,
        country,
        hint: exchangeHint,
        expected: reference.country,
      });
    }
  }

  for (const [name, tickers] of byName) {
    if (tickers.length > 1) audit.duplicateNames.push({ name, tickers });
  }

  return { rows, audit };
}

/** Upsert the catalogue. Re-runnable: unchanged rows are touched, changed rows
 *  updated, and anything absent from the file is deactivated rather than
 *  deleted so its article history survives a supplier revision. */
export async function loadCatalogue(
  filePath: string = config.catalogueFile,
): Promise<CatalogueLoadResult> {
  const text = await readFile(filePath, "utf8");
  const { rows, audit } = readCatalogue(text);
  if (rows.length === 0) throw new Error(`Catalogue ${filePath} produced no usable rows`);

  const result = await transaction(async (client) => {
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const outcome = await client.query<{ inserted: boolean }>(
        `INSERT INTO companies
           (ticker_raw, company_name, name_normalized, country_raw, sector_raw,
            exchange_hint_raw, is_us_listed_raw, is_active, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,now())
         ON CONFLICT (ticker_raw) DO UPDATE SET
           company_name      = EXCLUDED.company_name,
           name_normalized   = EXCLUDED.name_normalized,
           country_raw       = EXCLUDED.country_raw,
           sector_raw        = EXCLUDED.sector_raw,
           exchange_hint_raw = EXCLUDED.exchange_hint_raw,
           is_us_listed_raw  = EXCLUDED.is_us_listed_raw,
           is_active         = TRUE,
           last_seen_at      = now(),
           -- A renamed or re-tickered company must be resolved again.
           resolution_status = CASE
             WHEN companies.company_name IS DISTINCT FROM EXCLUDED.company_name
               OR companies.exchange_hint_raw IS DISTINCT FROM EXCLUDED.exchange_hint_raw
             THEN 'pending' ELSE companies.resolution_status END
         RETURNING (xmax = 0) AS inserted`,
        [
          row.ticker,
          row.companyName,
          normalizeName(row.companyName),
          row.country,
          row.sector,
          row.exchangeHint,
          row.isUsListed,
        ],
      );
      if (outcome.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    const deactivated = await client.query(
      `UPDATE companies SET is_active = FALSE
        WHERE is_active AND ticker_raw <> ALL($1::text[])`,
      [rows.map((row) => row.ticker)],
    );

    return { inserted, updated, deactivated: deactivated.rowCount ?? 0 };
  });

  logger.info(
    {
      parsed: rows.length,
      ...result,
      conflicts: {
        usFlag: audit.usFlagConflict.length,
        country: audit.countryConflict.length,
        unknownVenue: audit.unknownExchangeHint.length,
        missingVenue: audit.missingExchangeHint.length,
        duplicateNames: audit.duplicateNames.length,
      },
    },
    "catalogue loaded",
  );

  return { parsed: rows.length, ...result, audit };
}

export async function countCompanies(): Promise<number> {
  const rows = await query<{ count: number }>(
    "SELECT count(*)::int AS count FROM companies WHERE is_active",
  );
  return rows[0]?.count ?? 0;
}
