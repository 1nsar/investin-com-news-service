import type { CompanyHint, ProviderArticle, ProviderBatch, ProviderFetchRequest, ProviderId } from "../types.js";
import { batchLimit, checkpoint, iso, ProviderFetchError, publicLink, readCheckpoint, record, sourceJson, string } from "./http.js";
import { array } from "./official.js";
import { plainText } from "./text.js";

function apiKey(request: ProviderFetchRequest): string {
  const key = request.credentials.apiKey?.trim();
  if (!key || key.length > 2048) throw new ProviderFetchError("auth", "A provider-issued API key is required; a consumer login is insufficient");
  return key;
}
function remoteError(payload: unknown): void {
  const obj = record(payload);
  if (obj.error || obj.errors || obj.ok === false) {
    const code = string(record(obj.error).code) || string(record(array(obj.errors)[0]).code);
    throw new ProviderFetchError(/rate|quota|usage_limit/.test(code) ? "rate_limited" : /auth|token|access/.test(code) ? "auth" : "upstream",
      /rate|quota|usage_limit/.test(code) ? "Provider request quota exhausted; checkpoint was not advanced" : "Provider rejected the request; check API entitlement and configuration");
  }
}
function topics(text: string): string[] {
  const result: string[] = [];
  if (/earnings|revenue|quarterly results/i.test(text)) result.push("earnings");
  if (/inflation|consumer prices|\bCPI\b/i.test(text)) result.push("inflation");
  if (/federal reserve|central bank|interest rates|monetary/i.test(text)) result.push("monetary-policy");
  if (/regulat|enforcement|securities commission/i.test(text)) result.push("regulation");
  return result.length ? result : ["markets"];
}
function requiredArticle(row: Record<string, unknown>, id: unknown, date: unknown): { id: string; url: string; title: string; publishedAt: string } | null {
  const sourceId = typeof id === "string" || typeof id === "number" ? String(id) : "";
  const url = publicLink(row.url);
  const title = plainText(string(row.title) || string(row.headline));
  const publishedAt = iso(date);
  return sourceId && url && title && publishedAt ? { id: sourceId, url, title, publishedAt } : null;
}

interface Window { from: string; to: string; page: number; phase: string }
function windowState(request: ProviderFetchRequest): Window {
  const state = readCheckpoint(request.checkpoint, request.providerId);
  if (state.kind === "window") {
    const from = iso(state.from), to = iso(state.to);
    const page = Number(state.page);
    if (!from || !to || from > to || !Number.isInteger(page) || page < 0 || page > 100_000) throw new ProviderFetchError("invalid_response", "Invalid pagination checkpoint");
    return { from, to, page, phase: string(state.phase) || "news" };
  }
  const to = new Date().toISOString();
  const watermark = iso(state.watermark);
  const from = new Date(watermark ? Date.parse(watermark) - 300_000 : Date.now() - 3_600_000).toISOString();
  return { from, to, page: 0, phase: "news" };
}
const windowCursor = (provider: ProviderId, state: Window): string => checkpoint(provider, { kind: "window", ...state });

export async function fetchMarketaux(request: ProviderFetchRequest): Promise<ProviderBatch> {
  const state = windowState(request), pageSize = batchLimit(request.limit);
  const url = new URL("https://api.marketaux.com/v1/news/all");
  url.search = new URLSearchParams({ api_token: apiKey(request), published_after: state.from.slice(0, 19), published_before: state.to.slice(0, 19),
    page: String(state.page + 1), limit: String(pageSize), group_similar: "false", language: "en" }).toString();
  const payload = await sourceJson("marketaux", url.toString(), request.signal);
  remoteError(payload);
  const data = record(payload), meta = record(data.meta);
  if (!Array.isArray(data.data)) throw new ProviderFetchError("invalid_response", "Marketaux response is missing its data array");
  const actualLimit = Number(meta.limit), actualPage = Number(meta.page), found = Number(meta.found);
  if (!Number.isInteger(actualLimit) || actualLimit <= 0 || actualLimit > 100 || actualPage !== state.page + 1 || !Number.isFinite(found) || found < 0 || data.data.length > actualLimit) {
    throw new ProviderFetchError("invalid_response", "Marketaux returned inconsistent pagination metadata");
  }
  if (found > 20_000 || state.page * actualLimit >= 20_000) throw new ProviderFetchError("rate_limited", "Marketaux's 20,000-result ceiling was reached; narrow the source window before resuming");
  const items: ProviderArticle[] = [];
  for (const raw of data.data) {
    const row = record(raw), base = requiredArticle(row, row.uuid, row.published_at);
    if (!base) throw new ProviderFetchError("invalid_response", "Marketaux article lacks a usable identity, URL or publication time; cursor retained");
    const companies: CompanyHint[] = array(row.entities).map(record).filter((entity) => string(entity.symbol) || string(entity.name)).map((entity) => ({
      ticker: string(entity.symbol) || undefined, exchange: string(entity.exchange) || undefined,
      country: string(entity.country).toUpperCase() || undefined, name: string(entity.name) || undefined,
      externalId: `marketaux:${string(entity.symbol)}:${string(entity.exchange)}:${string(entity.country)}`,
    }));
    items.push({ sourceId: base.id, action: "upsert", headline: base.title, url: base.url, publishedAt: base.publishedAt,
      summary: plainText(string(row.description) || string(row.snippet)) || null, body: null, imageUrl: null,
      publisher: string(row.source) || new URL(base.url).hostname, language: string(row.language) || null,
      receivedAt: new Date().toISOString(), topics: topics(base.title), genre: "news-summary", companies,
      rights: { bodyAllowed: false, imageAllowed: false, licenseStatus: "summary_only", attribution: "Publisher-attributed snippet supplied by Marketaux; full article remains at the original URL. API access does not grant full-text rights." },
    });
  }
  const complete = data.data.length < actualLimit || (state.page + 1) * actualLimit >= found;
  return { items, complete, nextCheckpoint: complete ? checkpoint("marketaux", { kind: "watermark", watermark: state.to })
    : windowCursor("marketaux", { ...state, page: state.page + 1 }),
    notices: ["English incremental feed, not a company-by-company crawl. Five-minute overlap reduces late-arrival gaps; no lossless or exhaustive coverage is claimed. Full article bodies are unavailable on Marketaux plans."] };
}

export async function fetchBenzinga(request: ProviderFetchRequest): Promise<ProviderBatch> {
  const state = windowState(request), pageSize = batchLimit(request.limit);
  const removed = state.phase === "removed";
  if (removed && state.page * pageSize > 10_000) throw new ProviderFetchError("rate_limited", "Benzinga removal pagination ceiling reached; checkpoint retained");
  const url = new URL(`https://api.benzinga.com/api/v2/${removed ? "news-removed" : "news"}`);
  url.search = new URLSearchParams({ token: apiKey(request), updatedSince: String(Math.floor(Date.parse(state.from) / 1000)), page: String(state.page), pageSize: String(pageSize) }).toString();
  if (!removed) { url.searchParams.set("sort", "updated:asc"); url.searchParams.set("displayOutput", request.fullTextEnabled ? "full" : "abstract"); }
  const payload = await sourceJson("benzinga", url.toString(), request.signal);
  remoteError(payload);
  let rows: unknown[];
  if (removed) {
    if (Array.isArray(payload)) rows = payload;
    else {
      const entries = Object.values(record(payload));
      if (entries.some((value) => !Array.isArray(value))) throw new ProviderFetchError("invalid_response", "Unrecognized Benzinga removal response");
      rows = entries.flatMap((value) => value as unknown[]);
    }
  } else if (Array.isArray(payload)) rows = payload;
  else throw new ProviderFetchError("invalid_response", "Benzinga response is missing its article array");
  if (rows.length > pageSize) throw new ProviderFetchError("invalid_response", "Benzinga exceeded the requested page bound");
  const items: ProviderArticle[] = [];
  let reachedWindowEnd = false;
  for (const raw of rows) {
    const row = record(raw);
    if (removed) {
      const id = typeof row.id === "number" || typeof row.id === "string" ? String(row.id) : "";
      if (!id) throw new ProviderFetchError("invalid_response", "Benzinga removal lacks its article ID; cursor retained");
      items.push({ sourceId: id, action: "delete", headline: "Withdrawn source item", url: "https://www.benzinga.com/", publisher: "Benzinga",
        // Tombstone receipt is operational metadata; the store preserves original publication data.
        publishedAt: new Date().toISOString(), receivedAt: new Date().toISOString(), body: null,
        rights: { bodyAllowed: false, imageAllowed: false, licenseStatus: "licensed", attribution: "Benzinga removal event; original article must no longer be displayed." } });
      continue;
    }
    const base = requiredArticle(row, row.id, row.created), updated = iso(row.updated);
    if (!base || !updated) throw new ProviderFetchError("invalid_response", "Benzinga article lacks a usable ID, URL or timestamp; cursor retained");
    if (updated > state.to) { reachedWindowEnd = true; continue; }
    const text = request.fullTextEnabled ? plainText(string(row.body)) : "";
    if (text.length > 160_000) throw new ProviderFetchError("invalid_response", "Benzinga body exceeds the reader limit");
    const body = text || null;
    const companies: CompanyHint[] = array(row.stocks).map(record).map((stock) => ({ ticker: string(stock.name) || undefined,
      exchange: string(stock.exchange) || undefined, externalId: string(stock.isin) ? `isin:${string(stock.isin)}` : undefined }));
    items.push({ sourceId: base.id, action: "upsert", headline: base.title, summary: plainText(string(row.teaser)) || null,
      body, url: base.url, publisher: "Benzinga", publisherUrl: "https://www.benzinga.com", publishedAt: base.publishedAt,
      updatedAt: updated, receivedAt: new Date().toISOString(), language: "en", imageUrl: null,
      topics: topics(base.title + " " + array(row.channels).map((channel) => string(record(channel).name)).join(" ")),
      // Different timestamps establish an update, not an editorial correction.
      // Only an explicit boolean source marker may label it as a correction.
      genre: "licensed-news", companies, correction: row.correction === true,
      rights: { bodyAllowed: body !== null, imageAllowed: false, licenseStatus: body ? "licensed" : "summary_only",
        attribution: "Source: Benzinga. Full-text display requires the configured customer's applicable licence; image rights are not inferred." },
    });
  }
  const phaseComplete = rows.length < pageSize || (!removed && reachedWindowEnd);
  const complete = removed && phaseComplete;
  const next = phaseComplete && !removed ? { ...state, phase: "removed", page: 0 } : { ...state, page: state.page + 1 };
  return { items, complete, nextCheckpoint: complete ? checkpoint("benzinga", { kind: "watermark", watermark: state.to }) : windowCursor("benzinga", next),
    notices: ["News and removal pages must both finish before the stable watermark advances. Five-minute overlap handles boundary repeats; offset pagination is not a transactional or lossless stream. Paid feed delivery has not been tested locally."] };
}

export async function fetchFinnhub(request: ProviderFetchRequest): Promise<ProviderBatch> {
  const key = apiKey(request), state = readCheckpoint(request.checkpoint, "finnhub");
  const symbols = (request.credentials.symbols ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length > 5 || symbols.some((symbol) => !/^[A-Z0-9.^-]{1,20}$/.test(symbol))) throw new ProviderFetchError("invalid_response", "Finnhub targeted scope accepts at most five explicit symbols");
  const signature = symbols.join(",") || "macro";
  if (state.scope && state.scope !== signature) throw new ProviderFetchError("invalid_response", "Finnhub source scope changed; reset its checkpoint");
  let pending: ProviderArticle[] = [];
  let symbolIndex = state.kind === "finnhub_pending" || state.kind === "finnhub_next" ? Number(state.symbolIndex) : 0;
  if (!Number.isInteger(symbolIndex) || symbolIndex < 0 || symbolIndex >= Math.max(1, symbols.length)) throw new ProviderFetchError("invalid_response", "Invalid Finnhub symbol cursor");
  const from = iso(state.from) ?? new Date(Date.now() - 86_400_000).toISOString();
  const to = iso(state.to) ?? new Date().toISOString();
  if (state.kind === "finnhub_pending" && Array.isArray(state.pending)) pending = state.pending as ProviderArticle[];
  else {
    const symbol = symbols[symbolIndex];
    const url = new URL(`https://finnhub.io/api/v1/${symbol ? "company-news" : "news"}`);
    url.searchParams.set("token", key);
    if (symbol) { url.searchParams.set("symbol", symbol); url.searchParams.set("from", from.slice(0, 10)); url.searchParams.set("to", to.slice(0, 10)); }
    else { url.searchParams.set("category", "general"); if (typeof state.minId === "number") url.searchParams.set("minId", String(state.minId)); }
    const payload = await sourceJson("finnhub", url.toString(), request.signal);
    remoteError(payload);
    if (!Array.isArray(payload) || payload.length > 1000) throw new ProviderFetchError("invalid_response", "Finnhub returned an invalid or oversized news batch");
    pending = payload.map((raw) => {
      const row = record(raw), base = requiredArticle(row, row.id, typeof row.datetime === "number" ? row.datetime * 1000 : null);
      if (!base) throw new ProviderFetchError("invalid_response", "Finnhub article lacks required identity or timestamp fields");
      return { sourceId: base.id, action: "upsert" as const, headline: base.title, summary: plainText(string(row.summary)) || null,
        body: null, imageUrl: null, url: base.url, publishedAt: base.publishedAt, receivedAt: new Date().toISOString(),
        publisher: string(row.source) || new URL(base.url).hostname, language: "en", genre: "news-summary", topics: topics(base.title),
        companies: symbol ? [{ ticker: symbol, externalId: `finnhub-query:${symbol}` }] : [],
        rights: { bodyAllowed: false, imageAllowed: false, licenseStatus: "summary_only" as const,
          attribution: "Publisher-attributed summary via Finnhub. Business use requires applicable written approval; full article rights are not supplied by company-news." } };
    });
  }
  const items = pending.slice(0, batchLimit(request.limit)), remaining = pending.slice(items.length);
  if (!remaining.length) symbolIndex++;
  const complete = !remaining.length && symbolIndex >= Math.max(1, symbols.length);
  const observedId = Math.max(Number(state.minId) || 0, ...pending.map((article) => Number(article.sourceId) || 0));
  return { items, complete, nextCheckpoint: complete ? checkpoint("finnhub", { scope: signature, minId: observedId, from: new Date(Date.parse(to) - 86_400_000).toISOString() })
    : checkpoint("finnhub", { kind: remaining.length ? "finnhub_pending" : "finnhub_next", pending: remaining, scope: signature, symbolIndex, from, to, minId: observedId }),
    notices: [symbols.length ? "Bounded North American company-news queries; broader coverage is not inferred from a valid symbol." : "General-market snapshot only; the API does not establish complete historical news coverage."] };
}
