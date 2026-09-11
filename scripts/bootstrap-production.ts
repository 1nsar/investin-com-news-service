import { bootstrapProduction } from "../src/deployment/bootstrap.js";
import { closePool } from "../src/db/pool.js";
import { logger } from "../src/util/logger.js";

bootstrapProduction().then((result) => {
  logger.info(result, "offline production bootstrap complete; start the persistent API and worker with npm start");
}).catch(() => {
  // Input errors must not echo database URLs, credentials or private records.
  logger.error("Production bootstrap failed; check configuration and the catalogue/listing snapshot.");
  process.exitCode = 1;
}).finally(closePool);
