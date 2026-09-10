import { readFile } from "node:fs/promises";
import { z } from "zod";
import { transaction } from "../db/pool.js";
import { seedIdentityAliases } from "./identity-aliases.js";

const Row = z.object({
  catalogue_ticker: z.string().min(1), company_name: z.string().min(1),
  catalogue_country: z.string().nullable(), catalogue_exchange_hint: z.string().nullable(), catalogue_is_us_listed: z.boolean().nullable(),
  resolution_status: z.enum(["resolved", "ambiguous", "unresolved"]), resolution_note: z.string().nullable(),
  exchange_code: z.string().nullable(), mic: z.string().nullable(), symbol: z.string().nullable(),
  symbol_format: z.string().nullable(), security_kind: z.enum(["ordinary", "adr", "gdr", "depositary", "other"]).nullable(),
  listing_country: z.string().nullable(), currency: z.string().nullable(), figi: z.string().nullable(),
  share_class_figi: z.string().nullable(), isin: z.string().nullable(), is_primary: z.boolean().nullable(), is_us: z.boolean().nullable(),
  confidence: z.number().min(0).max(1).nullable(), source: z.enum(["openfigi", "finnhub_directory", "catalogue"]).nullable(),
}).superRefine((row, context) => {
  if (row.exchange_code !== null && (!row.exchange_code.trim() || !row.symbol?.trim() || !row.symbol_format || !row.security_kind || !row.source || row.confidence === null || row.is_primary === null || row.is_us === null)) {
    context.addIssue({ code: "custom", message: "Incomplete listing in snapshot." });
  }
  if (row.exchange_code === null && row.symbol !== null) context.addIssue({ code: "custom", message: "A snapshot symbol requires an exchange." });
});

export function parseListingSnapshot(value: unknown): z.infer<typeof Row>[] {
  const result = z.array(Row).min(1).max(200_000).safeParse(value);
  if (!result.success) throw new Error("The listing snapshot is invalid; no listings were imported.");
  return result.data;
}

/** Offline bootstrap only. Never replace an existing resolution or guess a
 * listing for a changed catalogue identity. Provenance remains the snapshot's
 * source; this is an import of prior evidence, not a new live verification. */
export async function importListingSnapshot(file = process.env.LISTINGS_SNAPSHOT_FILE ?? "data/listings-mapping.json") {
  const rows = parseListingSnapshot(JSON.parse(await readFile(file, "utf8")));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = groups.get(row.catalogue_ticker) ?? [];
    if (group.some((prior) => prior.company_name !== row.company_name || prior.catalogue_country !== row.catalogue_country || prior.catalogue_exchange_hint !== row.catalogue_exchange_hint || prior.catalogue_is_us_listed !== row.catalogue_is_us_listed || prior.resolution_status !== row.resolution_status)) {
      throw new Error("The listing snapshot contains conflicting company identities.");
    }
    group.push(row);
    groups.set(row.catalogue_ticker, group);
  }
  return transaction(async (client) => {
    let companiesImported = 0;
    let listingsImported = 0;
    let companiesSkipped = 0;
    for (const group of groups.values()) {
      const first = group[0]!;
      const found = await client.query<{ id: string }>(`SELECT id::text FROM companies
        WHERE is_active AND resolution_status='pending' AND ticker_raw=$1 AND company_name=$2
        AND country_raw IS NOT DISTINCT FROM $3 AND exchange_hint_raw IS NOT DISTINCT FROM $4
        AND is_us_listed_raw IS NOT DISTINCT FROM $5 FOR UPDATE`,
      [first.catalogue_ticker, first.company_name, first.catalogue_country, first.catalogue_exchange_hint, first.catalogue_is_us_listed]);
      const company = found.rows[0];
      if (!company || (await client.query("SELECT 1 FROM listings WHERE company_id=$1 LIMIT 1", [company.id])).rows.length) {
        companiesSkipped++;
        continue;
      }
      for (const row of group) {
        if (!row.exchange_code) continue;
        const inserted = await client.query(`INSERT INTO listings(company_id,exchange_code,mic,symbol,symbol_format,security_kind,
          country,currency,figi,share_class_figi,isin,is_primary,is_us,confidence,source)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
        [company.id, row.exchange_code, row.mic, row.symbol, row.symbol_format, row.security_kind, row.listing_country,
          row.currency, row.figi, row.share_class_figi, row.isin, row.is_primary, row.is_us, row.confidence, row.source]);
        listingsImported += inserted.rowCount ?? 0;
      }
      await client.query(`UPDATE companies SET resolution_status=$2, resolved_at=NULL, resolution_note=$3 WHERE id=$1`,
        [company.id, first.resolution_status, `Imported listing snapshot; no live verification performed.${first.resolution_note ? ` ${first.resolution_note}` : ""}`]);
      companiesImported++;
    }
    const aliasesInserted = await seedIdentityAliases(client);
    return { companiesImported, listingsImported, companiesSkipped, aliasesInserted };
  });
}
