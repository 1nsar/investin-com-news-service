import { marketSymbol } from "../catalogue/exchanges.js";
import { config } from "../config/index.js";
import { HttpError, redactUrl, requestJson } from "../util/http.js";
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

/** Marketaux company news.
 *
 *  Added to close the gap the free stack cannot: companies outside the US and
 *  companies whose only US presence is a thinly-covered OTC line. Measured on
 *  this catalogue, those are where essentially all the missing coverage lives.
 *
 *  Two properties make it a better fit than another per-company US provider:
 *
 *  1. It is ENTITY-TAGGED. Each article arrives with the securities it
 *     mentions, so attribution comes from the provider rather than from our
 *     name-matching rules - the most error-prone code in this component, and
 *     the source of every misattribution the relevance layer had to catch.
 *  2. It is billed per REQUEST-DAY with a page size, not per request-minute.
 *     That is the shape a bulk "give me everything since X" pull needs, which
 *     is how this has to work if the catalogue grows past a few thousand
 *     companies. See docs/REPORT.md for the arithmetic.
 *
 *  This adapter is the per-company form, so it slots into the existing chain
 *  unchanged. The bulk form is a separate interface and a later step. */

interface MarketauxEntity {
  symbol: string;
  name: string;
  exchange: string | null;
  exchange_long: string | null;
  country: string | null;
  type: string | null;
  match_score: number | null;
  sentiment_score: number | null;
}

interface MarketauxArticle {
  uuid: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  image_url: string | null;
  language: string | null;
  published_at: string;
  source: string | null;
  entities?: MarketauxEntity[];
}

interface MarketauxResponse {
  meta?: { found: number; returned: number; limit: number; page: number };
  data?: MarketauxArticle[];
  error?: { code: string; message: string };
}

const BASE_URL = "https://api.marketaux.com/v1/news/all";

/** Symbols to ask about, EXCHANGE-QUALIFIED.
 *
 *  `listings.symbol` holds the venue's own bare symbol, which is ambiguous
 *  across exchanges: "BBY" is Balfour Beatty in London and Best Buy in New
 *  York; "ADM" is Admiral Group in London and Archer-Daniels-Midland in New
 *  York. Sending a bare non-US symbol to a GLOBAL provider therefore asks
 *  about the wrong company - and because the reply would be tagged with the
 *  symbol we asked for, the entity check would confirm it. Every one of the
 *  seven collisions this component exists to catch would come back wrong, at
 *  ticker-native confidence.
 *
 *  Non-US listings are qualified with their exchange suffix (VOD -> VOD.L).
 *  US listings are already unambiguous and are sent bare. */
interface SymbolChoice {
  /** What to send to the provider. */
  query: string;
  /** The venue's bare symbol, used to confirm the reply's entity tags. */
  bare: string;
  listing: FetchableListing;
}

function chooseSymbols(company: FetchableCompany): SymbolChoice[] {
  const score = (listing: FetchableListing): number => {
    let value = 0;
    // A real exchange listing beats OTC. US and non-US exchanges rank equally:
    // this provider is global, so a London primary is as good as a US one.
    if (listing.mic && listing.mic !== "OOTC") value += 100;
    if (listing.isPrimary) value += 40;
    if (listing.securityKind === "ordinary") value += 20;
    if (listing.securityKind === "adr") value += 15;
    return value + listing.confidence * 10;
  };

  const seen = new Set<string>();
  const choices: SymbolChoice[] = [];
  for (const listing of [...company.listings].sort((left, right) => score(right) - score(left))) {
    if (!listing.symbol) continue;
    // A non-US symbol we cannot exchange-qualify is skipped entirely. Sending
    // it bare would ask a global provider about whichever company owns that
    // ticker elsewhere; keeping it would also let a zero-result masquerade as
    // an authoritative "no news" and stop the provider chain.
    const query = listing.isUs
      ? listing.symbol
      : marketSymbol(listing.exchangeCode, listing.symbol);
    if (!query || seen.has(query)) continue;
    seen.add(query);
    choices.push({ query, bare: listing.symbol, listing });
    if (choices.length === 3) break;
  }
  return choices;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 19);
}

export class MarketauxProvider implements NewsProvider {
  readonly name = "marketaux";
  readonly label = "Marketaux (entity-tagged, global)";
  readonly limiter = new RateLimiter("marketaux", config.MARKETAUX_RATE_LIMIT_PER_MIN);

  isConfigured(): boolean {
    return Boolean(config.MARKETAUX_API_KEY);
  }

  supports(company: FetchableCompany): ProviderCapability {
    if (!this.isConfigured()) {
      return { supported: false, reason: "MARKETAUX_API_KEY not set" };
    }
    const choices = chooseSymbols(company);
    if (choices.length === 0) {
      return { supported: false, reason: "no resolved listing to query" };
    }
    const best = choices[0] as SymbolChoice;
    return {
      supported: true,
      symbol: best.query,
      // The listing we actually asked about, not merely the primary one.
      listingId: best.listing.id,
      // The provider tags entities itself, so attribution is not our guess.
      matchMethod: "ticker",
    };
  }

  async fetch(request: FetchRequest): Promise<ProviderOutcome> {
    const capability = this.supports(request.company);
    if (!capability.supported || !capability.symbol) {
      return { kind: "unsupported", reason: capability.reason ?? "unsupported" };
    }

    const choices = chooseSymbols(request.company);
    const best = choices[0] as SymbolChoice;
    const primarySymbol = best.query;
    const params = new URLSearchParams({
      api_token: config.MARKETAUX_API_KEY,
      symbols: choices.map((choice) => choice.query).join(","),
      published_after: toIsoDate(request.from),
      published_before: toIsoDate(request.to),
      // Only articles where one of our symbols is a genuine subject, not a
      // passing mention in a market round-up.
      must_have_entities: "true",
      filter_entities: "true",
      language: config.MARKETAUX_LANGUAGES,
      limit: String(config.MARKETAUX_PAGE_SIZE),
    });

    const url = `${BASE_URL}?${params.toString()}`;

    try {
      const payload = await requestJson<MarketauxResponse>(url, {
        limiter: this.limiter,
        label: `marketaux/news/${primarySymbol}`,
        timeoutMs: 20_000,
        maxRetries: config.INGEST_MAX_RETRIES,
      });

      if (payload.error) {
        // Error bodies are stored in fetch_run_companies.error and served by
        // the runs API. Marketaux takes its credential as a query parameter,
        // so an error that echoes the request would publish the key.
        const message = redactUrl(`${payload.error.code}: ${payload.error.message}`);
        // Quota exhaustion is reported in the body with a 200, so it has to be
        // recognised here rather than by status code.
        if (/usage_limit|rate|quota/i.test(payload.error.code)) {
          return { kind: "rate_limited", message, symbolUsed: primarySymbol };
        }
        return { kind: "refused", httpStatus: 200, message, symbolUsed: primarySymbol };
      }

      const rows = payload.data ?? [];
      if (rows.length === 0) {
        // Marketaux draws on thousands of sources across 80+ markets, so a
        // zero here is meaningful for any listing we can name.
        return { kind: "no_news", symbolUsed: primarySymbol, listingId: capability.listingId, authoritative: true };
      }

      // Accept an entity tagged with either the qualified form we asked for
      // (BBY.L) or the venue's bare symbol (BBY) - providers vary. Confirming
      // against the bare symbol alone would be unsafe, but here the QUERY was
      // exchange-qualified, so a reply can only concern the intended security.
      // ONLY the exchange-qualified form we actually asked for.
      //
      // Also accepting the bare symbol would put "ADM", "BBY", "NOV" and the
      // rest of the collision tickers into the accepted set - and a reply
      // tagged with Archer-Daniels' "ADM" would then be stored against Admiral
      // Group at ticker-native confidence. Verified against the live API:
      // Marketaux echoes the qualified form exactly as requested, so the bare
      // entries can never legitimately fire.
      const wanted = new Set(choices.map((choice) => choice.query.toUpperCase()));
      const articles: RawArticle[] = [];

      for (const row of rows) {
        if (!row?.url || !row?.title || !row?.published_at) continue;
        const publishedAt = new Date(row.published_at);
        if (Number.isNaN(publishedAt.getTime())) continue;

        // Trust the provider's tagging, but confirm one of OUR symbols is
        // actually among the entities - `filter_entities` is a request hint,
        // not a guarantee, and a silent widening would reintroduce exactly the
        // misattribution the relevance layer exists to prevent.
        // Confirmation is MANDATORY, not conditional.
        //
        // Accepting an article that carries no entity tags would attribute it
        // with ticker-native confidence on no evidence at all - precisely the
        // failure the relevance layer exists to prevent. `filter_entities` is
        // a request hint; this is the guarantee.
        const entities = row.entities ?? [];
        const matched = entities.some((entity) => wanted.has((entity.symbol ?? "").toUpperCase()));
        if (!matched) continue;

        articles.push({
          headline: row.title,
          url: row.url,
          summary: row.description || row.snippet || null,
          source: row.source || null,
          publishedAt,
          imageUrl: row.image_url || null,
          language: row.language || null,
        });
      }

      if (articles.length === 0) {
        return { kind: "no_news", symbolUsed: primarySymbol, listingId: capability.listingId, authoritative: true };
      }

      return {
        kind: "ok",
        articles,
        symbolUsed: primarySymbol,
        matchMethod: "ticker",
        listingId: capability.listingId,
      };
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.isAccessDenied) {
          return {
            kind: "refused",
            httpStatus: error.status,
            message: redactUrl(error.body).slice(0, 200) || "access denied",
            symbolUsed: primarySymbol,
          };
        }
        if (error.isRateLimited) {
          return { kind: "rate_limited", message: "marketaux rate limit", symbolUsed: primarySymbol };
        }
        return { kind: "error", message: error.message, symbolUsed: primarySymbol };
      }
      return {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        symbolUsed: primarySymbol,
      };
    }
  }
}
