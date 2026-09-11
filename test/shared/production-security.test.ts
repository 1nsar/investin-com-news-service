import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../src/api/server.js";
import { assertProductionConfig, paidProvidersAllowed } from "../../src/config/production.js";
import { pool, query, queryOne, transaction } from "../../src/db/pool.js";
import { encryptCredentials } from "../../src/features/global-news-v2/security.js";
import { providerConfig, updateProvider } from "../../src/features/global-news-v2/store.js";
import { MarketNewsSource } from "../../src/features/global-news/providers/marketNews.js";
import { getProviders } from "../../src/features/global-news/providers/registry.js";

vi.mock("../../src/db/pool.js", () => ({
  pool: { query: vi.fn() }, query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn(), closePool: vi.fn(), waitForDatabase: vi.fn(),
}));
vi.mock("../../src/util/logger.js", async () => ({ logger: (await import("pino")).default({ level: "silent" }) }));

const environment = {
  NODE_ENV: "production", DATABASE_URL: "postgres://synthetic:synthetic@database.example/news_test?sslmode=verify-full",
  NEWS_V2_ADMIN_TOKEN: "synthetic-workspace-token-for-tests-only",
  NEWS_V2_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
  NEWS_V2_ALLOW_PAID_PROVIDERS: "false", NEWS_V2_ONLY: "false", NEWS_V2_WORKER_ENABLED: "false", SCHEDULER_ENABLED: "false",
};
let app: Awaited<ReturnType<typeof buildServer>> | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  vi.mocked(query).mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected outbound request."); }));
});
afterEach(async () => {
  await app?.close(); app = undefined;
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("production configuration", () => {
  it("accepts a complete production configuration and both documented key encodings", () => {
    expect(() => assertProductionConfig(environment)).not.toThrow();
    expect(() => assertProductionConfig({ ...environment, NEWS_V2_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("hex") })).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
  });
  it.each(["DATABASE_URL", "NEWS_V2_ADMIN_TOKEN", "NEWS_V2_ENCRYPTION_KEY"])("rejects missing %s without echoing secrets", (name) => {
    expect(() => assertProductionConfig({ ...environment, [name]: "" })).toThrow(name);
    try { assertProductionConfig({ ...environment, [name]: "" }); }
    catch (error) { expect(String(error)).not.toContain(environment.NEWS_V2_ADMIN_TOKEN); expect(String(error)).not.toContain(environment.DATABASE_URL); }
  });
  it.each([
    ["DATABASE_URL", "https://synthetic:private@database.example/news"],
    ["DATABASE_URL", "postgres://database.example/"],
    ["NEWS_V2_ADMIN_TOKEN", "short"],
    ["NEWS_V2_ADMIN_TOKEN", "synthetic-token-containing spaces-in-value"],
    ["NEWS_V2_ENCRYPTION_KEY", "invalid-key"],
    ["NEWS_V2_ENCRYPTION_KEY", Buffer.alloc(31, 17).toString("base64")],
    ["NEWS_V2_ONLY", "TRUE"],
    ["NEWS_V2_ALLOW_PAID_PROVIDERS", "yes"],
    ["SCHEDULER_ENABLED", "true"],
  ])("rejects invalid %s (%#)", (name, value) => {
    expect(() => assertProductionConfig({ ...environment, [name]: value })).toThrow(name === "SCHEDULER_ENABLED" ? "SCHEDULER_ENABLED" : name);
  });
  it("defaults production paid access off while preserving local development", () => {
    expect(paidProvidersAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(paidProvidersAllowed({ NODE_ENV: "production", NEWS_V2_ALLOW_PAID_PROVIDERS: "true" })).toBe(true);
    expect(paidProvidersAllowed({ NODE_ENV: "development" })).toBe(true);
  });
});

describe("hosted backend authorization", () => {
  it("protects V1/V2 reads, administration, docs and unknown paths before accessing data", async () => {
    app = await buildServer();
    const routes = [
      ["GET", "/v1/status"], ["GET", "/v1/companies"], ["GET", "/v1/news"], ["GET", "/v1/runs"], ["POST", "/v1/fetch"],
      ["GET", "/v2/news"], ["GET", "/v2/status"], ["PUT", "/v2/providers/benzinga"], ["DELETE", "/v2/providers/benzinga"], ["POST", "/v2/sync"],
      ["GET", "/docs"], ["GET", "/docs/json"], ["GET", "/health/private"], ["POST", "/health"],
    ] as const;
    for (const [method, url] of routes) {
      for (const headers of [{}, { authorization: "Bearer wrong-token" }]) {
        const response = await app.inject({ method, url, headers });
        expect(response.statusCode, `${method} ${url}`).toBe(401);
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
    }
    expect(pool.query).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); expect(queryOne).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });
  it("admits authenticated V1 and V2 reads using the same server bearer", async () => {
    app = await buildServer();
    const headers = { authorization: `Bearer ${environment.NEWS_V2_ADMIN_TOKEN}` };
    expect((await app.inject({ method: "GET", url: "/v1/runs", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v2/companies", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/fetch", headers })).statusCode).toBe(403);
  });
  it("leaves only minimal GET/HEAD probes public", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    app = await buildServer();
    for (const method of ["GET", "HEAD"] as const) for (const url of ["/health", "/ready"]) {
      expect((await app.inject({ method, url })).statusCode).toBe(200);
    }
  });
  it("does not expose backend error details to an authenticated browser proxy", async () => {
    vi.mocked(query).mockRejectedValueOnce(new Error("password=synthetic-private-value database-host.internal"));
    app = await buildServer();
    const response = await app.inject({ method: "GET", url: "/v1/runs", headers: { authorization: `Bearer ${environment.NEWS_V2_ADMIN_TOKEN}` } });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("synthetic-private-value"); expect(response.body).not.toContain("database-host.internal");
  });
  it("fails before building routes when required production secrets are missing", async () => {
    vi.stubEnv("NEWS_V2_ADMIN_TOKEN", "");
    await expect(buildServer()).rejects.toThrow("NEWS_V2_ADMIN_TOKEN");
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("production paid-source opt-in", () => {
  it("blocks legacy company and general-news collection even when an environment key exists", async () => {
    expect(getProviders()).toEqual([]);
    const market = new MarketNewsSource();
    expect(market.isConfigured()).toBe(false);
    expect(await market.fetchAll()).toEqual([]);
  });
  it("blocks imported enabled paid credentials and rejects enabling without host opt-in", async () => {
    vi.mocked(queryOne).mockResolvedValue({ provider_id: "benzinga", enabled: true, display_licensed: true, full_text_enabled: true,
      credentials_encrypted: encryptCredentials({ apiKey: "synthetic-provider-key" }) });
    expect(await providerConfig("benzinga")).toMatchObject({ enabled: false, configured: true });
    await expect(updateProvider("benzinga", { enabled: true })).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled();
    vi.stubEnv("NEWS_V2_ALLOW_PAID_PROVIDERS", "true");
    expect(await providerConfig("benzinga")).toMatchObject({ enabled: true, configured: true, displayLicensed: true });
  });
  it("keeps official free sources enabled without any provider keys", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    for (const id of ["fed", "ecb", "sec"] as const) expect(await providerConfig(id)).toMatchObject({ enabled: true, configured: true, displayLicensed: true });
    expect(await providerConfig("marketaux")).toMatchObject({ enabled: false, configured: false, displayLicensed: false });
  });
});
