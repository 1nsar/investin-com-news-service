import { config } from "../config/index.js";
import { HttpError, requestJson } from "../util/http.js";
import { RateLimiter } from "../util/rateLimiter.js";
import type {
  FetchRequest,
  FetchableCompany,
  FetchableListing,
  NewsProvider,
  ProviderCapability,
  ProviderOutcome,
  RawArticle,
} from "./types.js";

/** Finnhub company-news.
 *
 *  Ticker-native, structured, and the best free option for US-listed
 *  companies - which the brief makes the priority tier. Its free plan serves
 *  US symbols only: any exchange-suffixed symbol (VOD.L, 7203.T) answers 403,
 *  so this adapter declines those companies rather than burning a call and a
 *  retry on a refusal it can predict.
 *
 *  That "decline early" behaviour is why listing resolution matters so much.
 *  A foreign company with a US ADR is served here through the ADR symbol; the
 *  same company without one falls through to the next provider in the order. */

interface FinnhubArticle {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

const BASE_URL = "https://finnhub.io/api/v1";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Pick the listing to ask about, best first:
 *    a real US exchange listing, then a US ADR, then any US line (OTC).
 *  Confidence breaks ties so a name-matched ADR never outranks an exact one. */
function chooseListing(company: FetchableCompany): FetchableListing | undefined {
  const usListings = company.listings.filter((listing) => listing.isUs);
  if (usListings.length === 0) return undefined;

  const score = (listing: FetchableListing): number => {
    let value = 0;
    if (listing.mic && listing.mic !== "OOTC") value += 100;
    if (listing.securityKind === "adr") value += 30;
    if (listing.securityKind === "ordinary") value += 20;
    if (listing.isPrimary) value += 10;
    return value + listing.confidence * 10;
  };

  return [...usListings].sort((left, right) => score(right) - score(left))[0];
}

export class FinnhubProvider implements NewsProvider {
  readonly name = "finnhub";
  readonly label = "Finnhub company-news";
  readonly limiter = new RateLimiter("finnhub", config.FINNHUB_RATE_LIMIT_PER_MIN);

  isConfigured(): boolean {
    return Boolean(config.FINNHUB_API_KEY);
  }

  supports(company: FetchableCompany): ProviderCapability {
    if (!this.isConfigured()) {
      return { supported: false, reason: "FINNHUB_API_KEY not set" };
    }
    const listing = chooseListing(company);
    if (!listing) {
      return {
        supported: false,
        reason: "no US listing; free plan does not serve exchange-suffixed symbols",
      };
    }
    return {
      supported: true,
      symbol: listing.symbol,
      listingId: listing.id,
      matchMethod: "ticker",
    };
  }

  async fetch(request: FetchRequest): Promise<ProviderOutcome> {
    const capability = this.supports(request.company);
    if (!capability.supported || !capability.symbol) {
      return { kind: "unsupported", reason: capability.reason ?? "unsupported" };
    }

    const symbol = capability.symbol;
    const url =
      `${BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}` +
      `&from=${formatDate(request.from)}&to=${formatDate(request.to)}` +
      `&token=${config.FINNHUB_API_KEY}`;

    try {
      const payload = await requestJson<FinnhubArticle[]>(url, {
        limiter: this.limiter,
        label: `finnhub/company-news/${symbol}`,
        timeoutMs: 15_000,
        maxRetries: config.INGEST_MAX_RETRIES,
      });

      if (!Array.isArray(payload)) {
        return { kind: "error", message: "unexpected response shape", symbolUsed: symbol };
      }
      if (payload.length === 0) {
        return { kind: "no_news", symbolUsed: symbol, listingId: capability.listingId };
      }

      const articles: RawArticle[] = [];
      for (const item of payload) {
        if (!item?.url || !item?.headline || !item?.datetime) continue;
        const publishedAt = new Date(item.datetime * 1000);
        if (Number.isNaN(publishedAt.getTime())) continue;
        articles.push({
          headline: item.headline,
          url: item.url,
          summary: item.summary || null,
          source: item.source || null,
          publishedAt,
          imageUrl: item.image || null,
          language: "en",
        });
      }

      if (articles.length === 0) {
        return { kind: "no_news", symbolUsed: symbol, listingId: capability.listingId };
      }
      return {
        kind: "ok",
        articles,
        symbolUsed: symbol,
        matchMethod: "ticker",
        listingId: capability.listingId,
      };
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.isAccessDenied) {
          return {
            kind: "refused",
            httpStatus: error.status,
            message: error.body.slice(0, 200) || "access denied",
            symbolUsed: symbol,
          };
        }
        if (error.isRateLimited) {
          return { kind: "rate_limited", message: "finnhub rate limit", symbolUsed: symbol };
        }
        return { kind: "error", message: error.message, symbolUsed: symbol };
      }
      return {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        symbolUsed: symbol,
      };
    }
  }
}
