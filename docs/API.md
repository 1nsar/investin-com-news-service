# API reference

Base URL: `http://localhost:8080`.

- **Interactive docs** (generated from the running service): **`/docs`**
- **Machine-readable OpenAPI 3 spec**: [`openapi.json`](openapi.json) in this
  directory, or `/docs/json` from a running instance. Regenerate with
  `npm run export:openapi`.

Every response is JSON. Collections return `{ data, pagination }`; single
resources return `{ data }`; errors return `{ error, detail }` with a matching
HTTP status.

There is no authentication. The component is designed to sit inside a private
network behind whatever gateway the platform already uses — see
[Security](#security) below.

---

## Conventions

**Pagination** — `limit` and `offset` on every collection.

```json
"pagination": { "total": 1515, "limit": 50, "offset": 0, "hasMore": true }
```

**Dates** — ISO 8601 in and out (`2026-08-12` or `2026-08-12T00:00:00Z`).

**Ticker** — the identifier is the catalogue's own `ticker` string, case
insensitive. It is deliberately *not* the resolved exchange symbol: the
catalogue ticker is the key the calling system already holds, and it stays
stable even when resolution changes its mind about which venue is primary.

**Confidence and match method** — every article link carries how it was
attributed:

| `match_method` | meaning | `confidence` |
| --- | --- | --- |
| `ticker` | a ticker-native provider returned it for a resolved symbol | 1.0 |
| `name_match` | found by searching the company name | 0.7 |

Filter with `match_method=ticker` or `min_confidence=0.9` when a consumer
cannot tolerate the chance of a name collision.

---

## Companies

### `GET /v1/companies`

Tracked companies with their resolved listings.

| Query | Description |
| --- | --- |
| `q` | substring match on name or ticker |
| `country` | two-letter catalogue country |
| `exchange` | has a listing on this exchange code, e.g. `LN` |
| `us_listed` | `true` / `false` — has any US listing |
| `resolution_status` | `resolved`, `pending`, `ambiguous`, `unresolved` |
| `limit`, `offset` | default 50, max 500 |

```bash
curl "localhost:8080/v1/companies?exchange=LN&limit=2"
```

Each company carries both what the catalogue claimed and what was resolved, so
a caller can see where the supplied data was wrong:

```json
{
  "ticker": "ADM",
  "company_name": "Admiral Group PLC",
  "catalogue_exchange_hint": null,
  "catalogue_is_us_listed": true,
  "resolution_status": "resolved",
  "listings": [
    { "exchange": "LN", "symbol": "ADM",   "isPrimary": true,  "isUs": false, "securityKind": "ordinary", "confidence": 0.7 },
    { "exchange": "US", "symbol": "AMIGY", "isPrimary": false, "isUs": true,  "securityKind": "adr",      "confidence": 0.75 }
  ],
  "article_count": 12,
  "latest_article_at": "2026-08-19T06:40:00.000Z"
}
```

### `GET /v1/companies/:ticker`

One company. `404` if it is not tracked.

### `GET /v1/listings`

The resolved exchange/listing mapping, flattened to one row per listing —
the same data as `npm run export:listings`, as an endpoint. `limit` defaults to
1000, max 5000.

---

## News

### `GET /v1/companies/:ticker/news`

A company's feed, newest first.

| Query | Description |
| --- | --- |
| `from`, `to` | publication window |
| `provider` | `finnhub`, `google_news_rss` |
| `match_method` | `ticker` or `name_match` |
| `min_confidence` | 0..1 |
| `max_companies` | drop round-ups: exclude articles filed against more than N companies. `3` is a good default for a company-focused feed |
| `max_source_tier` | `1` = primary wires only (Reuters, Bloomberg, CNBC), `2` adds established financial media, `3` = everything |
| `min_relevance` | 0..1. Effective relevance — the stored intrinsic score minus a round-up penalty computed from the live company count |
| `market_wide` | `true` isolates macro stories, `false` excludes them |
| `limit`, `offset` | default 50, max 200 |

**On `min_relevance`.** The stored score reflects how the article was
attributed (ticker-native vs verified name match) and its source tier. The
round-up penalty is applied at read time, because how many companies an article
ends up filed against is not known when it is stored. `max_companies` is the
exact control; `min_relevance` is the blended one.

```bash
curl "localhost:8080/v1/companies/AAPL/news?from=2026-08-12&limit=3"
```

```json
{
  "company": { "ticker": "AAPL", "companyName": "Apple Inc.", "resolutionStatus": "resolved", "listings": [] },
  "data": [
    {
      "id": 41,
      "headline": "Apple supplier signals stronger quarter",
      "url": "https://www.reuters.com/technology/...",
      "source": "Reuters",
      "provider": "finnhub",
      "published_at": "2026-08-18T13:02:00.000Z",
      "match_method": "ticker",
      "confidence": 1
    }
  ],
  "pagination": { "total": 128, "limit": 3, "offset": 0, "hasMore": true }
}
```

### `GET /v1/news`

The same feed across all companies. Accepts everything above plus `ticker`.

**One row per article, never per mention.** A story naming three companies is
one row with three entries in `companies[]`. `total` counts distinct articles.

```json
{
  "id": 812,
  "headline": "Novo Nordisk raises full-year guidance",
  "source": "Reuters",
  "source_tier": 1,
  "is_market_wide": false,
  "company_count": 1,
  "companies": [
    { "ticker": "NOV", "companyName": "Novo Nordisk A/S", "matchMethod": "ticker", "confidence": 1 }
  ]
}
```

### `GET /v1/market-news`

Macro, geopolitical and sector stories that move prices without being about one
company — the news a company-keyed feed structurally cannot surface.

| Query | Description |
| --- | --- |
| `from`, `to` | publication window |
| `max_source_tier` | `1` = primary wires only |
| `limit`, `offset` | default 50, max 200 |

```bash
curl "localhost:8080/v1/market-news?limit=5&max_source_tier=1"
```

Each story carries a `companies[]` array, populated only when the provider
supplied the symbol or the company is named outright. Most macro stories link
to nothing, which is correct: an oil embargo is not news about Chevron.

---

## Operations

### `GET /health`

Liveness. Does **not** touch the database on purpose — a database blip should
not cause an orchestrator to kill an otherwise healthy container.

### `GET /ready`

Readiness. Runs `SELECT 1`; `503` when the database is unreachable.

### `GET /v1/status`

The one endpoint to look at when something seems wrong: row counts, provider
configuration and rate-limit budget, and the last run's outcome broken down by
provider.

```json
{
  "counts": { "companies": 1515, "companies_resolved": 1497, "listings": 2673, "articles": 8214 },
  "providers": [{ "name": "finnhub", "configured": true, "rateLimit": { "perMinute": 55, "available": 55, "pausedMs": 0 } }],
  "lastRun": {
    "id": 12, "status": "partial",
    "hoursSinceFinished": 2.4, "stale": false,
    "outcomes": { "total": 1515, "ok": 1043, "noNews": 402, "refused": 0, "failed": 4, "unresolved": 18 },
    "articles": { "seen": 21044, "new": 1180 }
  }
}
```

`stale` goes true when the last run finished more than 36 hours ago. A daily
job that quietly stopped running produces no errors at all, so staleness is
the signal that catches it.

**`degradedProviders`** is the other signal worth watching. When a provider
fails and a fallback covers for it, the run still reports success — the
company got its news. That is correct behaviour and a dangerous thing to leave
invisible, so every provider attempted for a company is recorded, not just the
one that won:

```json
"degradedProviders": [
  { "failed_provider": "finnhub", "succeeded_provider": "google_news_rss", "companies": 156 }
]
```

A non-empty list means the primary source is not doing its job, even though
nothing errored at the run level. It is also a quality signal: those 156
companies silently moved from ticker-native attribution to name matching.

### `POST /v1/fetch`

Trigger a fetch without waiting for the schedule.

```bash
curl -X POST localhost:8080/v1/fetch                                  # whole catalogue
curl -X POST localhost:8080/v1/fetch -H 'content-type: application/json' \
     -d '{"tickers":["AAPL","ADM"],"wait":true}'                      # targeted, synchronous
```

| Field | Description |
| --- | --- |
| `tickers` | restrict to these catalogue tickers (max 500) |
| `limit` | cap the number of companies |
| `lookbackDays` | ignore stored state, refetch this many days (max 30) |
| `ignoreSuppression` | include companies currently backed off |
| `tier` | `hot`, `active`, `quiet` or `all` — refresh by measured news velocity, so a scheduler can run busy companies more often (see REPORT.md §6a) |
| `wait` | block until finished and return totals |

Returns `202` with a run started, or the totals when `wait: true`. Returns
`409` if an ingest is already running — the fetch is not reentrant within a
process.

### `GET /v1/runs`, `GET /v1/runs/latest`, `GET /v1/runs/:id`

Run history with per-provider breakdown.

### `GET /v1/runs/:id/companies`

Per-company outcomes for one run. `outcome` filters to a single class, which is
where the outcome taxonomy pays off:

```bash
# companies a provider refused to serve - an access problem
curl "localhost:8080/v1/runs/12/companies?outcome=refused"

# companies that genuinely had no news - not a problem at all
curl "localhost:8080/v1/runs/12/companies?outcome=no_news"
```

| Outcome | Meaning | Alert on it? |
| --- | --- | --- |
| `ok` | articles returned | no |
| `no_news` | provider answered cleanly with zero results | no |
| `refused` | 401/403 — the provider will not serve this symbol | **yes** |
| `rate_limited` | 429 after retries | yes, if sustained |
| `error` | network, timeout, or unexpected response | yes, above a baseline |
| `unresolved` | no listing resolved, so nothing to ask for | yes, if it grows |
| `skipped` | no configured provider could serve this company | yes, if it grows |

Per-company rows also carry `provider_attempts`, the ordered trail of every
provider tried:

```json
[{ "provider": "finnhub", "outcome": "error", "ms": 20001, "error": "timed out" },
 { "provider": "google_news_rss", "outcome": "ok", "ms": 8100, "symbol": "Admiral" }]
```

---

## Security

The component ships without authentication because it is designed to be
deployed inside a private network and integrated server-to-server. Two things
to know before exposing it more widely:

1. **`POST /v1/fetch` does real outbound work.** It is unauthenticated by
   default, which is appropriate behind a private-network gateway and not
   appropriate on a reachable port — an anonymous caller can start a
   ~28-minute run and consume the whole provider budget. Set `API_AUTH_TOKEN`
   to require a bearer token:

   ```bash
   curl -X POST localhost:8080/v1/fetch -H "authorization: Bearer $API_AUTH_TOKEN"
   ```

   Read endpoints stay open; they expose no credentials.
2. **Article text is third-party input.** Headlines and summaries come from
   public news sources and are stored verbatim. They are escaped as data by
   the JSON layer, but any downstream consumer that renders them as HTML, or
   feeds them into a language model, is handling attacker-influenceable text
   and should treat it accordingly.
