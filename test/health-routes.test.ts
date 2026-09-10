import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../src/db/pool.js";
import { buildServer } from "../src/api/server.js";

// The real server registers its routes, but no test can reach a database.
vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
  closePool: vi.fn(),
  waitForDatabase: vi.fn(),
}));
vi.mock("../src/util/logger.js", async () => ({
  logger: (await import("pino")).default({ level: "silent" }),
}));

let app: Awaited<ReturnType<typeof buildServer>> | undefined;

beforeEach(() => {
  vi.stubEnv("NEWS_V2_ONLY", "true");
  vi.stubEnv("NEWS_V2_ADMIN_TOKEN", "");
  vi.mocked(pool.query).mockReset();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected outbound request in probe test."); }));
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("service probes", () => {
  it("serves V2-only liveness without a database or workspace credentials", async () => {
    app = await buildServer();
    const health = await app.inject({ method: "GET", url: "/health" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok", uptimeSeconds: expect.any(Number) });
    expect(health.headers["cache-control"]).toBe("no-store");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("serves V2-only readiness after a successful database check", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    app = await buildServer();
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });
    expect(ready.headers["cache-control"]).toBe("no-store");
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it.each([
    new Error("Connection rejected by private-db.example for user secret-user"),
    "postgres://secret-user:secret-password@private-db.example/workspace",
  ])("keeps liveness healthy and readiness errors private during database failure (%#)", async (failure) => {
    vi.mocked(pool.query).mockRejectedValueOnce(failure);
    app = await buildServer();
    const ready = await app.inject({ method: "GET", url: "/ready" });
    const health = await app.inject({ method: "GET", url: "/health" });

    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: "not_ready", detail: "Database unavailable." });
    expect(ready.headers["cache-control"]).toBe("no-store");
    expect(health.statusCode).toBe(200);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy operations disabled and V2 workspace authentication intact", async () => {
    vi.stubEnv("NEWS_V2_ADMIN_TOKEN", "synthetic-probe-test-token");
    app = await buildServer();
    for (const url of ["/v1/status", "/v1/runs", "/v1/runs/latest", "/v1/companies", "/v1/news"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: "POST", url: "/v1/fetch", payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v2/status" })).statusCode).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("also registers probes once alongside legacy routes in full-service mode", async () => {
    vi.stubEnv("NEWS_V2_ONLY", "false");
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    app = await buildServer();
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/ready" })).statusCode).toBe(200);
    expect(app.hasRoute({ method: "GET", url: "/v1/status" })).toBe(true);
    expect(app.hasRoute({ method: "POST", url: "/v1/fetch" })).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
