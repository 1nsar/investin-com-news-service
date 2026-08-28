import "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config/index.js";
import { pool } from "../../db/pool.js";
import { isIngestRunning, runIngestExclusive } from "../../ingest/runner.js";
import { companiesForFetch } from "../../ingest/store.js";
import { getProviders } from "../../providers/registry.js";
import {
  getRun,
  latestRun,
  listRuns,
  runCompanyRows,
  runFallthroughs,
  runProviderBreakdown,
} from "../../observability/runs.js";
import { serviceCounts } from "../repository.js";

const FetchBody = z.object({
  tickers: z.array(z.string().trim().min(1)).max(500).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
  lookbackDays: z.number().int().min(1).max(30).optional(),
  ignoreSuppression: z.boolean().optional(),
  /** Refresh tier, so a scheduler can hit busy companies more often. */
  tier: z.enum(["hot", "active", "quiet", "all"]).optional(),
  /** Wait for the run to finish instead of getting a run id back. Handy for a
   *  small ticker list; a full-catalogue run should always be async. */
  wait: z.boolean().optional(),
});

/** Path params reach SQL as bigints. Without this, `/v1/runs/abc` produced a
 *  500 carrying the raw Postgres error and SQLSTATE 22P02 to an unauthenticated
 *  caller; it should be a plain 400. */
function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Constant-time-ish comparison so a wrong token cannot be found by timing. */
function tokenMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function operationsRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: is the process up? Deliberately free of database access so a
  // database blip does not cause an orchestrator to kill a healthy container.
  app.get("/health", { schema: { description: "Liveness probe.", tags: ["ops"] } }, async () => ({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
  }));

  // Readiness: can it actually serve? This one does touch the database.
  app.get("/ready", { schema: { description: "Readiness probe.", tags: ["ops"] } }, async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready" };
    } catch (error) {
      return reply.code(503).send({
        status: "not_ready",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/v1/status", {
    schema: {
      description: "Service state: counts, provider health, and the last run's outcome.",
      tags: ["ops"],
    },
  }, async () => {
    const [counts, run] = await Promise.all([serviceCounts(), latestRun()]);
    const breakdown = run ? await runProviderBreakdown(run.id) : [];
    // A provider that failed but was covered by a fallback still produced a
    // clean-looking run. Surfacing it is the whole point.
    const fallthroughs = run ? await runFallthroughs(run.id) : [];

    // A run that finished long ago is the quiet failure mode this endpoint
    // exists to expose: nothing is erroring, the data is simply going stale.
    const hoursSinceRun = run?.finished_at
      ? (Date.now() - new Date(run.finished_at).getTime()) / 3_600_000
      : null;

    return {
      service: "company-news-component",
      counts,
      providers: getProviders().map((provider) => ({
        name: provider.name,
        label: provider.label,
        configured: provider.isConfigured(),
        rateLimit: provider.limiter.snapshot,
      })),
      providerOrder: config.providerOrder,
      ingestRunning: isIngestRunning(),
      lastRun: run
        ? {
            id: run.id,
            status: run.status,
            trigger: run.trigger,
            startedAt: run.started_at,
            finishedAt: run.finished_at,
            durationMs: run.duration_ms,
            hoursSinceFinished: hoursSinceRun === null ? null : Number(hoursSinceRun.toFixed(1)),
            stale: hoursSinceRun !== null && hoursSinceRun > 36,
            outcomes: {
              total: run.companies_total,
              ok: run.companies_ok,
              noNews: run.companies_no_news,
              refused: run.companies_refused,
              failed: run.companies_failed,
              unresolved: run.companies_unresolved,
            },
            articles: {
              seen: run.articles_seen,
              new: run.articles_new,
              // Dropped by the relevance gate: not duplicates, and not stored.
              // A company with 0 articles and a high count here was filtered,
              // not quiet.
              rejected: run.articles_rejected,
            },
            byProvider: breakdown,
            degradedProviders: fallthroughs,
            error: run.error,
          }
        : null,
    };
  });

  app.post("/v1/fetch", {
    schema: {
      description: "Trigger a fetch on demand. Returns a run id immediately unless wait=true.",
      tags: ["ops"],
    },
  }, async (request, reply) => {
    // The only endpoint that does real outbound work, so it is the only one
    // worth protecting. Unset by default: the component is designed to sit
    // behind a gateway, and requiring a token out of the box would break the
    // documented one-command start.
    if (config.API_AUTH_TOKEN) {
      const header = request.headers.authorization ?? "";
      const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!tokenMatches(provided, config.API_AUTH_TOKEN)) {
        return reply.code(401).send({ error: "unauthorized", detail: "valid bearer token required" });
      }
    }

    const parsed = FetchBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", detail: parsed.error.issues });
    }
    if (isIngestRunning()) {
      return reply.code(409).send({ error: "already_running", detail: "an ingest is already in progress" });
    }

    // A run over zero companies is recorded as `succeeded`, so an integrator
    // who typos a ticker - or asks for a tier the ticker is not in - would get
    // 202s and green runs forever while nothing was ever fetched. Silence that
    // looks like success is the exact failure mode the run reporting exists to
    // prevent, so an empty selection is rejected before a run is created.
    //
    // The check runs `companiesForFetch` itself rather than reimplementing its
    // WHERE clause. An earlier version duplicated the ticker predicate, which
    // left `tier` unvalidated: `{"tickers":["MSFT"],"tier":"quiet"}` passed the
    // check and then selected nothing.
    if (parsed.data.tickers?.length || parsed.data.tier) {
      const selected = await companiesForFetch(parsed.data);

      if (parsed.data.tickers?.length) {
        const known = new Set(selected.map((company) => company.ticker));
        const unknown = parsed.data.tickers.filter((ticker) => !known.has(ticker));
        if (unknown.length) {
          // Distinguish "no such ticker" from "excluded by the tier filter",
          // because the caller fixes them differently.
          const { rows } = await pool.query<{ ticker_raw: string }>(
            "SELECT ticker_raw FROM companies WHERE is_active AND ticker_raw = ANY($1::text[])",
            [unknown],
          );
          const existing = new Set(rows.map((row) => row.ticker_raw));
          const absent = unknown.filter((ticker) => !existing.has(ticker));
          const filtered = unknown.filter((ticker) => existing.has(ticker));

          return reply.code(400).send({
            error: absent.length ? "unknown_tickers" : "no_companies_selected",
            detail: [
              absent.length ? `not in the catalogue: ${absent.join(", ")}` : "",
              filtered.length
                ? `excluded by tier "${parsed.data.tier}": ${filtered.join(", ")}`
                : "",
            ].filter(Boolean).join("; "),
            ...(absent.length ? { unknown: absent } : {}),
            ...(filtered.length ? { excludedByTier: filtered } : {}),
          });
        }
      } else if (selected.length === 0) {
        return reply.code(400).send({
          error: "no_companies_selected",
          detail: `tier "${parsed.data.tier}" matches no companies right now`,
        });
      }
    }

    const options = { ...parsed.data, trigger: "api" as const };

    if (parsed.data.wait) {
      const result = await runIngestExclusive(options);
      return { data: result };
    }

    // Fire and forget: a full-catalogue run outlives any sensible HTTP
    // timeout, so the caller gets an id and polls /v1/runs/:id.
    runIngestExclusive(options).catch((error) => {
      app.log.error({ err: error }, "triggered ingest failed");
    });
    return reply.code(202).send({
      status: "accepted",
      detail: "ingest started; poll /v1/runs/latest for progress",
    });
  });

  app.get("/v1/runs", {
    schema: { description: "Recent fetch runs, newest first.", tags: ["ops"] },
  }, async (request) => {
    const { limit = "20", offset = "0" } = request.query as Record<string, string>;
    return { data: await listRuns(Math.min(Number(limit) || 20, 100), Number(offset) || 0) };
  });

  app.get("/v1/runs/latest", {
    schema: { description: "The most recent run, with its provider breakdown.", tags: ["ops"] },
  }, async (_request, reply) => {
    const run = await latestRun();
    if (!run) return reply.code(404).send({ error: "not_found", detail: "no runs yet" });
    return {
      data: {
        ...run,
        byProvider: await runProviderBreakdown(run.id),
        degradedProviders: await runFallthroughs(run.id),
      },
    };
  });

  app.get("/v1/runs/:id", {
    schema: { description: "One run, with its provider breakdown.", tags: ["ops"] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const runId = parseId(id);
    if (runId === null) {
      return reply.code(400).send({ error: "invalid_id", detail: `run id must be a positive integer, got '${id}'` });
    }
    const run = await getRun(runId);
    if (!run) return reply.code(404).send({ error: "not_found", detail: `no run ${id}` });
    return {
      data: {
        ...run,
        byProvider: await runProviderBreakdown(run.id),
        degradedProviders: await runFallthroughs(run.id),
      },
    };
  });

  app.get("/v1/runs/:id/companies", {
    schema: {
      description:
        "Per-company outcomes for a run. Filter by outcome to separate 'no_news' from 'refused'.",
      tags: ["ops"],
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { outcome, limit = "200", offset = "0" } = request.query as Record<string, string>;
    const runId = parseId(id);
    if (runId === null) {
      return reply.code(400).send({ error: "invalid_id", detail: `run id must be a positive integer, got '${id}'` });
    }
    const run = await getRun(runId);
    if (!run) return reply.code(404).send({ error: "not_found", detail: `no run ${id}` });
    return {
      data: await runCompanyRows(runId, {
        outcome,
        limit: Math.min(Number(limit) || 200, 2000),
        offset: Number(offset) || 0,
      }),
    };
  });
}
