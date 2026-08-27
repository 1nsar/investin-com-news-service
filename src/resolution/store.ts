import { transaction, query } from "../db/pool.js";
import type { CompanyResolution, CompanyToResolve } from "./types.js";

/** Companies still needing resolution. `pending` covers first load and any row
 *  whose name or venue changed in the supplier file. */
export async function companiesNeedingResolution(limit?: number): Promise<CompanyToResolve[]> {
  const rows = await query<{
    id: number;
    ticker_raw: string;
    company_name: string;
    exchange_hint_raw: string | null;
    country_raw: string | null;
    is_us_listed_raw: boolean | null;
  }>(
    `SELECT id, ticker_raw, company_name, exchange_hint_raw, country_raw, is_us_listed_raw
       FROM companies
      WHERE is_active AND resolution_status = 'pending'
      ORDER BY id
      ${limit ? "LIMIT " + Number(limit) : ""}`,
  );
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker_raw,
    companyName: row.company_name,
    exchangeHint: row.exchange_hint_raw,
    country: row.country_raw,
    isUsListedRaw: row.is_us_listed_raw,
  }));
}

export async function allActiveCompanies(): Promise<CompanyToResolve[]> {
  const rows = await query<{
    id: number;
    ticker_raw: string;
    company_name: string;
    exchange_hint_raw: string | null;
    country_raw: string | null;
    is_us_listed_raw: boolean | null;
  }>(
    `SELECT id, ticker_raw, company_name, exchange_hint_raw, country_raw, is_us_listed_raw
       FROM companies WHERE is_active ORDER BY id`,
  );
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker_raw,
    companyName: row.company_name,
    exchangeHint: row.exchange_hint_raw,
    country: row.country_raw,
    isUsListedRaw: row.is_us_listed_raw,
  }));
}

/** Replace a company's listings atomically. Re-running the resolver must
 *  converge on the same rows rather than accumulate stale venues, so the old
 *  set is deleted inside the same transaction that writes the new one. */
export async function saveResolutions(resolutions: CompanyResolution[]): Promise<number> {
  if (resolutions.length === 0) return 0;
  let written = 0;

  await transaction(async (client) => {
    for (const resolution of resolutions) {
      // Only listings that are no longer resolved are removed.
      //
      // Deleting all of them and reinserting looked equivalent, but
      // `article_companies.listing_id` is ON DELETE SET NULL - so a plain
      // `npm run resolve -- --all` silently erased the listing attribution on
      // every article already stored. Two parallel arrays rather than a
      // delimiter: Postgres text cannot contain a NUL, and symbols legitimately
      // contain dots and dashes.
      // An EMPTY resolution never deletes.
      //
      // A failed resolve looks identical to "this company has no security":
      // both arrive here as `listings: []`. With empty keep-arrays the
      // NOT EXISTS below is universally true and every listing for the company
      // is deleted - so one flaky OpenFIGI minute during `resolve --all`
      // destroys verified listings and nulls `article_companies.listing_id`
      // for every article already attributed to them. Measured: 52 companies
      // and 99 article links lost that way in a single run.
      //
      // Keeping stale listings is strictly safer than deleting good ones: the
      // company is still marked unresolved, so the state is visible, and the
      // next successful resolve overwrites them.
      if (resolution.listings.length === 0) {
        await client.query(
          `UPDATE companies
              SET resolution_status = $2, resolution_note = $3, resolved_at = now()
            WHERE id = $1`,
          [resolution.companyId, resolution.status, resolution.note],
        );
        continue;
      }

      const keepExchanges: string[] = [];
      const keepSymbols: string[] = [];
      for (const listing of resolution.listings) {
        if (!listing.exchangeCode?.trim() || !listing.symbol?.trim()) continue;
        keepExchanges.push(listing.exchangeCode);
        keepSymbols.push(listing.symbol);
      }
      await client.query(
        `DELETE FROM listings l
          WHERE l.company_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM unnest($2::text[], $3::text[]) AS k(exch, sym)
               WHERE k.exch = l.exchange_code AND k.sym = l.symbol
            )`,
        [resolution.companyId, keepExchanges, keepSymbols],
      );

      for (const listing of resolution.listings) {
        // Last line of defence: a listing with no venue or no symbol is not a
        // listing. Skipping beats aborting the whole transaction and losing
        // every other company in the chunk.
        if (!listing.exchangeCode?.trim() || !listing.symbol?.trim()) continue;

        await client.query(
          `INSERT INTO listings
             (company_id, exchange_code, mic, symbol, symbol_format, security_kind,
              country, currency, figi, composite_figi, share_class_figi, isin,
              is_primary, is_us, confidence, source, resolved_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
           ON CONFLICT (company_id, exchange_code, symbol) DO UPDATE SET
             mic = EXCLUDED.mic,
             symbol_format = EXCLUDED.symbol_format,
             security_kind = EXCLUDED.security_kind,
             -- The resolver is authoritative on every run, so confidence is
             -- overwritten rather than maxed. GREATEST() made it monotonically
             -- increasing: once a listing had been recorded at 0.90, a later
             -- run that correctly LOWERED it (because the identity turned out
             -- to rest on a weak rename match) could never write the
             -- correction. A confidence that can only go up is not a
             -- confidence.
             confidence = EXCLUDED.confidence,
             -- Overwritten, not OR-ed. expandListings guarantees exactly
             -- one primary per company in memory; unioning that with whatever
             -- was primary on a previous run produced TWO primaries once a
             -- company's primary venue changed between resolves. Same
             -- monotonic flaw as the old GREATEST() on confidence.
             is_primary = EXCLUDED.is_primary,
             resolved_at = now()`,
          [
            resolution.companyId,
            listing.exchangeCode,
            listing.mic,
            listing.symbol,
            listing.symbolFormat,
            listing.securityKind,
            listing.country,
            listing.currency,
            listing.figi,
            listing.compositeFigi,
            listing.shareClassFigi,
            listing.isin,
            listing.isPrimary,
            listing.isUs,
            listing.confidence,
            listing.source,
          ],
        );
        // Counts rows actually written, not insert attempts: ON CONFLICT
        // updates were previously counted as new listings.
        written += 1;
      }

      await client.query(
        `UPDATE companies
            SET resolution_status = $2, resolution_note = $3, resolved_at = now()
          WHERE id = $1`,
        [resolution.companyId, resolution.status, resolution.note],
      );
    }
  });

  return written;
}
