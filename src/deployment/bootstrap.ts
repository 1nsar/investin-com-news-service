import { assertProductionConfig } from "../config/production.js";
import { migrate } from "../db/migrate.js";
import { loadCatalogue } from "../catalogue/loader.js";
import { importListingSnapshot } from "../catalogue/listing-snapshot.js";

/** A release command, never a request handler. No provider API is called and
 * no worker starts; reruns preserve stored articles, credentials and listings. */
export async function bootstrapProduction() {
  assertProductionConfig();
  const migrations = await migrate();
  const catalogue = await loadCatalogue();
  const listings = await importListingSnapshot();
  return { migrations, catalogue: { parsed: catalogue.parsed, inserted: catalogue.inserted, updated: catalogue.updated, deactivated: catalogue.deactivated }, listings };
}
