import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../src/api/server.js";
import { isVercelRuntime } from "../../src/config/runtime.js";
import { pool, query, queryOne, transaction } from "../../src/db/pool.js";
import { ingestInProgress, runIngestExclusive } from "../../src/features/global-news/ingest/runner.js";
import { fetchProviderBatch } from "../../src/features/global-news-v2/providers/index.js";
import { startV2Worker, stopV2Worker, workerEnabled } from "../../src/features/global-news-v2/worker.js";

vi.mock("../../src/db/pool.js", () => ({
  pool: { query: vi.fn() }, query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn(),
  closePool: vi.fn(), waitForDatabase: vi.fn(),
}));
vi.mock("../../src/features/global-news/ingest/runner.js", () => ({
  ingestInProgress: vi.fn(), runIngestExclusive: vi.fn(),
}));
vi.mock("../../src/features/global-news-v2/providers/index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/features/global-news-v2/providers/index.js")>(),
  fetchProviderBatch: vi.fn(),
}));
vi.mock("../../src/util/logger.js", async () => ({
  logger: (await import("pino")).default({ level: "silent" }),
}));

const environment = {
  NODE_ENV: "production", VERCEL: "1",
  DATABASE_URL: "postgres://synthetic:synthetic@database.example/news_test",
  NEWS_V2_ADMIN_TOKEN: "synthetic-vercel-workspace-token-for-tests",
  NEWS_V2_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
  NEWS_V2_ALLOW_PAID_PROVIDERS: "true", NEWS_V2_ONLY: "false",
  NEWS_V2_WORKER_ENABLED: "true", SCHEDULER_ENABLED: "false",
};
const headers = { authorization: `Bearer ${environment.NEWS_V2_ADMIN_TOKEN}` };
let app: Awaited<ReturnType<typeof buildServer>> | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  vi.mocked(query).mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected outbound request in Vercel test."); }));
});

afterEach(async () => {
  await stopV2Worker();
  await app?.close(); app = undefined;
  expect(fetch).not.toHaveBeenCalled();
  expect(fetchProviderBatch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("Vercel worker isolation", () => {
  it.each([undefined, "", "0", "true"])("preserves normal worker opt-in without the Vercel runtime marker (%s)", (marker) => {
    vi.stubEnv("VERCEL", marker);
    expect(isVercelRuntime()).toBe(false);
    expect(workerEnabled()).toBe(true);
    vi.stubEnv("NEWS_V2_WORKER_ENABLED", "false");
    expect(workerEnabled()).toBe(false);
  });

  it("ignores a worker opt-in inside a Vercel instance", () => {
    expect(isVercelRuntime()).toBe(true);
    expect(workerEnabled()).toBe(false);
  });

  it.each([{}, { wait: false }, { wait: true }])("rejects legacy collection before any ingestion or database access (%j)", async (payload) => {
    app = await buildServer();
    const response = await app.inject({ method: "POST", url: "/v1/fetch", headers, payload });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "worker_required" });
    expect(ingestInProgress).not.toHaveBeenCalled();
    expect(runIngestExclusive).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(queryOne).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("persists V2 sync jobs for an external worker without starting local collection", async () => {
    const job = {
      id: "synthetic-queued-job", provider_id: "fed", status: "queued",
      created_at: new Date("2026-09-01T00:00:00Z"), pages: 0, articles_seen: 0, articles_stored: 0,
    };
    // A free official provider needs no saved credentials. Its next query is
    // the durable queue insert; no provider or worker behavior is mocked away.
    vi.mocked(queryOne).mockResolvedValueOnce(undefined).mockResolvedValueOnce(job);
    app = await buildServer();
    await app.ready();
    const intervals = vi.spyOn(globalThis, "setInterval");
    startV2Worker();
    const response = await app.inject({
      method: "POST", url: "/v2/sync", headers, payload: { providerIds: ["fed"] },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      data: [{ id: job.id, providerId: "fed", status: "queued" }], workerEnabled: false,
    });
    expect(queryOne).toHaveBeenCalledTimes(2);
    expect(queryOne).toHaveBeenLastCalledWith(expect.stringContaining("INSERT INTO news_v2_jobs"), [expect.any(String), "fed"]);
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
  });
});

describe("Vercel API access", () => {
  it("authenticates reads, docs and collection before touching the database", async () => {
    app = await buildServer();
    for (const [method, url] of [["GET", "/v1/runs"], ["GET", "/v2/companies"], ["GET", "/docs"], ["POST", "/v1/fetch"], ["POST", "/v2/sync"]] as const) {
      for (const authorization of [undefined, "Bearer wrong-token"]) {
        const response = await app.inject({ method, url, headers: authorization ? { authorization } : {} });
        expect(response.statusCode, `${method} ${url}`).toBe(401);
      }
    }
    expect(pool.query).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(queryOne).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("serves public probes and authenticated reads", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    app = await buildServer();
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect(pool.query).not.toHaveBeenCalled();
    expect((await app.inject({ method: "GET", url: "/ready" })).statusCode).toBe(200);
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    expect((await app.inject({ method: "GET", url: "/v1/runs", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v2/companies", headers })).statusCode).toBe(200);
  });
});
