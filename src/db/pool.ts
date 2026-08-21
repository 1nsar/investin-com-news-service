import pg from "pg";
import { config } from "../config/index.js";
import { logger } from "../util/logger.js";

// Postgres hands back NUMERIC as a string to protect precision. Every numeric
// column here is a count or a duration that fits a double comfortably.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  // An idle client dying is normal after a database restart; the pool replaces
  // it. Log it rather than letting it reach the unhandled-error path.
  logger.warn({ err: error }, "idle database client error");
});

export type Queryable = Pick<pg.PoolClient, "query">;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  client: Queryable = pool,
): Promise<T[]> {
  const result = await client.query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  client: Queryable = pool,
): Promise<T | undefined> {
  const rows = await query<T>(text, params, client);
  return rows[0];
}

/** Run `fn` inside a transaction, rolling back on any throw. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function waitForDatabase(attempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      logger.info({ attempt }, "waiting for database");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
