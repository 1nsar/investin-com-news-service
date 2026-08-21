import { config } from "../config/index.js";
import { pool } from "../db/pool.js";
import { logger } from "../util/logger.js";
import { runIngestExclusive } from "./runner.js";

/** Optional in-process daily timer.
 *
 *  Off by default, and that default is a recommendation. Running the ingest
 *  from an external scheduler (cron, a Kubernetes CronJob, a platform
 *  scheduler) keeps two failure modes apart: a crashed API server should not
 *  silently stop the daily fetch, and a stuck fetch should not take the API
 *  down with it.
 *
 *  When it is enabled, a Postgres advisory lock keeps several replicas from
 *  fetching the same catalogue at the same time - the in-process guard alone
 *  cannot see other containers. */

const SCHEDULER_LOCK_ID = 472_913_005;
let timer: NodeJS.Timeout | undefined;

/** Minimal 5-field cron matcher: "0 6 * * *", plus lists, ranges and steps. */
function matchesField(field: string, value: number, min: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!range) return false;
    // Steps count from the field's minimum, not from zero: "*/3" on months is
    // Jan/Apr/Jul/Oct, and on day-of-month is the 1st/3rd/5th. Using `value %
    // step` silently shifted both by one interval.
    if (range === "*") return (value - min) % step === 0;
    const [startText, endText] = range.split("-");
    const start = Number(startText);
    const end = endText === undefined ? start : Number(endText);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return value >= start && value <= end && (value - start) % step === 0;
  });
}

export function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];
  return (
    matchesField(minute, date.getMinutes(), 0) &&
    matchesField(hour, date.getHours(), 0) &&
    matchesField(dayOfMonth, date.getDate(), 1) &&
    matchesField(month, date.getMonth() + 1, 1) &&
    matchesField(dayOfWeek, date.getDay(), 0)
  );
}

async function tick(): Promise<void> {
  const now = new Date();
  if (!cronMatches(config.SCHEDULER_CRON, now)) return;

  // Advisory locks are SESSION-scoped, so the lock, the work and the unlock
  // must all happen on ONE dedicated connection.
  //
  // Using `pool.query` for this is a subtle and serious bug: each call takes
  // whichever pooled client is free, so the unlock lands on a different
  // backend, fails, and is swallowed. The locking session then keeps the lock
  // forever and every later tick logs "another instance holds the lock" - the
  // scheduled ingest stops running, silently. Worse, an idle-timeout on the
  // locking client mid-run would release the lock and let a second replica
  // start a concurrent full-catalogue fetch.
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [SCHEDULER_LOCK_ID],
    );
    if (!rows[0]?.locked) {
      logger.info("scheduled ingest skipped: another instance holds the lock");
      return;
    }

    try {
      logger.info({ cron: config.SCHEDULER_CRON }, "scheduled ingest starting");
      await runIngestExclusive({ trigger: "schedule" });
    } catch (error) {
      logger.error({ err: error }, "scheduled ingest failed");
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_LOCK_ID]).catch(() => undefined);
    }
  } finally {
    // Releasing the client also drops any lock it still holds.
    client.release();
  }
}

export function startScheduler(): void {
  if (timer) return;
  logger.info({ cron: config.SCHEDULER_CRON }, "in-process scheduler enabled");
  // Once a minute is enough for a daily job and keeps the matcher simple.
  timer = setInterval(() => void tick(), 60_000);
  timer.unref();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
