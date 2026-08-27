import type { RateLimiter } from "../util/rateLimiter.js";

/** A company as the ingest sees it: the catalogue row plus every resolved
 *  listing. Providers choose which listing they can serve from. */
export interface FetchableCompany {
  id: number;
  ticker: string;
  companyName: string;
  country: string | null;
  listings: FetchableListing[];
}

export interface FetchableListing {
  id: number;
  exchangeCode: string;
  mic: string | null;
  symbol: string;
  symbolFormat: string;
  securityKind: string;
  country: string | null;
  isUs: boolean;
  isPrimary: boolean;
  confidence: number;
}

/** One article as a provider reports it, before canonicalisation. */
export interface RawArticle {
  headline: string;
  url: string;
  summary?: string | null;
  source?: string | null;
  publishedAt: Date;
  imageUrl?: string | null;
  language?: string | null;
}

/** Whether a provider can serve a company at all, and how.
 *
 *  `matchMethod` matters downstream: a ticker-native provider attributes an
 *  article to a company with certainty, while a name-matched search can return
 *  a story about a different business with a similar name. The distinction is
 *  carried all the way into `article_companies` so a consumer can filter on it. */
export interface ProviderCapability {
  supported: boolean;
  /** Why not, when unsupported. Surfaced in run reporting. */
  reason?: string;
  symbol?: string;
  listingId?: number;
  matchMethod?: "ticker" | "name_match";
}

export interface FetchRequest {
  company: FetchableCompany;
  /** Inclusive window. The ingest sets `from` from the last successful run
   *  minus an overlap, so nothing falls through the gap between runs. */
  from: Date;
  to: Date;
  signal?: AbortSignal;
}

/** The outcome taxonomy the whole observability story depends on.
 *
 *  `no_news` and `refused` are deliberately separate: a clean zero-result is a
 *  legitimate answer about a quiet company, while a 403 means the provider
 *  will not serve us and coverage is silently degrading. Collapsing them into
 *  "0 articles" is how a provider quietly dropping a whole exchange goes
 *  unnoticed for a month. */
export type ProviderOutcome =
  | { kind: "ok"; articles: RawArticle[]; symbolUsed: string; matchMethod: "ticker" | "name_match"; listingId?: number }
  /** `authoritative` says whether this zero-result is EVIDENCE OF QUIET or
   *  merely evidence this provider does not cover the symbol well.
   *
   *  Finnhub answers a clean zero for a company on the NYSE and for a company
   *  whose only US presence is a thin OTC line - but its hit rate is 87% on
   *  the first and 21% on the second. Treating both as final meant 224
   *  companies were never offered to the fallback at all. Only the provider
   *  knows how much its own silence is worth, so it declares it here. */
  | { kind: "no_news"; symbolUsed: string; listingId?: number; authoritative: boolean }
  | { kind: "refused"; httpStatus: number; message: string; symbolUsed?: string }
  | { kind: "rate_limited"; message: string; symbolUsed?: string }
  | { kind: "error"; message: string; symbolUsed?: string }
  | { kind: "unsupported"; reason: string };

/** The contract every news source implements.
 *
 *  Adding a source means writing this interface and naming it in
 *  NEWS_PROVIDER_ORDER. Nothing in the ingest, the storage layer or the API
 *  knows which providers exist. */
export interface NewsProvider {
  /** Stable identifier, stored on every article and run row. */
  readonly name: string;
  /** Human-readable, for status output. */
  readonly label: string;
  /** Shared budget for this source; the HTTP layer takes a token per call. */
  readonly limiter: RateLimiter;
  /** True when the source is configured well enough to be used at all. */
  isConfigured(): boolean;
  /** Can this provider serve this company, and with which symbol? Pure and
   *  synchronous: the ingest calls it for every company on every run. */
  supports(company: FetchableCompany): ProviderCapability;
  /** Fetch a window. Must not throw for expected conditions - return the
   *  matching outcome instead, so one company never sinks a run. */
  fetch(request: FetchRequest): Promise<ProviderOutcome>;
}
