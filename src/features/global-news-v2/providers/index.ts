import type { ProviderBatch, ProviderDefinition, ProviderFetchRequest } from "../types.js";
import { fetchOfficialFeed } from "./official.js";
import { fetchBenzinga, fetchFinnhub, fetchMarketaux } from "./paid.js";
import { fetchSec } from "./sec.js";
import { withRequestBudget } from "./http.js";
export { ProviderFetchError } from "./http.js";

const key = { key: "apiKey", label: "Provider API key", secret: true, required: true };
const definitions: ProviderDefinition[] = [
  { id: "fed", name: "Federal Reserve Board", kind: "official", free: true,
    description: "Official policy and regulatory releases, with reusable Board text and attribution. Current feed snapshot; not company-news coverage.",
    documentationUrl: "https://www.federalreserve.gov/feeds/feeds.htm", credentialFields: [], supportsFullText: true, requestsPerMinute: 30 },
  { id: "ecb", name: "European Central Bank", kind: "official", free: true,
    description: "Selected institutional press releases. Accurate attribution required; information is free on the ECB website. Authored speeches, research papers and logos excluded.",
    documentationUrl: "https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html", credentialFields: [], supportsFullText: true, requestsPerMinute: 30 },
  { id: "sec", name: "SEC EDGAR disclosures", kind: "official", free: true,
    description: "Latest supported SEC filings, or ten latest disclosures for up to ten selected CIKs. No key; current network access returned HTTP403. Not comprehensive global journalism.",
    documentationUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
    credentialFields: [{ key: "ciks", label: "Optional SEC CIKs (comma-separated, maximum 10)", secret: false, required: false }], supportsFullText: true, requestsPerMinute: 30 },
  { id: "benzinga", name: "Benzinga", kind: "wire", free: false,
    description: "Incremental licensed headlines, optional full article bodies and removal events. API subscription and applicable display permission required; consumer login is insufficient.",
    documentationUrl: "https://docs.benzinga.com/api-reference/news-api/get-news-items", credentialFields: [key], supportsFullText: true, requestsPerMinute: 20 },
  { id: "marketaux", name: "Marketaux", kind: "aggregator", free: false,
    description: "Global entity-tagged news snippets and original links. Full articles are unavailable, including on paid plans; business-display scope must be confirmed.",
    documentationUrl: "https://www.marketaux.com/documentation", credentialFields: [key], supportsFullText: false, requestsPerMinute: 10 },
  { id: "finnhub", name: "Finnhub", kind: "aggregator", free: false,
    description: "General-market summaries or up to five explicitly selected North American company symbols. Personal plans do not permit business use without written approval.",
    documentationUrl: "https://finnhub.io/terms-of-service", credentialFields: [key, { key: "symbols", label: "Optional company symbols (comma-separated, maximum 5)", secret: false, required: false }],
    supportsFullText: false, requestsPerMinute: 10 },
];
export function listProviderDefinitions(): ProviderDefinition[] { return structuredClone(definitions); }
export async function fetchProviderBatch(request: ProviderFetchRequest): Promise<ProviderBatch> {
  const result = await withRequestBudget(request.acquireRequest, async () => {
    switch (request.providerId) {
      case "fed": case "ecb": return fetchOfficialFeed(request);
      case "sec": return fetchSec(request);
      case "benzinga": return fetchBenzinga(request);
      case "marketaux": return fetchMarketaux(request);
      case "finnhub": return fetchFinnhub(request);
    }
  });
  // A malicious/erroring provider may echo credentials in otherwise valid fields.
  // Redact exact values at the boundary as well as never logging request URLs.
  const secret = request.credentials.apiKey?.trim();
  if (!secret) return result;
  const clean = (value: unknown): unknown => {
    if (typeof value === "string") return value.replaceAll(secret, "[redacted]").replaceAll(encodeURIComponent(secret), "[redacted]");
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, clean(entry)]));
    return value;
  };
  return clean(result) as ProviderBatch;
}
