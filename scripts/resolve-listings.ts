import { closePool, query } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { logger } from "../src/util/logger.js";
import { resolveCompanies } from "../src/resolution/resolver.js";
import { allActiveCompanies, companiesNeedingResolution, saveResolutions } from "../src/resolution/store.js";
import { loadUsDirectory } from "../src/resolution/usDirectory.js";

/** Resolve listings for the catalogue.
 *
 *   npm run resolve            resolve everything still pending
 *   npm run resolve -- --all   re-resolve the whole catalogue
 *   npm run resolve -- --limit 50
 */
async function main(): Promise<void> {
  await migrate();

  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;

  await loadUsDirectory();

  let companies = all ? await allActiveCompanies() : await companiesNeedingResolution();
  if (limit && Number.isFinite(limit)) companies = companies.slice(0, limit);

  if (companies.length === 0) {
    process.stdout.write("Nothing to resolve. Use --all to re-resolve the catalogue.\n");
    return;
  }

  const startedAt = Date.now();
  // Chunked so a long run reports progress and a failure loses one chunk, not
  // the whole catalogue.
  const CHUNK = 200;
  let resolved = 0;
  let unresolved = 0;
  let listingsWritten = 0;

  let failedChunks = 0;
  for (let offset = 0; offset < companies.length; offset += CHUNK) {
    const chunk = companies.slice(offset, offset + CHUNK);
    try {
      const results = await resolveCompanies(chunk);
      listingsWritten += await saveResolutions(results);
      resolved += results.filter((entry) => entry.status === "resolved").length;
      unresolved += results.filter((entry) => entry.status !== "resolved").length;
    } catch (error) {
      // One bad chunk must not cost the other 1,300 companies. The affected
      // rows stay 'pending' and are picked up by the next run.
      failedChunks += 1;
      logger.error(
        { err: error, chunkStart: offset, chunkSize: chunk.length },
        "chunk failed; leaving these companies pending and continuing",
      );
    }
    logger.info(
      { done: Math.min(offset + CHUNK, companies.length), of: companies.length, resolved, unresolved },
      "resolution progress",
    );
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  const [coverage] = await query<{
    total: number; with_listing: number; with_us: number; with_adr: number; with_exchange_us: number;
  }>(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.company_id = c.id))::int AS with_listing,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.company_id = c.id AND l.is_us))::int AS with_us,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.company_id = c.id AND l.security_kind IN ('adr','gdr')))::int AS with_adr,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.company_id = c.id AND l.is_us AND l.mic <> 'OOTC'))::int AS with_exchange_us
    FROM companies c WHERE c.is_active
  `);

  // Rows where the resolved identity disagrees with the catalogue's own name:
  // the ticker collisions. These are the dangerous ones - unresolved they file
  // one company's news against another.
  const corrections = await query<{ ticker_raw: string; company_name: string; resolution_note: string }>(
    `SELECT ticker_raw, company_name, resolution_note
       FROM companies
      WHERE is_active AND resolution_note LIKE 'rejected %'
      ORDER BY ticker_raw LIMIT 15`,
  );

  const line = (label: string, value: unknown) =>
    process.stdout.write(`  ${label.padEnd(38)} ${String(value)}\n`);

  process.stdout.write(`\nResolution finished in ${elapsed}s\n`);
  line("companies attempted", companies.length);
  line("resolved", resolved);
  line("unresolved", unresolved);
  line("listings written", listingsWritten);
  if (failedChunks > 0) line("chunks failed (left pending)", failedChunks);
  process.stdout.write("\nCatalogue coverage\n");
  line("companies with any listing", `${coverage?.with_listing ?? 0} / ${coverage?.total ?? 0}`);
  line("companies with a US listing", coverage?.with_us ?? 0);
  line("  of which on a US exchange", coverage?.with_exchange_us ?? 0);
  line("companies with an ADR/GDR", coverage?.with_adr ?? 0);

  if (corrections.length > 0) {
    process.stdout.write("\nTicker collisions caught by the name check\n");
    for (const row of corrections) {
      process.stdout.write(`    ${row.ticker_raw.padEnd(10)} ${row.company_name}\n      ${row.resolution_note}\n`);
    }
  }
  process.stdout.write("\n");
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "resolution failed");
    await closePool();
    process.exit(1);
  });
