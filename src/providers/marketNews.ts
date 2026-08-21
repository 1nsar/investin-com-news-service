import { config } from "../config/index.js";
import { HttpError, requestJson } from "../util/http.js";
import { RateLimiter } from "../util/rateLimiter.js";
import type { RawArticle } from "./types.js";

/** Market-wide news.
 *
 *  Company news answers "what happened to this business". It does not answer
 *  the question an investor usually cares about first: what is moving markets
 *  today. A conflict, a rate decision, a natural disaster or an export control
 *  can move a portfolio hard without naming a single company in the catalogue,
 *  and a company-keyed feed will never surface any of it.
 *
 *  This source is deliberately separate from the company providers. Those are
 *  keyed by symbol and answer "news for company X"; this one is keyed by
 *  category and answers "news for the market". Fusing them into one interface
 *  would mean pretending a macro story belongs to some particular ticker.
 *
 *  It is also the highest-quality source in the whole component. Finnhub's
 *  free general feed is Reuters, CNBC and Bloomberg - primary wires, where the
 *  company endpoint is dominated by aggregators. */

interface FinnhubMarketArticle {
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

/** Free categories, verified against the free tier. `general` carries the
 *  macro and geopolitical stories; `merger` is corporate-action flow. */
export const MARKET_CATEGORIES = ["general", "merger", "crypto", "forex"] as const;
export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export interface MarketArticle extends RawArticle {
  category: string;
  /** Tickers the provider itself associated with the story, when it did. */
  relatedSymbols: string[];
}

export class MarketNewsSource {
  readonly name = "finnhub_market";
  readonly label = "Finnhub market news (Reuters / CNBC / Bloomberg)";
  readonly limiter = new RateLimiter("finnhub_market", config.FINNHUB_RATE_LIMIT_PER_MIN);

  isConfigured(): boolean {
    return Boolean(config.FINNHUB_API_KEY);
  }

  async fetchCategory(category: MarketCategory): Promise<MarketArticle[]> {
    if (!this.isConfigured()) return [];

    const url =
      `https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}` +
      `&token=${config.FINNHUB_API_KEY}`;

    try {
      const payload = await requestJson<FinnhubMarketArticle[]>(url, {
        limiter: this.limiter,
        label: `finnhub/news/${category}`,
        timeoutMs: 20_000,
        maxRetries: config.INGEST_MAX_RETRIES,
      });
      if (!Array.isArray(payload)) return [];

      const articles: MarketArticle[] = [];
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
          category: item.category || category,
          // Finnhub sometimes tags a general story with symbols. When it does,
          // that is a provider-supplied association, not a guess of ours.
          relatedSymbols: (item.related || "")
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean),
        });
      }
      return articles;
    } catch (error) {
      if (error instanceof HttpError && error.isAccessDenied) {
        // A category outside the current plan. Not fatal - skip it.
        return [];
      }
      throw error;
    }
  }

  /** Every configured category, deduplicated by URL across categories. */
  async fetchAll(categories: readonly MarketCategory[] = ["general", "merger"]): Promise<MarketArticle[]> {
    const seen = new Set<string>();
    const all: MarketArticle[] = [];
    for (const category of categories) {
      for (const article of await this.fetchCategory(category)) {
        if (seen.has(article.url)) continue;
        seen.add(article.url);
        all.push(article);
      }
    }
    return all;
  }
}
