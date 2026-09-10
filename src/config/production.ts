/** Production checks deliberately report field names, never supplied values. */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const issues: string[] = [];
  try {
    const database = new URL(env.DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || !database.username || database.pathname.length < 2) throw new Error();
  } catch { issues.push("DATABASE_URL must identify a PostgreSQL host, user and database."); }

  const token = env.NEWS_V2_ADMIN_TOKEN ?? "";
  if (token.length < 32 || /\s/.test(token)) issues.push("NEWS_V2_ADMIN_TOKEN must contain at least 32 non-whitespace characters.");
  const key = env.NEWS_V2_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(key) && !(/^[A-Za-z0-9+/]{43}=$/.test(key) && Buffer.from(key, "base64").toString("base64") === key)) {
    issues.push("NEWS_V2_ENCRYPTION_KEY must be exactly 32 bytes encoded as hex or canonical base64.");
  }
  for (const name of ["NEWS_V2_ALLOW_PAID_PROVIDERS", "NEWS_V2_ONLY", "NEWS_V2_WORKER_ENABLED", "SCHEDULER_ENABLED"]) {
    if (env[name] !== undefined && !["true", "false"].includes(env[name]!)) issues.push(`${name} must be true or false.`);
  }
  if (env.SCHEDULER_ENABLED === "true" && !paidProvidersAllowed(env)) {
    issues.push("SCHEDULER_ENABLED requires explicit NEWS_V2_ALLOW_PAID_PROVIDERS=true in production.");
  }
  if (issues.length) throw new Error(`Invalid production configuration:\n${issues.join("\n")}`);
}

/** An imported workspace cannot silently enable paid collection on a new host. */
export function paidProvidersAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.NEWS_V2_ALLOW_PAID_PROVIDERS === "true";
}
