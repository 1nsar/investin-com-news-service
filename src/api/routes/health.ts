import "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { pool } from "../../db/pool.js";

/** Container probes are available in both the full service and V2-only mode. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });

  // Database failures affect readiness, not whether the process is alive.
  app.get("/health", { schema: { description: "Liveness probe.", tags: ["ops"] } }, async () => ({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
  }));

  app.get("/ready", { schema: { description: "Readiness probe.", tags: ["ops"] } }, async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready" };
    } catch {
      // Probes are unauthenticated: never disclose database hosts or credentials.
      return reply.code(503).send({ status: "not_ready", detail: "Database unavailable." });
    }
  });
}
