import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import type { ProviderArticle, ProviderBatch, ProviderFetchRequest } from "../types.js";
import { allowedUrl, batchLimit, checkpoint, iso, ProviderFetchError, readCheckpoint, record, sourceText, string } from "./http.js";
import { officialBody, plainText } from "./text.js";

export const OFFICIAL_POLICIES = {
  fed: {
    source: "Federal Reserve Board", origin: "https://www.federalreserve.gov",
    feed: "https://www.federalreserve.gov/feeds/press_all.xml",
    policy: "https://www.federalreserve.gov/disclaimer.htm",
    attribution: "Source: Federal Reserve Board. Board information is public domain unless otherwise indicated; third-party materials and seals are excluded.",
  },
  ecb: {
    source: "European Central Bank", origin: "https://www.ecb.europa.eu",
    feed: "https://www.ecb.europa.eu/rss/press.html",
    policy: "https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html",
    attribution: "Source: European Central Bank. This information is available free of charge on the ECB website. Text formatting has been simplified. Reproduction must be accurate; named-author papers, third-party content and logos are excluded.",
  },
  sec: {
    source: "SEC EDGAR", origin: "https://www.sec.gov",
    policy: "https://www.sec.gov/about/webmaster-frequently-asked-questions",
    attribution: "Source: SEC EDGAR public filing. Issuer disclosure, not independent reporting. SEC permits reuse of public EDGAR filing content; text formatting has been simplified.",
  },
} as const;

export function parseXml(raw: string): Record<string, unknown> {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true) {
    throw new ProviderFetchError("invalid_response", "Source returned invalid or unsupported XML");
  }
  return record(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: false, parseTagValue: false }).parse(raw));
}
export const array = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
export const xmlText = (value: unknown): string => typeof value === "string" ? value : string(record(value)["#text"]);

interface FeedEntry { id: string; title: string; url: string; summary: string; publishedAt: string; category: string }
interface SeenEntry { fingerprint: string; bodyImported: boolean }
const DAY_MS = 24 * 60 * 60 * 1000;
const fingerprint = (entry: FeedEntry): string => createHash("sha256").update(JSON.stringify(entry)).digest("hex");

function readSeen(value: unknown): Record<string, SeenEntry> {
  const result: Record<string, SeenEntry> = {};
  const entries = Object.entries(record(value));
  if (entries.length > 100) throw new ProviderFetchError("invalid_response", "Feed cursor exceeds its item bound");
  for (const [id, value] of entries) {
    const item = record(value);
    if (!/^[a-f0-9]{64}$/.test(string(item.fingerprint)) || typeof item.bodyImported !== "boolean") throw new ProviderFetchError("invalid_response", "Invalid feed fingerprint cursor");
    result[id] = { fingerprint: string(item.fingerprint), bodyImported: item.bodyImported };
  }
  return result;
}
function feedEntry(value: unknown, provider: "fed" | "ecb"): FeedEntry | null {
  const row = record(value);
  const title = plainText(xmlText(row.title));
  const publishedAt = iso(xmlText(row.pubDate));
  if (!title || !publishedAt) return null;
  let url: string;
  try { url = allowedUrl(provider, xmlText(row.link), "body").toString(); } catch { return null; }
  return { id: url, title, url, summary: plainText(xmlText(row.description)), publishedAt, category: xmlText(row.category) };
}

export async function fetchOfficialFeed(request: ProviderFetchRequest): Promise<ProviderBatch> {
  if (request.providerId !== "fed" && request.providerId !== "ecb") throw new ProviderFetchError("invalid_response", "Unsupported official feed");
  const provider = request.providerId;
  const policy = OFFICIAL_POLICIES[provider];
  const state = readCheckpoint(request.checkpoint, provider);
  const now = new Date().toISOString();
  // Older checkpoints intentionally trigger a full scan, including the fixed
  // Fed extraction. A fingerprint records the feed metadata, not article text.
  let seen = readSeen(state.seen);
  const previousFullScanAt = iso(state.lastFullScanAt);
  let fullScanAt = state.kind === "rss_pending" ? iso(state.fullScanAt) : null;
  let pending: FeedEntry[];
  const notices: string[] = [];
  if (state.kind === "rss_pending") {
    if (!Array.isArray(state.pending) || state.pending.length > 100) throw new ProviderFetchError("invalid_response", "Invalid feed cursor");
    pending = state.pending.map((item) => {
      const row = record(item);
      const url = allowedUrl(provider, string(row.url), "body").toString();
      if (!string(row.title) || !iso(row.publishedAt)) throw new ProviderFetchError("invalid_response", "Invalid feed cursor item");
      return { id: url, url, title: string(row.title), summary: string(row.summary), publishedAt: iso(row.publishedAt)!, category: string(row.category) };
    });
  } else {
    const parsed = parseXml(await sourceText(provider, policy.feed, request.signal));
    const rss = record(parsed.rss);
    if (!rss.channel) throw new ProviderFetchError("invalid_response", "Source did not return an RSS channel");
    const entries = array(record(rss.channel).item);
    if (entries.length > 100) throw new ProviderFetchError("invalid_response", "Feed exceeds the bounded 100-item snapshot");
    const eligible = entries.map((row) => feedEntry(row, provider)).filter((row): row is FeedEntry => row !== null);
    if (entries.length !== eligible.length) notices.push(`${entries.length - eligible.length} feed entries excluded by the institutional-release URL/date policy; authored speeches, papers and PDFs are not imported.`);
    // Retain state only for the bounded current feed. Older releases are not a
    // correction archive, and are not silently marked removed when RSS rolls.
    seen = Object.fromEntries(eligible.filter((entry) => seen[entry.id]).map((entry) => [entry.id, seen[entry.id]!])) as Record<string, SeenEntry>;
    const fullScanDue = !previousFullScanAt || Date.parse(now) - Date.parse(previousFullScanAt) >= DAY_MS;
    if (fullScanDue) fullScanAt = now;
    pending = eligible.filter((entry) => fullScanDue || seen[entry.id]?.fingerprint !== fingerprint(entry));
    if (pending.length === 0) notices.push("The current feed is unchanged; no article-body requests were made.");
  }
  const selected = pending.slice(0, Math.min(batchLimit(request.limit), 10));
  const items: ProviderArticle[] = [];
  for (const entry of selected) {
    let body: string | null = null;
    const previous = seen[entry.id];
    try { body = officialBody(provider, await sourceText(provider, entry.url, request.signal, { purpose: "body" })); }
    catch (error) {
      if (!(error instanceof ProviderFetchError) || error.code === "aborted" || error.code === "rate_limited") throw error;
      notices.push(`Release body unavailable (${error.code}); retained its official headline and link. No full text inferred.`);
    }
    // A temporary body-fetch failure must not erase a previously imported
    // article during the unchanged-feed daily correction check.
    if (body === null && previous?.bodyImported && previous.fingerprint === fingerprint(entry)) {
      notices.push("The previous full article was preserved after an unsuccessful correction check.");
      continue;
    }
    seen[entry.id] = { fingerprint: fingerprint(entry), bodyImported: body !== null };
    const topics = /monetary|fomc|discount|interest rate/i.test(entry.category + entry.title + entry.url) ? ["monetary-policy"]
      : /inflation|consumer expectations/i.test(entry.title) ? ["inflation"] : ["regulation"];
    items.push({ sourceId: entry.id, action: "upsert", headline: entry.title,
      summary: entry.summary || null, body, url: entry.url, publisher: policy.source, publisherUrl: policy.origin,
      publishedAt: entry.publishedAt, updatedAt: null, receivedAt: new Date().toISOString(),
      language: "en", topics, genre: "official-policy", companies: [], imageUrl: null,
      rights: { bodyAllowed: body !== null, imageAllowed: false, attribution: `${policy.attribution} ${policy.policy}`, licenseStatus: "public_source" },
    });
  }
  const remaining = pending.slice(selected.length);
  const complete = remaining.length === 0;
  return { items, complete, nextCheckpoint: checkpoint(provider, complete
    ? { kind: "rss_complete", checkedAt: now, seen, lastFullScanAt: fullScanAt ?? previousFullScanAt }
    : { kind: "rss_pending", pending: remaining, seen, lastFullScanAt: previousFullScanAt, fullScanAt }),
    notices: [...notices, "Coverage is the current bounded official feed snapshot, not an exhaustive archive. New or changed feed entries fetch bodies at the feed-check cadence; unchanged bodies are rechecked once per 24 hours, subject to quota and availability. Corrections to releases no longer in the feed are not monitored."] };
}
