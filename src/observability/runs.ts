import { query, queryOne } from "../db/pool.js";

export type CompanyOutcome =
  | "ok"
  | "no_news"
  | "refused"
  | "rate_limited"
  | "error"
  | "unresolved"
  | "skipped";

export type RunTrigger = "manual" | "api" | "schedule" | "backfill";

export interface ProviderAttempt {
  provider: string;
  outcome: CompanyOutcome;
  ms: number;
  symbol?: string | null;
  error?: string | null;
}

export interface RunTotals {
  companiesTotal: number;
  companiesOk: number;
  companiesNoNews: number;
  companiesRefused: number;
  companiesFailed: number;
  companiesUnresolved: number;
  /** No configured provider could serve the company at all. Previously fell
   *  through the totals switch and was counted nowhere. */
  companiesSkipped: number;
  articlesSeen: number;
  articlesNew: number;
  /** Links dropped by the relevance gate - not stored, and not a duplicate. */
  articlesRejected: number;
}

export async function startRun(trigger: RunTrigger, notes: Record<string, unknown> = {}): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO fetch_runs (status, trigger, notes) VALUES ('running', $1, $2) RETURNING id`,
    [trigger, JSON.stringify(notes)],
  );
  if (!row) throw new Error("could not start a fetch run");
  return row.id;
}

export async function recordCompanyOutcome(entry: {
  runId: number;
  companyId: number;
  provider: string | null;
  symbolUsed: string | null;
  outcome: CompanyOutcome;
  httpStatus?: number | null;
  articlesSeen?: number;
  articlesNew?: number;
  articlesRejected?: number;
  attempts?: number;
  durationMs?: number;
  error?: string | null;
  /** Every provider tried, in order, including ones that failed before a
   *  later provider succeeded. Without this a fallthrough is invisible. */
  providerAttempts?: ProviderAttempt[];
}): Promise<void> {
  await query(
    `INSERT INTO fetch_run_companies
       (run_id, company_id, provider, symbol_used, outcome, http_status,
        articles_seen, articles_new, attempts, duration_ms, error, provider_attempts,
        articles_rejected)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (run_id, company_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       symbol_used = EXCLUDED.symbol_used,
       outcome = EXCLUDED.outcome,
       http_status = EXCLUDED.http_status,
       articles_seen = EXCLUDED.articles_seen,
       articles_new = EXCLUDED.articles_new,
       attempts = EXCLUDED.attempts,
       duration_ms = EXCLUDED.duration_ms,
       error = EXCLUDED.error,
       provider_attempts = EXCLUDED.provider_attempts,
       articles_rejected = EXCLUDED.articles_rejected`,
    [
      entry.runId,
      entry.companyId,
      entry.provider,
      entry.symbolUsed,
      entry.outcome,
      entry.httpStatus ?? null,
      entry.articlesSeen ?? 0,
      entry.articlesNew ?? 0,
      entry.attempts ?? 1,
      entry.durationMs ?? null,
      entry.error?.slice(0, 1000) ?? null,
      JSON.stringify(entry.providerAttempts ?? []),
      entry.articlesRejected ?? 0,
    ],
  );
}

/** A run is `partial` when some companies failed but the run itself completed.
 *  Distinguishing that from `succeeded` is what lets an alert fire on
 *  degradation without firing on every quiet company. */
export async function finishRun(
  runId: number,
  totals: RunTotals,
  error?: string | null,
): Promise<void> {
  // A skipped company means no configured provider could serve it - that is a
  // coverage gap, not a clean run.
  const status = error
    ? "failed"
    : totals.companiesFailed + totals.companiesRefused + totals.companiesSkipped > 0
      ? "partial"
      : "succeeded";

  await query(
    `UPDATE fetch_runs SET
       status = $2, finished_at = now(),
       duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000,
       companies_total = $3, companies_ok = $4, companies_no_news = $5,
       companies_refused = $6, companies_failed = $7, companies_unresolved = $8,
       companies_skipped = $13,
       articles_seen = $9, articles_new = $10, error = $11,
       articles_rejected = $12
     WHERE id = $1`,
    [
      runId,
      status,
      totals.companiesTotal,
      totals.companiesOk,
      totals.companiesNoNews,
      totals.companiesRefused,
      totals.companiesFailed,
      totals.companiesUnresolved,
      totals.articlesSeen,
      totals.articlesNew,
      error ?? null,
      totals.articlesRejected,
      totals.companiesSkipped,
    ],
  );
}

export interface RunSummary {
  id: number;
  status: string;
  trigger: string;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  companies_total: number;
  companies_ok: number;
  companies_no_news: number;
  companies_refused: number;
  companies_failed: number;
  companies_unresolved: number;
  companies_skipped: number;
  articles_seen: number;
  articles_new: number;
  articles_rejected: number;
  error: string | null;
}

export async function getRun(runId: number): Promise<RunSummary | undefined> {
  return queryOne<RunSummary>("SELECT * FROM fetch_runs WHERE id = $1", [runId]);
}

export async function latestRun(): Promise<RunSummary | undefined> {
  return queryOne<RunSummary>("SELECT * FROM fetch_runs ORDER BY id DESC LIMIT 1");
}

export async function listRuns(limit = 20, offset = 0): Promise<RunSummary[]> {
  return query<RunSummary>(
    "SELECT * FROM fetch_runs ORDER BY id DESC LIMIT $1 OFFSET $2",
    [limit, offset],
  );
}

/** Per-provider outcome breakdown for one run. The shape an operator needs to
 *  answer "is a provider quietly dropping coverage?" */
export async function runProviderBreakdown(
  runId: number,
): Promise<{ provider: string | null; outcome: string; companies: number; articles_new: number }[]> {
  return query(
    `SELECT provider, outcome, count(*)::int AS companies, sum(articles_new)::int AS articles_new
       FROM fetch_run_companies WHERE run_id = $1
      GROUP BY provider, outcome ORDER BY provider, outcome`,
    [runId],
  );
}

/** Companies where a provider failed before another one succeeded. This is the
 *  silent-degradation query: the run looks healthy, but the primary source is
 *  not actually working. */
export async function runFallthroughs(
  runId: number,
): Promise<{ failed_provider: string; succeeded_provider: string | null; companies: number }[]> {
  return query(
    `SELECT attempt->>'provider' AS failed_provider,
            f.provider           AS succeeded_provider,
            count(*)::int        AS companies
       FROM fetch_run_companies f,
            LATERAL jsonb_array_elements(f.provider_attempts) AS attempt
      WHERE f.run_id = $1
        AND attempt->>'outcome' NOT IN ('ok','no_news')
      GROUP BY 1, 2 ORDER BY 3 DESC`,
    [runId],
  );
}

export async function runCompanyRows(
  runId: number,
  filters: { outcome?: string; limit?: number; offset?: number } = {},
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT c.ticker_raw AS ticker, c.company_name, f.provider, f.symbol_used,
            f.outcome, f.http_status, f.articles_seen, f.articles_new,
            f.duration_ms, f.error, f.provider_attempts, f.articles_rejected
       FROM fetch_run_companies f
       JOIN companies c ON c.id = f.company_id
      WHERE f.run_id = $1 AND ($2::text IS NULL OR f.outcome = $2)
      ORDER BY c.ticker_raw
      LIMIT $3 OFFSET $4`,
    [runId, filters.outcome ?? null, filters.limit ?? 200, filters.offset ?? 0],
  );
}
