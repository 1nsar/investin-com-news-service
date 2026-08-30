# Company news component

A standalone backend that keeps a fresh, deduplicated news feed for every
company in a ~1,500-row catalogue.

It does three things:

1. **Resolves every catalogue ticker to a real security** — which exchange it
   trades on, and every other venue it trades on, including US depositary
   receipts.
2. **Fetches news per company** on a schedule or on demand, through a
   provider-agnostic source layer.
3. **Serves it over a documented HTTP API**, with per-run, per-company,
   per-provider reporting.

No UI. It runs as its own process, against its own database, configured
entirely by environment variables.

| Document | What's in it |
| --- | --- |
| **[docs/COMPARISON.md](docs/COMPARISON.md)** | News provider options priced and **measured against this catalogue**, and the primary + fallback recommendation |
| **[docs/API.md](docs/API.md)** | Full API reference. Machine-readable spec: [docs/openapi.json](docs/openapi.json), also live at `/docs` |
| **[docs/OPERATIONS.md](docs/OPERATIONS.md)** | Where this breaks first when it runs unattended for months, and what I deliberately did not build |
| **[docs/REPORT.md](docs/REPORT.md)** | **Full project report** — coverage, accuracy, latency, freshness, sources, cost, and the free-vs-paid recommendation |

---

## 1. Prerequisites

- **Docker** with Compose — the one-command path, and the only requirement.

Or, to run it directly:

- **Node.js 20+** (built on 22) and **PostgreSQL 14+**.

## 2. Quick start

```bash
cp .env.example .env
# put a free Finnhub key in .env - see section 3
docker compose up --build
```

That brings up Postgres, applies migrations, loads the catalogue, resolves
listings, and starts the API on **http://localhost:8080**. Interactive API docs
are at **http://localhost:8080/docs**.

> **First boot resolves 1,515 tickers before the API answers.**
>
> - With a free `OPENFIGI_API_KEY`: **~9 minutes** (measured)
> - Without one: **~38 minutes**, because the keyless limit is 25 requests/min
>
> The key is free and takes a minute to obtain at
> <https://www.openfigi.com/api>. It raises the batch size from 10 to 100 and
> the rate from 25 to 250 requests/minute, and it is the single highest-value
> optional setting in this component.
>
> Resolution runs **once**. Later boots start immediately.

Want to look around sooner? Resolve a slice first:

```bash
npm install
npm run migrate && npm run catalogue:load
npm run resolve -- --limit 100     # ~1 minute
npm run dev                        # no build step needed
```

<details>
<summary>Running without Docker</summary>

```bash
npm install
createdb newsdb                       # or point DATABASE_URL at any Postgres
npm run setup                         # migrate + load catalogue + resolve listings
npm run build && npm start            # or: npm run dev
```
</details>

## 3. Configuration and API keys

Everything is environment variables. **[`.env.example`](.env.example) is the
API-key template** — copy it and fill in one key:

```bash
cp .env.example .env
```

It is also the complete list of settings, with defaults and comments.

| Variable | Required | What it does |
| --- | --- | --- |
| `FINNHUB_API_KEY` | **yes** | Company news for US-listed symbols, and the US symbol directory the resolver depends on. Free, no card: <https://finnhub.io/register> |
| `DATABASE_URL` | has a default | Points at the Compose database by default |
| `OPENFIGI_API_KEY` | no, but see below | Free key at <https://www.openfigi.com/api>. Raises listing resolution from ~25 requests/min to ~250, cutting a full resolve from ~20 minutes to ~2 |
| `MARKETAUX_API_KEY` | no | Entity-tagged global news — 80+ markets, 30+ languages. Closes the international and OTC gaps the free stack cannot reach. Free tier at <https://www.marketaux.com> is enough to evaluate |
| `NEWS_PROVIDER_ORDER` | no | Provider preference, e.g. `finnhub,marketaux,google_news_rss` |
| `DEAD_ARTICLE_HOSTS` | no | Hosts whose links/images are dropped at ingest. Defaults to `chartmill.com`; empty disables |
| `SCHEDULER_ENABLED` | no | In-process daily timer. Off by default — see [section 7](#7-scheduling) |

**No paid API is required.** The component runs entirely on free tiers. What a
paid tier would buy, and whether it is worth it for this catalogue, is answered
with measurements in [docs/COMPARISON.md](docs/COMPARISON.md).

## 4. Start it

```bash
docker compose up          # already migrated + resolved after the first run
```

Check it is healthy:

```bash
curl localhost:8080/health
curl localhost:8080/v1/status     # counts, providers, last run outcome, connectivity
./scripts/smoke-test.sh           # exercises every endpoint
```

## 5. Trigger a fetch on demand

Don't wait for a schedule.

```bash
# whole catalogue, asynchronous - returns immediately with 202
curl -X POST localhost:8080/v1/fetch

# a few companies, synchronous - returns the totals
curl -X POST localhost:8080/v1/fetch \
  -H 'content-type: application/json' \
  -d '{"tickers":["AAPL","ADM"],"wait":true}'

# watch it
curl localhost:8080/v1/runs/latest
```

### Market-wide news

Company news answers "what happened to this business". It does not answer what
is moving markets today — a conflict, a rate decision, an export control. That
is a separate feed, from a separate source:

```bash
npm run ingest:market                    # general + merger categories
curl localhost:8080/v1/market-news       # macro, geopolitical, sector stories
```

It is cheap (one request per category, a couple of seconds) and it is the
highest-quality source in the component: **66% primary wire** — Reuters, CNBC,
Bloomberg — against a company feed that is 97% aggregator. Run it far more
often than the company sweep.

Macro stories are stored market-scope and linked to a company only on hard
evidence, so they never flood 1,500 company timelines.

### Turning on Marketaux

Two values in `.env`, and nothing else:

```bash
MARKETAUX_API_KEY=your-key      # free tier at https://www.marketaux.com
MARKETAUX_PAGE_SIZE=3           # free tier caps the page size at 3
```

The provider order already includes it by default, so no code or config change
is needed — restart and it is in the chain. If you have an older `.env` that
pins `NEWS_PROVIDER_ORDER` without `marketaux`, the service logs a warning at
startup rather than ignoring the key silently.

Measure before paying:

```bash
npm run evaluate -- --per-segment 8
```

That samples the segments where coverage is actually missing (OTC-only, no US
line, unresolved) plus a US control group — roughly 100 requests, which fits a
free-tier daily quota. Sampling the catalogue evenly would spend the whole
quota re-confirming the 74% that already works.

> **The run figures below are from the measurement run that built the corpus.**
> They were produced with `google_news_rss` still enabled; the shipped default
> order is `finnhub,marketaux` (see below for why Google News RSS was retired).
> Re-run `npm run ingest` and `npm run metrics` for current numbers.

### Coverage: which provider serves which company

The default chain is `finnhub → marketaux`, and each is there for a reason
measured on this catalogue:

| Provider | Serves | Hit rate |
| --- | --- | --- |
| **Finnhub** (free) | Companies on a real US exchange | **87%**, ~11 articles each |
| **Marketaux** (optional) | Non-US listings and thin OTC lines | 75% US exchange, 50% OTC, 0% no-US-line |
| **Google News RSS** | *Retired from the default order* — see below | ~90%, but name-matched |

**Google News RSS is built but no longer enabled by default.** It returns
`news.google.com` redirect links rather than publisher addresses, and those
links cannot be opened: the token decodes to an opaque Google identifier rather
than the article's URL, the page returns nothing to a non-browser client, and
browsers frequently refuse the redirect. Such an article can also never carry an
image. The adapter remains in the tree and can be re-enabled by adding
`google_news_rss` to `NEWS_PROVIDER_ORDER`, but it costs ~140 companies of
coverage to gain links that fail when clicked.

**A zero result is not always a final answer.** Finnhub returns a clean zero
both for a quiet NYSE company and for one whose only US presence is a thin OTC
line — but its hit rate is 87% on the first and **21%** on the second. So each
provider now declares whether its own silence is *meaningful*; a
non-authoritative zero falls through to the next source instead of ending the
question. That one rule affected **224 companies** that were previously never
offered to the fallback at all.

Dropping `google_news_rss` also removed the origin of nearly every
misattribution the relevance layer had to filter out: it is the only
name-matched source in the chain.

### Link resolution

Finnhub does not return the article's URL. It returns a link into its own
domain — `finnhub.io/api/news?id=...` — which 302s onward to the publisher.
Ingest resolves that wrapper **before storing**, so what lands in the database
is the publisher's own address.

This is not cosmetic. Storing the wrapper meant every reader paid an extra hop
and the link died entirely if Finnhub was down; it **hid the destination**, so a
dead publisher could not be filtered until the reader clicked; and it broke
dedupe, since every wrapper carries a distinct `id`, so one wire story
syndicated to three outlets was three separate articles.

Resolution is one hop, best-effort, at concurrency 3 — the endpoint is
rate-limited, and 10-wide returned `429` for 30% of links while 3-wide resolved
every one. A failure keeps the wrapper, which still works, so an outage degrades
link quality rather than dropping articles.

To rewrite links stored before this existed:

```bash
npx tsx scripts/resolve-links.ts --dry-run   # report only
npx tsx scripts/resolve-links.ts             # rewrite, merging duplicates
```

### Filtering for quality

Not every article a provider returns is worth showing. Three filters, all on
`/v1/news` and `/v1/companies/:ticker/news`:

| Filter | Does |
| --- | --- |
| `max_companies=3` | drops round-ups — "today's top movers", filed against 28 companies and news about none of them |
| `max_source_tier=1` | primary wires only (Reuters, Bloomberg, CNBC); `2` adds established financial media |
| `min_relevance=0.6` | how likely the article is genuinely about this company |

Articles that could not be verified as being about a company are **rejected at
ingest**, not stored and hidden — see [docs/REPORT.md](docs/REPORT.md) §7b.

Or run the job directly, which is what a scheduler does:

```bash
npm run ingest                      # inside the container, or locally
npm run ingest -- --limit 50
npm run ingest -- --tickers AAPL,MSFT
npm run ingest -- --lookback 7      # ignore stored state, refetch 7 days
npm run ingest -- --tier hot        # busiest ~9% of companies (~70 seconds)
```

**Re-running is always safe.** Articles are deduplicated on a canonical URL, so
an overlapping window inserts nothing. Verified: an identical re-run over ten
companies saw 396 articles and inserted **0**.

## 6. How long it takes, and what it costs

Measured on this catalogue — 1,515 companies, free tiers only, one laptop and
a local Postgres.

### First boot (`docker compose up` / `npm run setup`)

| Stage | Time | Notes |
| --- | --- | --- |
| Migrations | < 1s | |
| Load + audit catalogue | ~1s | 1,515 rows |
| **Resolve listings** | **see below** | one-time; incremental afterwards |

Listing resolution is the slow part of a cold start, and it is bound by one
thing: **OpenFIGI allows 25 requests/minute without a key.**

Most of the catalogue never reaches OpenFIGI. Companies with a US exchange hint
are resolved against the locally-held US symbol directory — no network call at
all — which covers roughly two thirds of the list instantly. The remainder,
about 400–500 non-US and unmatched rows, is what the rate limit applies to.

- **Without an `OPENFIGI_API_KEY`: budget ~30–40 minutes**, almost entirely
  spent waiting on that limit.
- **With a free key** (250 req/min, 100 jobs per batch): **a few minutes.**

The key is free and takes a minute to obtain: <https://www.openfigi.com/api>.
It is the single highest-value optional setting in this component. Resolution
runs once — after it, only new or changed catalogue rows are re-resolved.

**Result:** 1,511 of 1,515 companies resolved (**99.7%**), 2,067 listings,
151 depositary receipts identified.

### A full news run

```
Run finished in 1570s (26.2 min)
  companies attempted        1515
  with articles              1192
  no news (clean zero)        272
  provider refused              0
  failed                        0
  unresolved (no listing)      51
  articles seen             14653
  articles new               6309
  articles rejected          3041

By provider and outcome
  finnhub            ok          943 companies
  finnhub            no_news     258 companies
  -                  unresolved   51 companies
```

**1,483 companies had a US listing and went to Finnhub; the rest fell through
to name-based search or had no listing to ask about.**

- **Time: 26 minutes**, set almost entirely by Finnhub's free tier of 60
  requests/minute. 1,483 companies is 1,483 calls; at the configured 55/min
  that is ~26 minutes of deliberate waiting. Raising `INGEST_CONCURRENCY`
  will not help — the rate limit is the constraint, not parallelism. A paid
  tier with a higher limit is the only thing that shortens this materially.
- **14,653 articles seen, 6,309 stored, 3,041 rejected as not about the company.** The gap is deduplication: one wire
  story mentioning several companies becomes one article row with several
  links, and a repeat of a URL already held is discarded. Re-running the same
  window stores **0**. Articles that could not be verified as being about a
  company are rejected here too, not stored and hidden.
- **Cost: $0.** No paid API is used anywhere. No language model is called at
  any point in a run.
- **Zero refusals and zero failures.** Finnhub is never asked about a symbol it
  cannot serve — the adapter declines those companies up front rather than
  spending a call and a retry on a predictable 403.

### Incremental runs

After the first run each company is fetched from where it left off, minus a
6-hour overlap so nothing slips through the gap between runs. Deduplication
makes that overlap free. Day-two runs see the same volume and store only what
is new.


## 7. Scheduling

The ingest is a standalone process, not an in-process timer, and that is the
recommended way to run it. A crashed API server should not silently stop the
daily fetch, and a stuck fetch should not take the API down with it.

**Use three tiers, not one cadence.** News volume in this catalogue is heavily
skewed — 7% of companies produce 49% of the articles, and 26% produce none in a
given week — so a single refresh rate spends most of its request budget asking
silent companies whether anything happened:

```cron
# Busiest ~7% of companies - 49% of all news volume. Takes ~70 seconds.
0 * * * *      cd /srv/news-component && npm run ingest -- --tier hot

# The working middle. Takes ~11 minutes.
30 */6 * * *   cd /srv/news-component && npm run ingest -- --tier active

# Full sweep: catches everything and re-tiers as company volume changes.
15 3 * * *     cd /srv/news-component && npm run ingest
```

That is roughly 6,600 calls/day for a ~1.8 hour weighted average article age,
against ~12 hours for a daily-only sweep. Tier membership is recomputed from
measured velocity on every run, so companies move between tiers on their own.
Full reasoning and the numbers behind it are in
[docs/REPORT.md](docs/REPORT.md) §6a.

If an external scheduler is not available, set `SCHEDULER_ENABLED=true` and
`SCHEDULER_CRON`. The in-process timer takes a Postgres advisory lock, so
running several replicas will not double-fetch.

## 8. Architecture

```
                    catalogue CSV
                          |
                    [ catalogue ]  parse, audit, upsert - raw values preserved
                          |
                    [ resolution ]  ticker -> security -> every venue
                       /       \
              OpenFIGI          Finnhub US symbol directory
             (identity)          (US lines, ADRs - one download)
                          |
                       listings ---------------------+
                          |                          |
                    [   ingest   ]                   |
                    provider order                   |
                     /          \                    |
             Finnhub            Google News RSS      |
          (ticker-native)       (name search)        |
                    \          /                     |
                  canonicalise + deduplicate         |
                          |                          |
                     PostgreSQL  <-------------------+
                          |
                    [    API    ]  Fastify, OpenAPI at /docs
```

**Layer boundaries.** Each directory under `src/` owns one job and talks to the
next only through types:

| Layer | Responsibility |
| --- | --- |
| `catalogue/` | Parse and audit the supplier file. Never corrects it. |
| `resolution/` | Ticker → security → the full set of listings. |
| `providers/` | One adapter interface; each source behind it. |
| `ingest/` | Orchestration, canonicalisation, deduplication, run isolation. |
| `observability/` | Run and per-company outcome recording. |
| `api/` | HTTP contract. Reads through its own query layer. |

### Three decisions worth explaining

**A ticker is not an identifier.** This catalogue proves it: `BBY` here is
Balfour Beatty, but `BBY` on a US exchange is Best Buy. `ADM` is Admiral Group
here and Archer-Daniels-Midland in New York. Narrowing by exchange is *still*
not enough — `ADM` filtered to London returns Archer-Daniels-Midland, because
it cross-lists there. So every resolution is confirmed against the company
name, and anything below the threshold is rejected and reported rather than
stored. Without this, seven companies in this catalogue would silently receive
another company's news.

**Resolving listings is what makes the news work.** A US ADR usually has news
where the home-exchange symbol returns nothing, and Finnhub's free tier serves
US symbols only. Discovering that Admiral Group trades as `AMIGY` in the US is
what moves it from "no free coverage" to "ticker-native coverage". That is why
listing resolution is a first-class stage with its own storage, not a lookup
buried in the fetch.

**A feed has to be trustworthy, not just full.** Name-based search filed a film
review under Kid ASA and every *Jensen Huang* story under Jensen-Group; only
63% of name-matched articles even contained the company's name. Links that
cannot be verified are now rejected at ingest rather than stored and labelled,
and round-ups filed against many companies are demoted. The rules are
deterministic and unit-tested against the real failures — no language model is
involved anywhere, because article text is third-party input and should never
steer the pipeline. See [docs/REPORT.md](docs/REPORT.md) §7b.

**"No news" and "provider refused" are different facts.** A clean zero-result
means a quiet company. A 403 means coverage is silently degrading. They are
separate outcomes from the adapter all the way to
`GET /v1/runs/:id/companies?outcome=refused`. Collapsing them into "0 articles"
is how a provider dropping a whole exchange goes unnoticed for a month.

### Adding a news provider

Implement `NewsProvider` ([src/providers/types.ts](src/providers/types.ts)),
register it in [src/providers/registry.ts](src/providers/registry.ts), and name
it in `NEWS_PROVIDER_ORDER`. Nothing in the ingest, storage or API layer knows
which providers exist.

```ts
export class MyProvider implements NewsProvider {
  readonly name = "my_provider";
  readonly limiter = new RateLimiter("my_provider", 60);
  isConfigured() { return Boolean(process.env.MY_KEY); }
  supports(company)  { /* can I serve this company, with which symbol? */ }
  async fetch(request) { /* return an outcome, never throw */ }
}
```

## 9. Data model

| Table | Holds |
| --- | --- |
| `companies` | One row per catalogue ticker. Supplier values kept verbatim in `*_raw` beside the resolution verdict. |
| `listings` | Every venue a company trades on: exchange, MIC, symbol, symbol format, security kind, FIGI, confidence, source. |
| `articles` | Canonical article, unique on `dedupe_hash`. Carries `source_tier` (1 = primary wire, 3 = aggregator) and `is_market_wide`. |
| `article_companies` | Many-to-many. One story mentioning three companies is one article row and three links, each carrying `match_method`, `confidence` and a `relevance` score with the reason it was assigned. |
| `fetch_runs` / `fetch_run_companies` | Per-run and per-company outcomes. |
| `company_fetch_state` | Per company and provider: where to resume, failure streak, back-off. |

Migrations in [src/db/migrations](src/db/migrations) are forward-only, applied
in filename order, tracked in `schema_migrations`, and guarded by a Postgres
advisory lock so concurrent container boots cannot race.

## 10. Deliverables

| Asked for | Where |
| --- | --- |
| Backend component + README | this repo |
| Comparison write-up | [docs/COMPARISON.md](docs/COMPARISON.md) |
| Resolved exchange/listing mapping, as data | `npm run export:listings` → [data/listings-mapping.csv](data/listings-mapping.csv) and `.json` (both tracked); also `GET /v1/listings` |
| How it was produced | [docs/COMPARISON.md](docs/COMPARISON.md) §1, and `src/resolution/` |
| Which companies are **not** covered, and why | `npm run export:gaps` → [data/coverage-gaps.csv](data/coverage-gaps.csv); analysed in [docs/REPORT.md](docs/REPORT.md) |
| Think past the happy path | [docs/OPERATIONS.md](docs/OPERATIONS.md) |

## 11. Commands

| Command | Does |
| --- | --- |
| `npm run setup` | Migrate, load the catalogue, resolve listings |
| `npm run migrate` | Migrations only |
| `npm run catalogue:load` | Reload the catalogue and print the data-quality audit |
| `npm run resolve` | Resolve pending companies (`-- --all` to redo everything) |
| `npm run ingest` | Fetch company news (`-- --tier hot\|active\|quiet` to refresh by news velocity) |
| `npm run ingest:market` | Fetch market-wide macro news |
| `npm run coverage:probe` | Measure provider hit rates on a stratified sample |
| `npm run evaluate` | Measure a provider against the segments where coverage is *missing* (OTC-only, no US line, unresolved) — designed for a small free-tier quota |
| `npm run export:listings` | Export the listing mapping |
| `npm run export:gaps` | Export every company with no news and a `gap_reason` → `data/coverage-gaps.csv` |
| `npm run resolve:links` | Rewrite stored provider redirect wrappers to publisher URLs (`-- --dry-run` to report only) |
| `npm run export:openapi` | Regenerate `docs/openapi.json` from the routes |
| `npm run metrics` | Regenerate every figure quoted in docs/REPORT.md from the live database, including the connectivity breakdown |
| `npm test` | Unit tests |
| `./scripts/smoke-test.sh` | End-to-end check against a running instance |
