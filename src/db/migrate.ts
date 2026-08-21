import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, pool, waitForDatabase } from "./pool.js";
import { logger } from "../util/logger.js";
import { isMainModule } from "../util/main.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

/** Plain forward-only migrations, applied in filename order inside one
 *  transaction each, tracked in `schema_migrations`. An advisory lock makes it
 *  safe when several containers boot at once - which is exactly how the
 *  duplicate-column race in the earlier prototype happened. */
export async function migrate(): Promise<string[]> {
  await waitForDatabase();

  const client = await pool.connect();
  const applied: string[] = [];
  try {
    // The lock is taken FIRST, before any DDL at all.
    //
    // `CREATE TABLE IF NOT EXISTS` is not safe under concurrency: the check
    // and the create are not atomic, so several processes booting together
    // race in the Postgres type catalog and all but one fail with
    // "duplicate key value violates unique constraint pg_type_typname_nsp_index".
    // Creating the bookkeeping table before acquiring the lock reintroduced
    // exactly the startup race this lock exists to prevent - three concurrent
    // migrators, two crashed containers.
    await client.query("SELECT pg_advisory_lock($1)", [472_913_004]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const done = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
        (row) => row.name,
      ),
    );
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      logger.info({ migration: file }, "applying migration");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [472_913_004]).catch(() => undefined);
    client.release();
  }

  logger.info(
    { applied: applied.length },
    applied.length ? `applied ${applied.join(", ")}` : "schema already up to date",
  );
  return applied;
}

// Allow `npm run migrate` as well as importing it from setup.
if (isMainModule(import.meta.url)) {
  migrate()
    .then(closePool)
    .catch(async (error) => {
      logger.error({ err: error }, "migration failed");
      await closePool();
      process.exit(1);
    });
}
