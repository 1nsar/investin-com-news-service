import { writeFile } from "node:fs/promises";
import { closePool, pool } from "../src/db/pool.js";
import { logger } from "../src/util/logger.js";
import { isMainModule } from "../src/util/main.js";

/** Export the coverage gaps: every catalogue row that produced no news, and
 *  why. This is the "which companies are we NOT covering, and is that our fault
 *  or the world's?" question, answered as data rather than prose.
 *
 *  `gap_reason` separates causes that need different responses:
 *    duplicate_listing_line - the same company is already covered under another
 *                             ticker; nothing is actually missing
 *    unresolved_*           - we could not identify the security at all
 *    no_news_*              - identified fine, the provider simply had nothing
 *
 *  Writes data/coverage-gaps.csv. */
export async function exportGaps(): Promise<{ rows: number; file: string }> {
  const { rows } = await pool.query<Record<string, string>>(`
    WITH covered AS (SELECT DISTINCT company_id FROM article_companies),
    resolved_names AS (
      SELECT name_normalized, min(ticker_raw) AS covered_as
      FROM companies WHERE resolution_status = 'resolved' GROUP BY name_normalized
    )
    SELECT c.ticker_raw, c.company_name, coalesce(c.country_raw,'') AS country,
           c.resolution_status,
           CASE
             WHEN c.resolution_status <> 'resolved' AND rn.covered_as IS NOT NULL
               THEN 'duplicate_listing_line'
             WHEN c.resolution_status <> 'resolved' AND c.ticker_raw ~ '^0[A-Z0-9]{3}$'
               THEN 'unresolved_london_secondary_line'
             WHEN c.resolution_status <> 'resolved' AND c.ticker_raw LIKE '%.F'
               THEN 'unresolved_frankfurt_line'
             WHEN c.resolution_status <> 'resolved' AND c.ticker_raw LIKE '%\\_%'
               THEN 'unresolved_malformed_ticker'
             WHEN c.resolution_status <> 'resolved' AND c.resolution_note LIKE 'rejected%'
               THEN 'unresolved_name_check_rejected'
             WHEN c.resolution_status <> 'resolved'
               THEN 'unresolved_absent_from_directory'
             WHEN EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us AND l.mic<>'OOTC')
               THEN 'no_news_us_exchange'
             WHEN EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND l.is_us)
               THEN 'no_news_otc_only'
             ELSE 'no_news_no_us_line'
           END AS gap_reason,
           coalesce(rn.covered_as,'') AS also_covered_as,
           coalesce(c.resolution_note,'') AS note
      FROM companies c
      LEFT JOIN covered ON covered.company_id = c.id
      LEFT JOIN resolved_names rn
        ON rn.name_normalized = c.name_normalized AND c.resolution_status <> 'resolved'
     WHERE covered.company_id IS NULL
     ORDER BY gap_reason, c.ticker_raw`);

  const headers = ["ticker","company_name","country","resolution_status","gap_reason","also_covered_as","note"];
  const escape = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [
    headers.join(","),
    ...rows.map((r) => [
      r["ticker_raw"], r["company_name"], r["country"], r["resolution_status"],
      r["gap_reason"], r["also_covered_as"], r["note"],
    ].map((v) => escape(v ?? "")).join(",")),
  ].join("\n");

  const file = "data/coverage-gaps.csv";
  await writeFile(file, `${csv}\n`, "utf8");

  const byReason = new Map<string, number>();
  for (const r of rows) byReason.set(r["gap_reason"]!, (byReason.get(r["gap_reason"]!) ?? 0) + 1);
  for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
    logger.info({ reason, companies: n }, "coverage gap");
  }
  return { rows: rows.length, file };
}

if (isMainModule(import.meta.url)) {
  exportGaps()
    .then(async ({ rows, file }) => {
      logger.info({ rows, file }, "coverage gaps exported");
      await closePool();
    })
    .catch(async (error) => {
      logger.error({ err: error }, "gap export failed");
      await closePool();
      process.exit(1);
    });
}
