import "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCompany, listMarketNews, listNews } from "../repository.js";

/** Default round-up cut-off for a single company's feed. 3 keeps stories that
 *  compare a company with one or two peers, and drops list articles. */
const DEFAULT_COMPANY_FEED_MAX_COMPANIES = 3;

const NewsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  provider: z.string().trim().min(1).optional(),
  // 'ticker' articles came from a ticker-native provider; 'name_match' ones
  // were found by searching the company name and carry more risk.
  match_method: z.enum(["ticker", "name_match"]).optional(),
  min_confidence: z.coerce.number().min(0).max(1).optional(),
  /** Drop round-ups. An article filed against many companies ("today's top
   *  movers", "dividend weekly") is rarely news about any one of them.
   *  `max_companies=3` is a good default for a company-focused feed. */
  max_companies: z.coerce.number().int().min(1).max(100).optional(),
  /** 1 = primary wires only (Reuters, Bloomberg, CNBC...), 2 = plus
   *  established financial media, 3 = everything including aggregators. */
  max_source_tier: z.coerce.number().int().min(1).max(3).optional(),
  /** 0..1. How likely the article is genuinely about this company. */
  min_relevance: z.coerce.number().min(0).max(1).optional(),
  /** Include, exclude, or isolate market-wide macro stories. */
  market_wide: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function newsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/market-news", {
    schema: {
      description:
        "Market-wide news: macro, geopolitical and sector stories that move prices without " +
        "being about one company. Sourced from primary wires (Reuters, CNBC, Bloomberg).",
      tags: ["news"],
    },
  }, async (request, reply) => {
    const Query = z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      max_source_tier: z.coerce.number().int().min(1).max(3).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const parsed = Query.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_query", detail: parsed.error.issues });
    }
    const { items, total } = await listMarketNews({
      from: parsed.data.from,
      to: parsed.data.to,
      maxSourceTier: parsed.data.max_source_tier,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return {
      data: items,
      pagination: {
        total,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        hasMore: parsed.data.offset + items.length < total,
      },
    };
  });

  app.get("/v1/companies/:ticker/news", {
    schema: {
      description: "A company's news feed, newest first. Paginated and filterable by date.",
      tags: ["news"],
    },
  }, async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const parsed = NewsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_query", detail: parsed.error.issues });
    }

    const company = await getCompany(ticker);
    if (!company) {
      return reply.code(404).send({ error: "not_found", detail: `no tracked company '${ticker}'` });
    }

    // A company's own feed defaults to excluding round-ups. An article filed
    // against many tickers ("today's top movers", "10 IT stocks with whale
    // alerts") is rarely news about any one of them, and left unfiltered those
    // dominate the feed of a widely-mentioned company like MSFT or AAPL.
    // Callers that want the unfiltered set pass max_companies explicitly.
    const filters = { max_companies: DEFAULT_COMPANY_FEED_MAX_COMPANIES, ...parsed.data };
    const { items, total } = await listNews({
      ticker,
      from: filters.from,
      to: filters.to,
      provider: filters.provider,
      matchMethod: filters.match_method,
      minConfidence: filters.min_confidence,
      maxCompanies: filters.max_companies,
      maxSourceTier: filters.max_source_tier,
      minRelevance: filters.min_relevance,
      marketWide: filters.market_wide === undefined ? undefined : filters.market_wide === "true",
      limit: filters.limit,
      offset: filters.offset,
    });

    return {
      company: {
        ticker: company.ticker,
        companyName: company.company_name,
        resolutionStatus: company.resolution_status,
        listings: company.listings,
      },
      data: items,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        hasMore: filters.offset + items.length < total,
      },
    };
  });

  app.get("/v1/news", {
    schema: { description: "Cross-company news feed, newest first.", tags: ["news"] },
  }, async (request, reply) => {
    const parsed = NewsQuery.extend({ ticker: z.string().trim().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_query", detail: parsed.error.issues });
    }
    const filters = parsed.data;
    const { items, total } = await listNews({
      ticker: filters.ticker,
      from: filters.from,
      to: filters.to,
      provider: filters.provider,
      matchMethod: filters.match_method,
      minConfidence: filters.min_confidence,
      maxCompanies: filters.max_companies,
      maxSourceTier: filters.max_source_tier,
      minRelevance: filters.min_relevance,
      marketWide: filters.market_wide === undefined ? undefined : filters.market_wide === "true",
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      data: items,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        hasMore: filters.offset + items.length < total,
      },
    };
  });
}
