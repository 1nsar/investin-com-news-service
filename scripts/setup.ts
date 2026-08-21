import { closePool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { loadCatalogue } from "../src/catalogue/loader.js";
import { resolveCompanies } from "../src/resolution/resolver.js";
import { companiesNeedingResolution, saveResolutions } from "../src/resolution/store.js";
import { logger } from "../src/util/logger.js";

/** One-shot bootstrap: migrate, load the catalogue, resolve listings.
 *
 *  This is what `docker compose up` runs before the API starts, and what a
 *  developer runs once after cloning. It is safe to re-run: migrations are
 *  tracked, the catalogue upserts, and only companies still marked pending are
 *  resolved. */
async function main(): Promise<void> {
  const startedAt = Date.now();

  await migrate();
  const catalogue = await loadCatalogue();
  logger.info(
    { parsed: catalogue.parsed, inserted: catalogue.inserted, updated: catalogue.updated },
    "catalogue ready",
  );

  const pending = await companiesNeedingResolution();
  if (pending.length === 0) {
    logger.info("all companies already resolved");
  } else {
    logger.info({ pending: pending.length }, "resolving listings");
    const CHUNK = 200;
    let failedChunks = 0;
    for (let offset = 0; offset < pending.length; offset += CHUNK) {
      const chunk = pending.slice(offset, offset + CHUNK);
      try {
        const results = await resolveCompanies(chunk);
        await saveResolutions(results);
      } catch (error) {
        // One bad chunk must not abort container startup. Those companies stay
        // 'pending' and the next `npm run resolve` picks them up; the API can
        // still come up and serve everything else.
        failedChunks += 1;
        logger.error(
          { err: error, chunkStart: offset },
          "chunk failed; leaving these companies pending and continuing",
        );
      }
      logger.info(
        { done: Math.min(offset + CHUNK, pending.length), of: pending.length },
        "resolution progress",
      );
    }
    if (failedChunks > 0) {
      logger.warn({ failedChunks }, "some companies remain unresolved; re-run `npm run resolve`");
    }
  }

  logger.info({ seconds: ((Date.now() - startedAt) / 1000).toFixed(1) }, "setup complete");
  process.stdout.write(
    "\nSetup complete. Start the API, then trigger a fetch:\n" +
      "  npm start\n" +
      "  curl -X POST localhost:8080/v1/fetch\n\n",
  );
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "setup failed");
    await closePool();
    process.exit(1);
  });
