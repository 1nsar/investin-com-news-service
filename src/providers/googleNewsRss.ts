import { XMLParser } from "fast-xml-parser";
import { config } from "../config/index.js";
import { searchableName } from "../catalogue/names.js";
import { HttpError, request } from "../util/http.js";
import { RateLimiter } from "../util/rateLimiter.js";
import type {
  FetchRequest,
  FetchableCompany,
  NewsProvider,
  ProviderCapability,
  ProviderOutcome,
  RawArticle,
} from "./types.js";

/** Google News RSS.
 *
 *  The international fallback. It searches by company NAME, not by ticker,
 *  which is exactly why it covers the listings Finnhub's free plan refuses -
 *  and exactly why it is the riskier source: a name query can return a story
 *  about a different business. Everything it produces is tagged
 *  `match_method = 'name_match'` so that risk stays visible downstream rather
 *  than being laundered into the same shape as ticker-native data.
 *
 *  Locale matters more than it looks. Munich Re returns almost nothing in
 *  en-US and a full feed in de-DE, so the query is issued against the home
 *  country's edition when we know it. */

const BASE_URL = "https://news.google.com/rss/search";

/** country -> [hl, gl, ceid] for the local edition. */
const LOCALES: Record<string, [string, string, string]> = {
  DE: ["de", "DE", "DE:de"], CH: ["de", "CH", "CH:de"], AT: ["de", "AT", "AT:de"],
  FR: ["fr", "FR", "FR:fr"], BE: ["fr", "BE", "BE:fr"], IT: ["it", "IT", "IT:it"],
  ES: ["es", "ES", "ES:es"], MX: ["es", "MX", "MX:es"], NL: ["nl", "NL", "NL:nl"],
  SE: ["sv", "SE", "SE:sv"], NO: ["no", "NO", "NO:no"], DK: ["da", "DK", "DK:da"],
  FI: ["fi", "FI", "FI:fi"], GR: ["el", "GR", "GR:el"], JP: ["ja", "JP", "JP:ja"],
  CN: ["zh-CN", "CN", "CN:zh-Hans"], HK: ["zh-HK", "HK", "HK:zh-Hant"],
  TW: ["zh-TW", "TW", "TW:zh-Hant"], IN: ["en", "IN", "IN:en"],
  ID: ["id", "ID", "ID:id"], GB: ["en", "GB", "GB:en"], IE: ["en", "IE", "IE:en"],
  CA: ["en", "CA", "CA:en"], AU: ["en", "AU", "AU:en"], SG: ["en", "SG", "SG:en"],
  IL: ["he", "IL", "IL:he"], KZ: ["ru", "KZ", "KZ:ru"], US: ["en", "US", "US:en"],
};

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  source?: string | { "#text"?: string };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

/** Enough hits that a broader, riskier query is not worth running. */
const ENOUGH_ITEMS = 5;

export class GoogleNewsRssProvider implements NewsProvider {
  readonly name = "google_news_rss";
  readonly label = "Google News RSS (name search)";
  readonly limiter = new RateLimiter("google_news_rss", config.GOOGLE_NEWS_RATE_LIMIT_PER_MIN);

  isConfigured(): boolean {
    return true; // no credentials
  }

  supports(company: FetchableCompany): ProviderCapability {
    const name = searchableName(company.companyName);
    if (!name || name.length < 2) {
      return { supported: false, reason: "company name too short to search" };
    }
    const primary = company.listings.find((listing) => listing.isPrimary) ?? company.listings[0];
    return {
      supported: true,
      symbol: name,
      listingId: primary?.id,
      matchMethod: "name_match",
    };
  }

  private buildUrl(query: string, country: string | null, days: number): string {
    const [hl, gl, ceid] = LOCALES[(country ?? "US").toUpperCase()] ?? LOCALES.US!;
    const params = new URLSearchParams({
      q: `${query} when:${Math.max(1, Math.min(days, 30))}d`,
      hl,
      gl,
      ceid,
    });
    return `${BASE_URL}?${params.toString()}`;
  }

  private async search(url: string): Promise<RawArticle[]> {
    const xml = await request(url, {
      limiter: this.limiter,
      label: "google-news-rss",
      timeoutMs: 15_000,
      maxRetries: 2,
      headers: { accept: "application/rss+xml, application/xml;q=0.9" },
    });

    const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
    const raw = parsed?.rss?.channel?.item;
    if (!raw) return [];
    const items = Array.isArray(raw) ? raw : [raw];

    const articles: RawArticle[] = [];
    for (const item of items) {
      if (!item?.title || !item?.link) continue;
      const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
      if (Number.isNaN(publishedAt.getTime())) continue;
      const source =
        typeof item.source === "string" ? item.source : item.source?.["#text"] ?? null;
      articles.push({
        headline: String(item.title),
        url: String(item.link),
        // The description is Google's own link markup, not a real summary.
        summary: null,
        source,
        publishedAt,
        imageUrl: null,
        language: null,
      });
    }
    return articles;
  }

  async fetch(req: FetchRequest): Promise<ProviderOutcome> {
    const capability = this.supports(req.company);
    if (!capability.supported || !capability.symbol) {
      return { kind: "unsupported", reason: capability.reason ?? "unsupported" };
    }

    const name = capability.symbol;
    const days = Math.max(
      1,
      Math.ceil((req.to.getTime() - req.from.getTime()) / (24 * 60 * 60 * 1000)),
    );

    // Narrowest query first. The exact phrase avoids matching unrelated
    // companies that share a word; if it is too tight to return anything, the
    // unquoted form and then the home-country edition widen the net.
    const attempts: string[] = [
      this.buildUrl(`"${name}"`, "US", days),
      this.buildUrl(name, "US", days),
    ];
    if (req.company.country && req.company.country.toUpperCase() !== "US") {
      attempts.push(this.buildUrl(`"${name}"`, req.company.country, days));
    }

    let best: RawArticle[] = [];
    try {
      for (const url of attempts) {
        const articles = await this.search(url);
        if (articles.length > best.length) best = articles;
        if (best.length >= ENOUGH_ITEMS) break;
      }
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.isRateLimited) {
          return { kind: "rate_limited", message: "google news rate limit", symbolUsed: name };
        }
        if (error.isAccessDenied) {
          return {
            kind: "refused",
            httpStatus: error.status,
            message: error.body.slice(0, 200) || "access denied",
            symbolUsed: name,
          };
        }
      }
      // A partial result is still worth keeping.
      if (best.length === 0) {
        return {
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
          symbolUsed: name,
        };
      }
    }

    const withinWindow = best.filter((article) => article.publishedAt >= req.from);
    if (withinWindow.length === 0) {
      return { kind: "no_news", symbolUsed: name, listingId: capability.listingId };
    }
    return {
      kind: "ok",
      articles: withinWindow,
      symbolUsed: name,
      matchMethod: "name_match",
      listingId: capability.listingId,
    };
  }
}
