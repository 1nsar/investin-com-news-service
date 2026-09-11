import { pool } from "../db/pool.js";
import type { Queryable } from "../db/pool.js";

// The same reviewed identities introduced by migration 010. These inserts run
// after catalogue/listing writes as well, because a fresh migration has no
// companies to reference. Existing (including disabled) reviews are preserved.
const aliases = [
  {
    alias: "asml holding nv", ticker: "ASML", country: "NL", issuer: "ASML Holding NV", normalized: "asml holding nv", requiresListing: false,
    source: "https://www.asml.com/en/investors/shares",
    note: "Issuer share-listings table confirms NASDAQ ticker ASML. This V2 override supplies a venue missing from the legacy catalogue; issuer country remains Netherlands.",
    identifiers: { isin: "USN070592100", cusip: "N07059210", security: "registered NASDAQ ordinary shares" },
  },
  {
    alias: "alphabet inc class a", ticker: "GOOGL", country: "US", issuer: "Alphabet Inc", normalized: "alphabet", requiresListing: true,
    source: "https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/R1.htm",
    note: "Alphabet issuer filing for quarter ended 2026-06-30 identifies GOOGL as Class A Common Stock on NASDAQ. Class C GOOG is a different security and is not covered by this alias.",
    identifiers: { cik: "0001652044", security: "Class A Common Stock", filing_period: "2026-06-30" },
  },
];

export async function seedIdentityAliases(client: Queryable = pool): Promise<number> {
  let inserted = 0;
  for (const alias of aliases) {
    const result = await client.query(`
      INSERT INTO news_v2_company_aliases(alias_name_normalized,ticker,mic,issuer_country,company_id,issuer_name_normalized,
        requires_catalogue_listing,source_url,checked_at,valid_until,evidence_note,external_identifiers)
      SELECT $1,$2,'XNAS',$3,c.id,$5,$6,$7,DATE '2026-09-09',DATE '2027-09-09',$8,$9::jsonb
      FROM companies c WHERE c.is_active AND c.ticker_raw=$2 AND c.company_name=$4 AND c.country_raw=$3
      AND (SELECT count(*) FROM companies x WHERE x.is_active AND x.ticker_raw=$2 AND x.company_name=$4 AND x.country_raw=$3)=1
      AND (NOT $6::boolean OR EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND upper(l.symbol)=$2 AND upper(l.mic)='XNAS'))
      AND NOT EXISTS(SELECT 1 FROM listings l JOIN companies other ON other.id=l.company_id
        WHERE other.is_active AND upper(l.symbol)=$2 AND upper(l.mic)='XNAS' AND lower(other.company_name)<>lower(c.company_name))
      ON CONFLICT DO NOTHING`, [alias.alias, alias.ticker, alias.country, alias.issuer, alias.normalized,
      alias.requiresListing, alias.source, alias.note, JSON.stringify(alias.identifiers)]);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}
