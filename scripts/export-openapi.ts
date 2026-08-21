import { writeFile } from "node:fs/promises";
import { buildServer } from "../src/api/server.js";
import { closePool } from "../src/db/pool.js";
import { logger } from "../src/util/logger.js";

/** Write the OpenAPI document to docs/openapi.json.
 *
 *   npm run export:openapi
 *
 *  The spec is generated from the routes at runtime and served at /docs, but a
 *  reviewer reading the repository should not have to start the service to see
 *  the integration contract. This commits it as a file, and regenerating it is
 *  one command so it cannot drift from the code.
 */
async function main(): Promise<void> {
  const app = await buildServer();
  await app.ready();
  const spec = app.swagger();
  await writeFile("docs/openapi.json", `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  await app.close();
  const paths = Object.keys((spec as { paths?: Record<string, unknown> }).paths ?? {});
  logger.info({ endpoints: paths.length, file: "docs/openapi.json" }, "OpenAPI document written");
}

main()
  .then(closePool)
  .catch(async (error) => {
    logger.error({ err: error }, "openapi export failed");
    await closePool();
    process.exit(1);
  });
