import Fastify from "fastify";
import { buildServer } from "./api/server.js";
import { config } from "./config/index.js";

// Vercel detects src/server.ts and wraps this listener in a Function. Keep
// migrations and persistent workers in the separate release/worker process.
// npm start and Docker still use src/api/server.ts for the persistent service.
const app = await buildServer(Fastify);
await app.listen({ port: config.PORT, host: config.HOST });
