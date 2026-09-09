import { setTimeout as delay } from "node:timers/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ProviderId } from "../types.js";

export const PROJECT_USER_AGENT = "investin-com-news-service/2.0 (+https://github.com/1nsar/investin-com-news-service)";
export class ProviderFetchError extends Error {
  constructor(
    readonly code: "auth" | "rate_limited" | "upstream" | "invalid_response" | "blocked_url" | "aborted",
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) { super(message); this.name = "ProviderFetchError"; }
}

/** No caller-supplied URL is an unrestricted HTTP capability. Redirects are denied. */
export function allowedUrl(provider: ProviderId, raw: string, purpose: "api" | "body" = "api"): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ProviderFetchError("blocked_url", "Invalid source URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || /%2f|%5c|%2e/i.test(url.pathname)) {
    throw new ProviderFetchError("blocked_url", "Source URL is outside the adapter policy");
  }
  // ECB's own feed currently emits a doubled leading slash.
  if (provider === "ecb") url.pathname = url.pathname.replace(/^\/{2,}/, "/");
  const path = url.pathname;
  let allowed = false;
  if (provider === "fed" && url.hostname === "www.federalreserve.gov") {
    allowed = purpose === "body"
      ? /^\/newsevents\/pressreleases\/[a-z]+\d{8}[a-z]?\.htm$/.test(path) && !url.search
      : /^\/feeds\/press_(all|monetary)\.xml$/.test(path) && !url.search;
  } else if (provider === "ecb" && url.hostname === "www.ecb.europa.eu") {
    allowed = purpose === "body"
      ? /^\/press\/pr\/date\/\d{4}\/html\/ecb\.[a-z0-9~_.-]+\.en\.html$/i.test(path) && !url.search
      : path === "/rss/press.html" && !url.search;
  } else if (provider === "sec") {
    allowed = purpose === "body"
      ? url.hostname === "www.sec.gov" && /^\/Archives\/edgar\/data\/\d{1,10}\/\d{18}\/[a-z0-9_.-]+\.(?:htm|html|txt)$/i.test(path) && !url.search
      : (url.hostname === "data.sec.gov" && /^\/submissions\/CIK\d{10}\.json$/.test(path) && !url.search)
        || (url.hostname === "www.sec.gov" && (path === "/files/company_tickers_exchange.json" || path === "/cgi-bin/browse-edgar" || /^\/Archives\/edgar\/data\/\d{1,10}\/\d{18}\/index\.json$/.test(path)));
  } else if (provider === "benzinga") {
    allowed = purpose === "api" && url.hostname === "api.benzinga.com" && /^\/api\/v2\/news(?:-removed)?$/.test(path);
  } else if (provider === "marketaux") {
    allowed = purpose === "api" && url.hostname === "api.marketaux.com" && path === "/v1/news/all";
  } else if (provider === "finnhub") {
    allowed = purpose === "api" && url.hostname === "finnhub.io" && /^\/api\/v1\/(?:news|company-news)$/.test(path);
  }
  if (!allowed) throw new ProviderFetchError("blocked_url", "Source URL is outside the adapter policy");
  return url;
}

const nextRequests = new Map<string, number>();
const requestBudget = new AsyncLocalStorage<(() => Promise<void>) | undefined>();
export function withRequestBudget<T>(acquire: (() => Promise<void>) | undefined, operation: () => Promise<T>): Promise<T> {
  return requestBudget.run(acquire, operation);
}
export async function sourceText(provider: ProviderId, rawUrl: string, signal: AbortSignal, options: {
  purpose?: "api" | "body"; headers?: Record<string, string>; maxBytes?: number;
} = {}): Promise<string> {
  const url = allowedUrl(provider, rawUrl, options.purpose);
  const maxBytes = Math.min(options.maxBytes ?? 2_500_000, 4_000_000);
  // One shared bucket for both SEC hosts, below the official 10 requests/sec cap.
  const bucket = provider === "sec" ? "sec" : url.hostname;
  const interval = provider === "sec" ? 550 : 220;
  const scheduled = Math.max(Date.now(), nextRequests.get(bucket) ?? 0);
  nextRequests.set(bucket, scheduled + interval);
  if (scheduled > Date.now()) await delay(scheduled - Date.now(), undefined, { signal }).catch(() => {
    throw new ProviderFetchError("aborted", "Source request cancelled");
  });
  if (signal.aborted) throw new ProviderFetchError("aborted", "Source request cancelled");
  await requestBudget.getStore()?.();
  try {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    const response = await fetch(url, { redirect: "manual", signal: combined, headers: {
      "user-agent": PROJECT_USER_AGENT,
      accept: options.purpose === "body" ? "text/html,text/plain;q=0.9" : "application/json,application/xml,text/xml;q=0.9",
      ...options.headers,
    } });
    if (!response.ok) {
      await response.body?.cancel();
      const code = response.status === 429 || response.status === 402 ? "rate_limited"
        : response.status === 401 || response.status === 403 ? "auth" : "upstream";
      const retry = Number(response.headers.get("retry-after"));
      throw new ProviderFetchError(code, `Source returned HTTP ${response.status}${code === "auth" ? "; access was not bypassed" : ""}`,
        code === "rate_limited" && Number.isFinite(retry) && retry > 0 ? Math.min(retry, 86400) : null);
    }
    const length = Number(response.headers.get("content-length"));
    if (length > maxBytes) { await response.body?.cancel(); throw new ProviderFetchError("invalid_response", "Source response exceeds the byte limit"); }
    if (!response.body) throw new ProviderFetchError("invalid_response", "Source returned an empty response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) { await reader.cancel(); throw new ProviderFetchError("invalid_response", "Source response exceeds the byte limit"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    if (error instanceof ProviderFetchError) throw error;
    if (signal.aborted) throw new ProviderFetchError("aborted", "Source request cancelled");
    // Never echo fetch errors, remote error bodies, or credential-bearing URLs.
    throw new ProviderFetchError("upstream", "Source request failed or timed out");
  }
}

export async function sourceJson(provider: ProviderId, url: string, signal: AbortSignal): Promise<unknown> {
  const raw = await sourceText(provider, url, signal, { headers: { accept: "application/json" } });
  try { return JSON.parse(raw) as unknown; }
  catch { throw new ProviderFetchError("invalid_response", "Source returned invalid JSON"); }
}

export function publicLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || /^(localhost|127\.|0\.|\[|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) return null;
    for (const key of url.searchParams.keys()) if (/token|api.?key|password|secret|auth/i.test(key)) return null;
    return url.toString();
  } catch { return null; }
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export const string = (value: unknown): string => typeof value === "string" ? value : "";
export function iso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function readCheckpoint(raw: string | null, provider: ProviderId): Record<string, unknown> {
  if (!raw) return {};
  try { const parsed = record(JSON.parse(raw)); if (parsed.provider === provider && parsed.v === 1) return parsed; } catch { /* reject below */ }
  throw new ProviderFetchError("invalid_response", "Invalid provider checkpoint; reset it before changing source scope");
}
export const checkpoint = (provider: ProviderId, data: Record<string, unknown>): string => JSON.stringify({ v: 1, provider, ...data });
export const batchLimit = (limit: number): number => Math.max(1, Math.min(40, Math.floor(Number.isFinite(limit) ? limit : 10)));
