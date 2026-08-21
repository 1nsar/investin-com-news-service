import "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCompany, listCompanies, listingMapping } from "../repository.js";

const ListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  country: z.string().trim().length(2).optional(),
  exchange: z.string().trim().min(1).optional(),
  us_listed: z.enum(["true", "false"]).optional(),
  resolution_status: z.enum(["pending", "resolved", "ambiguous", "unresolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/companies", {
    schema: {
      description: "Tracked companies with their resolved listings.",
      tags: ["companies"],
    },
  }, async (request, reply) => {
    const parsed = ListQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_query", detail: parsed.error.issues });
    }
    const filters = parsed.data;
    const { items, total } = await listCompanies({
      q: filters.q,
      country: filters.country,
      exchange: filters.exchange,
      usListed: filters.us_listed === undefined ? undefined : filters.us_listed === "true",
      resolutionStatus: filters.resolution_status,
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

  app.get("/v1/companies/:ticker", {
    schema: { description: "One company and every exchange it is listed on.", tags: ["companies"] },
  }, async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const company = await getCompany(ticker);
    if (!company) {
      return reply.code(404).send({ error: "not_found", detail: `no tracked company '${ticker}'` });
    }
    return { data: company };
  });

  app.get("/v1/listings", {
    schema: {
      description:
        "The resolved exchange/listing mapping for the whole catalogue, one row per listing.",
      tags: ["companies"],
    },
  }, async (request) => {
    const { limit = "1000", offset = "0" } = request.query as Record<string, string>;
    const rows = await listingMapping(
      Math.min(Number(limit) || 1000, 5000),
      Number(offset) || 0,
    );
    return { data: rows, pagination: { limit: Number(limit) || 1000, offset: Number(offset) || 0 } };
  });
}
