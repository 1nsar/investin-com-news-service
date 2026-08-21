import { config } from "../config/index.js";
import { getProviders } from "../providers/registry.js";
import type { FetchableCompany, NewsProvider, ProviderOutcome } from "../providers/types.js";
import { mapWithConcurrency, withTimeout } from "../util/async.js";
import { logger } from "../util/logger.js";
import { canonicalize } from "./canonicalize.js";
import {
  companiesForFetch,
  loadFetchState,
  recordFetchState,
  storeArticles,
  type FetchStateRow,
  type RefreshTier,
} from "./store.js";
import {
  finishRun,
  recordCompanyOutcome,
  startRun,
  type CompanyOutcome,
  type ProviderAttempt,
  type RunTotals,
  type RunTrigger,
} from "../observability/runs.js";

/** The ingest.
 *
 *  For each company it walks the configured provider order and uses the first
 *  provider that says it can serve that company. A provider that returns
 *  nothing useful hands off to the next one, so a US company normally costs a
 *  single Finnhub call while a foreign company without a US line falls through
 *  to name-based search.
 *
 *  Three properties the brief asks for are structural here rather than
 *  incidental:
 *
 *    - Partial failures are isolated. Every company is wrapped so a throw
 *      becomes an `error` outcome for that company and nothing else.
 *    - Re-running is safe. The window overlaps the previous run and storage
 *      deduplicates, so a crash halfway through costs a repeat, not a gap.
 *    - "No news" and "refused" never merge. They travel as separate outcomes
 *      from the provider all the way to the status endpoint. */

export interface IngestOptions {
  trigger?: RunTrigger;
  /** Restrict to these catalogue tickers. */
  tickers?: string[];
  limit?: number;
  /** Ignore stored state and re-fetch this many days for every company. */
  lookbackDays?: number;
  /** Fetch companies even while they are backed off. */
  ignoreSuppression?: boolean;
  /** Restrict to a refresh tier, so a scheduler can run the busiest companies
   *  often and the quiet ones rarely. Defaults to the whole catalogue. */
  tier?: RefreshTier;
}

export interface IngestResult extends RunTotals {
  runId: number;
  durationMs: number;
  byProvider: Record<string, number>;
}

/** Where to resume for one company: last success minus an overlap, or the
 *  initial lookback the first time we ever see it. The overlap is what stops
 *  an article published while a run was in flight from being missed forever. */
function windowFor(state: FetchStateRow | undefined, lookbackDays: number | undefined): { from: Date; to: Date } {
  const to = new Date();
  if (lookbackDays) {
    return { from: new Date(to.getTime() - lookbackDays * 86_400_000), to };
  }
  if (state?.lastSuccessAt) {
    const from = new Date(state.lastSuccessAt.getTime() - config.INGEST_OVERLAP_HOURS * 3_600_000);
    // Never let a long outage turn into an unbounded backfill.
    const floor = new Date(to.getTime() - 30 * 86_400_000);
    return { from: from > floor ? from : floor, to };
  }
  return { from: new Date(to.getTime() - config.INGEST_INITIAL_LOOKBACK_DAYS * 86_400_000), to };
}

function outcomeOf(result: ProviderOutcome): CompanyOutcome {
  switch (result.kind) {
    case "ok": return "ok";
    case "no_news": return "no_news";
    case "refused": return "refused";
    case "rate_limited": return "rate_limited";
    case "error": return "error";
    case "unsupported": return "skipped";
  }
}

interface CompanyRunResult {
  outcome: CompanyOutcome;
  provider: string | null;
  articlesSeen: number;
  articlesNew: number;
  articlesRejected: number;
}

async function ingestCompany(
  company: FetchableCompany,
  providers: NewsProvider[],
  state: Map<string, FetchStateRow>,
  options: IngestOptions,
  runId: number,
): Promise<CompanyRunResult> {
  const startedAt = Date.now();

  if (company.listings.length === 0) {
    await recordCompanyOutcome({
      runId,
      companyId: company.id,
      provider: null,
      symbolUsed: null,
      outcome: "unresolved",
      error: "no resolved listing; run the resolver",
      durationMs: Date.now() - startedAt,
    });
    return { outcome: "unresolved", provider: null, articlesSeen: 0, articlesNew: 0, articlesRejected: 0 };
  }

  // Remember why each provider declined, so a company that nobody serves has
  // an explanation rather than a bare zero.
  const declined: string[] = [];
  // Every provider actually called, in order. Recorded even when a later
  // provider succeeds, so a primary that has quietly stopped working is
  // visible in the run instead of being masked by the fallback.
  const attempts: ProviderAttempt[] = [];
  let lastFailure: { outcome: CompanyOutcome; provider: string; message: string; status?: number } | null = null;

  for (const provider of providers) {
    const capability = provider.supports(company);
    if (!capability.supported) {
      declined.push(`${provider.name}: ${capability.reason ?? "unsupported"}`);
      continue;
    }

    const key = `${company.id}:${provider.name}`;
    const companyState = state.get(key);
    if (!options.ignoreSuppression && companyState?.suppressedUntil && companyState.suppressedUntil > new Date()) {
      declined.push(`${provider.name}: backed off until ${companyState.suppressedUntil.toISOString()}`);
      continue;
    }

    const { from, to } = windowFor(companyState, options.lookbackDays);

    const attemptStartedAt = Date.now();
    let result: ProviderOutcome;
    try {
      // Generous on purpose. This is the guard against a provider that never
      // returns; it is NOT the per-request timeout (that lives in the HTTP
      // layer). A company's elapsed time also includes waiting for our own
      // rate-limiter token, so a tight value here makes a healthy provider
      // look like it failed and quietly downgrades the company to a fallback.
      result = await withTimeout(
        provider.fetch({ company, from, to }),
        config.INGEST_COMPANY_TIMEOUT_MS,
        `${provider.name}/${company.ticker}`,
      );
    } catch (error) {
      result = { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }

    const outcome = outcomeOf(result);
    attempts.push({
      provider: provider.name,
      outcome,
      ms: Date.now() - attemptStartedAt,
      symbol: "symbolUsed" in result ? result.symbolUsed ?? null : null,
      error: "message" in result ? result.message.slice(0, 300) : null,
    });

    if (result.kind === "ok") {
      const canonical = result.articles
        .map((article) => canonicalize(article, provider.name))
        .filter((article): article is NonNullable<typeof article> => article !== null);

      const stored = await storeArticles(
        company.id,
        provider.name,
        result.matchMethod,
        result.listingId,
        canonical,
        company.companyName,
      );

      if (stored.rejected > 0) {
        logger.info(
          { ticker: company.ticker, provider: provider.name, rejected: stored.rejected },
          "articles rejected as not about this company",
        );
      }

      const newest = canonical.reduce<Date | null>(
        (latest, article) => (!latest || article.publishedAt > latest ? article.publishedAt : latest),
        null,
      );
      await recordFetchState(company.id, provider.name, "ok", newest);
      await recordCompanyOutcome({
        runId,
        companyId: company.id,
        provider: provider.name,
        symbolUsed: result.symbolUsed,
        outcome: "ok",
        articlesSeen: stored.seen,
        articlesNew: stored.inserted,
        articlesRejected: stored.rejected,
        durationMs: Date.now() - startedAt,
        providerAttempts: attempts,
      });
      return {
        outcome: "ok",
        provider: provider.name,
        articlesSeen: stored.seen,
        articlesNew: stored.inserted,
        articlesRejected: stored.rejected,
      };
    }

    if (result.kind === "no_news") {
      // A clean zero is a real answer. Record it and stop: asking a weaker
      // provider afterwards would trade a confident "quiet week" for a
      // name-matched guess.
      await recordFetchState(company.id, provider.name, "no_news", null);
      await recordCompanyOutcome({
        runId,
        companyId: company.id,
        provider: provider.name,
        symbolUsed: result.symbolUsed,
        outcome: "no_news",
        durationMs: Date.now() - startedAt,
        providerAttempts: attempts,
      });
      return { outcome: "no_news", provider: provider.name, articlesSeen: 0, articlesNew: 0, articlesRejected: 0 };
    }

    if (result.kind === "unsupported") {
      declined.push(`${provider.name}: ${result.reason}`);
      continue;
    }

    // refused / rate_limited / error: remember it and try the next provider.
    await recordFetchState(company.id, provider.name, outcome, null);
    lastFailure = {
      outcome,
      provider: provider.name,
      message: "message" in result ? result.message : outcome,
      status: result.kind === "refused" ? result.httpStatus : undefined,
    };
    logger.debug(
      { ticker: company.ticker, provider: provider.name, outcome },
      "provider failed; trying next",
    );
  }

  if (lastFailure) {
    await recordCompanyOutcome({
      runId,
      companyId: company.id,
      provider: lastFailure.provider,
      symbolUsed: null,
      outcome: lastFailure.outcome,
      httpStatus: lastFailure.status ?? null,
      error: lastFailure.message,
      durationMs: Date.now() - startedAt,
      providerAttempts: attempts,
    });
    return { outcome: lastFailure.outcome, provider: lastFailure.provider, articlesSeen: 0, articlesNew: 0, articlesRejected: 0 };
  }

  await recordCompanyOutcome({
    runId,
    companyId: company.id,
    provider: null,
    symbolUsed: null,
    outcome: "skipped",
    error: declined.join("; ").slice(0, 1000) || "no provider could serve this company",
    durationMs: Date.now() - startedAt,
    providerAttempts: attempts,
  });
  return { outcome: "skipped", provider: null, articlesSeen: 0, articlesNew: 0, articlesRejected: 0 };
}

export async function runIngest(options: IngestOptions = {}): Promise<IngestResult> {
  const providers = getProviders();
  const trigger = options.trigger ?? "manual";
  const limit = options.limit ?? (config.INGEST_MAX_COMPANIES || undefined);

  const companies = await companiesForFetch({
    limit,
    tickers: options.tickers,
    tier: options.tier,
  });
  const state = await loadFetchState();

  const runId = await startRun(trigger, {
    providers: providers.map((provider) => provider.name),
    companies: companies.length,
    lookbackDays: options.lookbackDays ?? null,
    tier: options.tier ?? "all",
  });

  logger.info(
    {
      runId,
      companies: companies.length,
      tier: options.tier ?? "all",
      providers: providers.map((p) => p.name),
      concurrency: config.INGEST_CONCURRENCY,
    },
    "ingest started",
  );

  const totals: RunTotals = {
    companiesTotal: companies.length,
    companiesOk: 0,
    companiesNoNews: 0,
    companiesRefused: 0,
    companiesFailed: 0,
    companiesUnresolved: 0,
    articlesSeen: 0,
    articlesNew: 0,
    articlesRejected: 0,
  };
  const byProvider: Record<string, number> = {};
  const startedAt = Date.now();
  let fatal: string | null = null;

  try {
    let completed = 0;
    await mapWithConcurrency(companies, config.INGEST_CONCURRENCY, async (company) => {
      let result: CompanyRunResult;
      try {
        result = await ingestCompany(company, providers, state, options, runId);
      } catch (error) {
        // The last line of defence: one company must never sink the run.
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, ticker: company.ticker }, "company ingest threw");
        await recordCompanyOutcome({
          runId,
          companyId: company.id,
          provider: null,
          symbolUsed: null,
          outcome: "error",
          error: message,
        }).catch(() => undefined);
        result = { outcome: "error", provider: null, articlesSeen: 0, articlesNew: 0, articlesRejected: 0 };
      }

      switch (result.outcome) {
        case "ok": totals.companiesOk += 1; break;
        case "no_news": totals.companiesNoNews += 1; break;
        case "refused": totals.companiesRefused += 1; break;
        case "unresolved": totals.companiesUnresolved += 1; break;
        case "error":
        case "rate_limited": totals.companiesFailed += 1; break;
        default: break;
      }
      totals.articlesSeen += result.articlesSeen;
      totals.articlesNew += result.articlesNew;
      totals.articlesRejected += result.articlesRejected;
      if (result.provider) byProvider[result.provider] = (byProvider[result.provider] ?? 0) + 1;

      completed += 1;
      if (completed % 100 === 0) {
        logger.info({ runId, completed, of: companies.length, articlesNew: totals.articlesNew }, "ingest progress");
      }
    });
  } catch (error) {
    fatal = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, runId }, "ingest failed");
  }

  await finishRun(runId, totals, fatal);
  const durationMs = Date.now() - startedAt;
  logger.info({ runId, durationMs, ...totals, byProvider }, "ingest finished");

  return { runId, durationMs, byProvider, ...totals };
}

/** Guard against two ingests overlapping in one process. Cross-process safety
 *  comes from the database advisory lock taken by the scheduler. */
let inFlight: Promise<IngestResult> | null = null;

export function isIngestRunning(): boolean {
  return inFlight !== null;
}

export async function runIngestExclusive(options: IngestOptions = {}): Promise<IngestResult> {
  if (inFlight) throw new Error("an ingest is already running");
  inFlight = runIngest(options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
