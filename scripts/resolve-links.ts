import { closePool, pool } from "../src/db/pool.js";
import { canonicalizeUrl, dedupeHash } from "../src/ingest/canonicalize.js";
import { isDeadHost } from "../src/ingest/deadHosts.js";
import { resolveWrappers } from "../src/ingest/resolveRedirect.js";
import { logger } from "../src/util/logger.js";

/** One-off backfill: replace stored redirect wrappers with the publisher URL.
 *
 *  Articles ingested before link resolution existed carry Finnhub's
 *  `finnhub.io/api/news?id=...` wrapper. This walks them in batches, resolves
 *  each to its real destination, and rewrites the row.
 *
 *  Three cases need care:
 *    - the destination is a dead host  -> delete the article (cascades)
 *    - the destination collides with an article we already have -> MERGE, do
 *      not drop: the two rows may be attributed to different companies, and
 *      `dedupe_hash` is UNIQUE so a blind UPDATE would fail anyway
 *    - resolution failed -> leave the wrapper alone, it still works
 *
 *  Safe to re-run: resolved rows no longer match the wrapper predicate.
 *  `--dry-run` reports what would change without writing. */

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 200;

interface Row { id: string; url: string }

async function main(): Promise<void> {
  const stats = { seen: 0, rewritten: 0, merged: 0, dead: 0, unresolved: 0 };
  // Keyset pagination. Without it, a row that resolves but cannot be written
  // (statement timeout, a constraint added later) stays at the head of an
  // `ORDER BY id LIMIT n` window and is re-fetched over the network on every
  // pass - an infinite loop whose only symptom is traffic. Walking past it
  // means each row is attempted at most once per sweep.
  let afterId = "0";

  for (;;) {
    const { rows } = await pool.query<Row>(
      `SELECT id, url FROM articles
       WHERE url ~* '^https?://(www\\.)?finnhub\\.io/'
         AND id > $2
       ORDER BY id LIMIT $1`,
      [BATCH, afterId],
    );
    if (rows.length === 0) break;
    stats.seen += rows.length;
    afterId = rows[rows.length - 1]!.id;

    // Concurrency 3, not 10: the redirect endpoint 429s at 10-wide (30% loss
    // measured), and a backfill that silently skips rows is worse than a slow one.
    const resolved = await resolveWrappers(rows.map((r) => r.url));

    for (const row of rows) {
      const target = resolved.get(row.url);
      if (!target) {
        stats.unresolved += 1;
        continue;
      }

      if (isDeadHost(target)) {
        stats.dead += 1;
        if (!DRY_RUN) await pool.query("DELETE FROM articles WHERE id = $1", [row.id]);
        continue;
      }

      const canonical = canonicalizeUrl(target);
      const hash = dedupeHash(canonical);
      if (DRY_RUN) { stats.rewritten += 1; continue; }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM articles WHERE dedupe_hash = $1 AND id <> $2",
          [hash, row.id],
        );

        if (existing.rowCount) {
          // Same story already stored under its real URL. Move this row's
          // company attributions onto the survivor, then drop the duplicate.
          const keepId = existing.rows[0]!.id;
          await client.query(
            `INSERT INTO article_companies
               (article_id, company_id, listing_id, match_method, confidence, relevance, relevance_reason)
             SELECT $1, company_id, listing_id, match_method, confidence, relevance, relevance_reason
             FROM article_companies WHERE article_id = $2
             ON CONFLICT (article_id, company_id) DO NOTHING`,
            [keepId, row.id],
          );
          await client.query("DELETE FROM articles WHERE id = $1", [row.id]);
          stats.merged += 1;
        } else {
          await client.query(
            `UPDATE articles
             SET url = $2, url_canonical = $3, dedupe_hash = $4
             WHERE id = $1`,
            [row.id, target, canonical, hash],
          );
          stats.rewritten += 1;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        logger.warn({ id: row.id, err: error }, "could not rewrite link");
        stats.unresolved += 1;
      } finally {
        client.release();
      }
    }

    logger.info(stats, "link resolution progress");
    // A dry run reports the first batch only; say so rather than implying the
    // counts cover the whole table.
    if (DRY_RUN) {
      logger.info({ batch: BATCH }, "dry run inspects the first batch only");
      break;
    }
  }

  // Images are independent of the article URL: a live article can still carry
  // a thumbnail on a host that serves nobody.
  if (!DRY_RUN) {
    const { rows } = await pool.query<{ image_url: string; id: string }>(
      "SELECT id, image_url FROM articles WHERE image_url IS NOT NULL AND image_url <> ''",
    );
    const doomed = rows.filter((r) => isDeadHost(r.image_url)).map((r) => r.id);
    if (doomed.length) {
      await pool.query("UPDATE articles SET image_url = NULL WHERE id = ANY($1::bigint[])", [doomed]);
      logger.info({ cleared: doomed.length }, "cleared images on dead hosts");
    }
  }

  logger.info(stats, DRY_RUN ? "dry run complete (nothing written)" : "link resolution complete");
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "link resolution failed");
    await closePool();
    process.exit(1);
  });
