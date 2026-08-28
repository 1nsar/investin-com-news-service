import "dotenv/config";
import { z } from "zod";

/** Every knob the component has. Parsed once, at startup, so a bad value is a
 *  loud failure at boot rather than a strange one at 06:00 three weeks later. */
const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGIN: z.string().default("*"),
  /** When set, POST /v1/fetch requires this bearer token. Empty = open, which
   *  is fine behind a private-network gateway and not fine on a public port. */
  API_AUTH_TOKEN: z.string().default(""),

  FINNHUB_API_KEY: z.string().default(""),
  /** Optional. Entity-tagged global news; closes the international and OTC
   *  gaps the free stack cannot. Free tier is enough to evaluate. */
  MARKETAUX_API_KEY: z.string().default(""),
  MARKETAUX_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  /** Page size. Free tier caps this at 3, Basic 20, Standard 50, Pro 100 -
   *  asking for more than the plan allows is silently truncated. */
  MARKETAUX_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  MARKETAUX_LANGUAGES: z.string().default("en"),
  OPENFIGI_API_KEY: z.string().default(""),

  NEWS_PROVIDER_ORDER: z.string().default("finnhub,marketaux"),
  FINNHUB_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(55),
  GOOGLE_NEWS_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(40),

  INGEST_INITIAL_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  INGEST_OVERLAP_HOURS: z.coerce.number().int().nonnegative().default(6),
  INGEST_CONCURRENCY: z.coerce.number().int().positive().default(6),
  INGEST_COMPANY_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  INGEST_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  INGEST_MAX_COMPANIES: z.coerce.number().int().nonnegative().default(0),

  SCHEDULER_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  SCHEDULER_CRON: z.string().default("0 6 * * *"),
});

export type Config = z.infer<typeof Schema> & {
  providerOrder: string[];
  catalogueFile: string;
};

function load(): Config {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${detail}\n\nSee .env.example.`);
  }
  const env = parsed.data;
  return {
    ...env,
    providerOrder: env.NEWS_PROVIDER_ORDER.split(",")
      .map((name) => name.trim())
      .filter(Boolean),
    catalogueFile:
      process.env.CATALOGUE_FILE ?? "data/catalogue/companies-production.csv",
  };
}

export const config = load();
