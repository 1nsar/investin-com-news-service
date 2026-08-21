import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { config } from "../config/index.js";
import { closePool, waitForDatabase } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { logger } from "../util/logger.js";
import { isMainModule } from "../util/main.js";
import { startScheduler, stopScheduler } from "../ingest/scheduler.js";
import { companyRoutes } from "./routes/companies.js";
import { newsRoutes } from "./routes/news.js";
import { operationsRoutes } from "./routes/operations.js";

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    // Reject absurd bodies outright; nothing here needs a large payload.
    bodyLimit: 1_048_576,
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN.split(",").map((o) => o.trim()),
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Company news component",
        description:
          "Standalone news backend. Resolves every catalogue ticker to its exchange and to " +
          "the full set of venues it trades on, then keeps a deduplicated news feed per company.",
        version: "1.0.0",
      },
      tags: [
        { name: "companies", description: "Tracked companies and resolved listings" },
        { name: "news", description: "Article feeds" },
        { name: "ops", description: "Health, runs, and on-demand fetch" },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(companyRoutes);
  await app.register(newsRoutes);
  await app.register(operationsRoutes);

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: "not_found",
      detail: `no route ${request.method} ${request.url}`,
      hint: "API documentation is at /docs",
    });
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : NaN;
    reply.code(Number.isFinite(status) && status >= 400 ? status : 500).send({
      error: "internal_error",
      detail: error instanceof Error ? error.message : String(error),
    });
  });

  return app;
}

export async function start(): Promise<void> {
  await waitForDatabase();
  // The API owns schema convergence so a fresh deployment needs no extra step.
  // Concurrent replicas are safe: the migration runner takes an advisory lock.
  await migrate();

  const app = await buildServer();
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(
    { port: config.PORT, docs: `http://localhost:${config.PORT}/docs` },
    "news component listening",
  );

  if (config.SCHEDULER_ENABLED) startScheduler();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    stopScheduler();
    // Stop accepting connections, let in-flight requests finish, then release
    // the pool. An ingest triggered over HTTP is not waited for: it is
    // re-runnable by design.
    await app.close().catch(() => undefined);
    await closePool().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

if (isMainModule(import.meta.url)) {
  start().catch((error) => {
    logger.error({ err: error }, "failed to start");
    process.exit(1);
  });
}
