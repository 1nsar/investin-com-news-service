import { backoffDelayMs, sleep } from "./async.js";
import type { RateLimiter } from "./rateLimiter.js";
import { logger } from "./logger.js";

/** Query parameters that carry credentials. Providers put API keys in the
 *  query string, so any URL that reaches a log, an error message or the
 *  database has to have them removed first. */
const SECRET_PARAMS = /^(token|api_?key|apikey|key|access_?token|auth|password|secret)$/i;

/** Strip credentials from a URL before it is shown to anyone.
 *
 *  Error messages built from request URLs are stored in
 *  `fetch_run_companies.error` and served by `GET /v1/runs/:id/companies`, so
 *  an un-redacted URL would publish the Finnhub key over the API and leave a
 *  copy in the database and the logs. */
export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_PARAMS.test(key)) url.searchParams.set(key, "REDACTED");
    }
    return url.toString();
  } catch {
    // Not a parseable URL - redact anything that looks like a key=value secret.
    return rawUrl.replace(
      /\b(token|api_?key|apikey|key|access_?token|auth|password|secret)=[^&\s]+/gi,
      "$1=REDACTED",
    );
  }
}

export class HttpError extends Error {
  /** Already redacted; safe to log, store and return over the API. */
  readonly url: string;

  constructor(
    readonly status: number,
    url: string,
    readonly body: string,
  ) {
    const safeUrl = redactUrl(url);
    super(`HTTP ${status} for ${safeUrl}`);
    this.url = safeUrl;
    this.name = "HttpError";
  }

  /** 401/403 mean "this key may not have this data" - a permanent answer that
   *  must be reported differently from "nothing happened today". */
  get isAccessDenied(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
  limiter?: RateLimiter;
  /** Label used in logs and errors. */
  label?: string;
}

const USER_AGENT =
  "company-news-component/1.0 (+backend news aggregation; contact: ops@example.com)";

/** One outbound call, with the rate limiter, timeout, retry and backoff all in
 *  one place so no provider adapter has to reimplement them. */
export async function request(url: string, options: RequestOptions = {}): Promise<string> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 15_000,
    maxRetries = 3,
    limiter,
    label = url,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (limiter) await limiter.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { "user-agent": USER_AGENT, accept: "*/*", ...headers },
        body,
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        const text = (await response.text().catch(() => "")).slice(0, 500);
        const error = new HttpError(response.status, url, text);

        if (error.isRateLimited && limiter) {
          const retryAfter = Number(response.headers.get("retry-after"));
          limiter.pauseFor(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000);
        }
        // Access denials are permanent for this key. Retrying wastes budget
        // and buries the signal we specifically want to alert on.
        if (!error.isRetryable || attempt === maxRetries) throw error;
        lastError = error;
      } else {
        return await response.text();
      }
    } catch (error) {
      if (error instanceof HttpError && !error.isRetryable) throw error;
      lastError = error;
      if (attempt === maxRetries) break;
    } finally {
      clearTimeout(timer);
    }

    const delay = backoffDelayMs(attempt);
    logger.debug({ label: redactUrl(label), attempt: attempt + 1, delay }, "retrying request");
    await sleep(delay);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`request failed for ${redactUrl(label)}: ${String(lastError)}`);
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const text = await request(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Expected JSON from ${redactUrl(options.label ?? url)}, got: ${text.slice(0, 160)}`,
    );
  }
}
