# News architecture V2: audit, implementation and growth plan

**Decision date: 9 September 2026. Scope: the existing MVP, its separate news service, 1,515 catalogue rows, and the path to 10,000–50,000 companies.**

## Decision

Keep the saved V1 as a reference and use **Global News 2** for the next news experience. V1 demonstrates aggregation and company feeds, but its stored coverage, source classifications and polling behaviour do not establish dependable current coverage. V2 adds a free official-release feed, an internal article reader, explicit optional provider connections, company and portfolio filtering, and visible source health.

Free users can read supported official releases without subscribing to a publisher. This does **not** provide every publisher’s full articles, comprehensive international company news, or guaranteed real-time coverage. A complete global commercial news product will need contracted coverage. Benzinga is the first full-text integration candidate; Marketaux is a candidate for global entity-tagged **snippets**. LSEG/Reuters and Factiva deserve enterprise evaluation when their coverage and display licences justify the cost. [1–11]

The working implementation is a **local single-workspace MVP**. Multi-tenant authentication, contractual entitlement enforcement, production retention rules and scale benchmarks remain release requirements. Adding 50,000 CSV rows alone would not meet those requirements.

## Saved version and rollback

Before changing the architecture, both repositories were committed and tagged `snapshot/news-v1-polymarket-20260909`:

| Repository | Baseline commit |
| --- | --- |
| MVP | `6e6c2730ca2923c2563be7bb7bb8054e1b457aeb` |
| Standalone news service | `c909cc2d716b44d1b75967f4f57554321849e428` |

The private local backup directory is `.local-backups/news-v1-polymarket-20260909/` in the MVP. It contains a full workspace archive, consistent SQLite and PostgreSQL backups, verified Git bundles, a checksum manifest and `RESTORE.md`. Source, existing reports, screenshots, the MVP and Polymarket integration are included. Private configuration is included in the protected backup; it must not be uploaded to the public repositories. Regenerable dependencies and build caches are excluded. V2 work is on `feature/news-v2` in both repositories.

## What the audit actually found

The MVP has **two news stores and two company universes**. `/news`, holdings and the original catalogue use SQLite and a 50-row CSV. `/global` uses the separate PostgreSQL service and the production CSV with 1,515 rows. Only 28 exact ticker strings overlap. The production file has 1,441 distinct exact company names; share classes and multiple listings must not automatically be treated as separate issuers. Another file contains 30,992 US instruments, including funds and other instruments; it is not evidence of 30,992 covered companies.

The live V1 database contained 38,244 articles and 52,423 company links. Of 1,515 active catalogue rows, 1,512 were resolved and 1,450 had some stored news. The latest ingestion run finished on **31 August 2026 at 17:31 UTC**, processed one company, and was roughly 202 hours old at the audit. Those numbers describe historical stored coverage, not a fresh complete feed.

| Finding | User impact | V2 response / remaining work |
| --- | --- | --- |
| Scheduler and runner acquired the same advisory lock on different connections | Scheduled ingestion could skip itself as “already running” | Remove the duplicate outer lock; keep exclusive execution in the runner |
| Non-ASCII characters were removed from the content hash | Different Cyrillic/CJK headlines could collapse into one | Preserve Unicode letters and digits; regression coverage |
| Timeout wrappers could leave network and limiter work running | Work continued after apparent failure; rate limits became misleading | Propagate cancellation; share redirect concurrency across companies |
| A paginated provider window could be marked complete after its first page | Missing stories became invisible to later incremental runs | Resume incomplete windows; never advance the stable watermark until completion |
| Provider names were used as a proxy for official-source quality | A syndicated report, issuer claim and official disclosure looked equivalent | Separate official, wire, aggregator and archive provenance; retain the original source |
| Any historical article could imply a successful connection | Old feeds looked healthy | Show per-provider last attempt, last success, errors and request budget |
| Existing company identity depended heavily on ticker strings | Cross-exchange collisions and false portfolio matches | Resolve using listing identity plus company evidence; show ambiguous/unmatched cases |
| Every headline opened a new tab | Users left the product immediately | Internal reader for all existing news entry points; original publisher remains an explicit option |
| General-feed image enrichment crawled publisher pages on a read | Slow reads, extra network requests and uncertain image rights | Use supplied images only; independent provider failures and a five-minute general-feed cache |
| Consumer/API credentials and display permission were not modelled separately | Technical access could be mistaken for a licence | Explicit display/full-text settings; paid connectors disabled by default |

Some V1 defects are fixed to protect the comparison experience. V1 archive content retains its original, unverified permission status; moving it into a different UI does not grant new rights. The remaining production work includes authenticated access to all older routes, removal of the old Finnhub-key exposure endpoint, replacement of arbitrary-URL image enrichment still used by older paths, and tenant-aware storage. V2 does not use those mechanisms.

## Architecture and data flow

```text
Official feeds                 Optional entitled provider APIs
Fed / ECB / SEC                Benzinga / Marketaux / Finnhub
          \                    /
       Fixed-source fetch adapters
       URL allowlist · timeout · size cap · real HTTP budget
                       |
          Durable PostgreSQL jobs and leases
          incremental cursor · retry status · no lost window
                       |
          Validate and normalise source records
          timestamps · rights · corrections / removals
                       |
       Articles + revisions + company evidence
       Company directory / listings → verified associations
                       |
       Authenticated V2 read API and provider settings
                       |
          Server-only MVP proxy on localhost
                       |
  Global News 2: all / macro / portfolio / company
  source selection · search · pagination · internal reader
```

Collection is source-driven: fetch a provider’s incremental stream once and associate each item with the relevant companies. Reading the directory or filtering a portfolio does not launch one external request per company. PostgreSQL stores jobs and checkpoints; a worker claims jobs with leases, refreshes leases, persists bounded batches and resumes unfinished windows. Source HTTP requests consume a shared database budget, including additional release-body and identity-mapping requests.

Each record includes the provider item ID, headline, supplied summary, permitted plain-text body, original URL, publisher, language, publication/update/receipt timestamps, topics, content mode, usage metadata, revision and deletion state. Company associations retain the evidence used to resolve them. Raw HTML is not rendered. Unknown image permission means no article image is shown; a neutral source mark is preferable to an invented news photograph.

Different providers’ copies remain attributable records. A future cross-provider story cluster should group related records without discarding independent reporting, corrections or conflicting claims. The MVP does not claim to have implemented semantic event clustering or an editorial fact-checking system.

## Sources, access and payment

| Source | What the connector supplies | Free / permission position | Current implementation |
| --- | --- | --- | --- |
| Federal Reserve Board | Institutional policy/regulatory releases and selected release text | No API key or publisher subscription. Board information is generally reusable unless marked otherwise; retain attribution and exclude third-party materials/seals. [1] | Live free source |
| European Central Bank | Selected institutional press releases and text | No subscription. Accurate attribution and modification disclosure apply; paid products must disclose the original is available free. Authored papers/speeches are excluded from this connector. [2] | Live free source |
| SEC EDGAR | Filing metadata, forms, dates, CIK-linked disclosures; supported document text where obtained | Public access without an API key; honest User-Agent and SEC fair-access rules. These are disclosures, not a complete journalism feed. [3–4] | Implemented; live requests returned HTTP 403 here |
| Benzinga | Incremental financial news, company tags, updates, removal events, optional full bodies | Provider API token and the appropriate business/customer-display agreement. Full text depends on the purchased product and entitlement. Project price is unknown. [5–6] | Connection UI and adapter; no paid credentials or live paid-feed test |
| Marketaux | Global headlines, descriptions/snippets, links, entity metadata | Free developer quota exists; published terms do not establish unrestricted business display. Obtain applicable commercial terms. **No full article bodies, including paid plans.** [7–9] | Connection UI and adapter; not connected |
| Finnhub | General headlines/summaries or a bounded selection of North American company-news queries | Personal plans cannot be used by a business even internally without written approval. Display/redistribution requires the appropriate rights. [10] | Connection UI and adapter; existing V1 key is not automatically reused |
| LSEG / Reuters | Enterprise global news and story APIs, identifiers and topics | Contracted product, source entitlements and customer-display/redistribution rights; a terminal login is insufficient | Enterprise evaluation only; no pretend connection [11] |
| Dow Jones / Factiva | Enterprise discovery, streams, archives and entitled article retrieval | Contracted source/content/display rights; consumer subscription is insufficient | Enterprise evaluation only [12] |

Marketaux’s advertised monthly API plans, checked on 9 September 2026: free **100 requests/day, 3 articles/request**; $29 **2,500/day, 20/request**; $49 **10,000/day, 50/request**; $99 **25,000/day, 100/request**; $199 **50,000/day, 100/request**. These prices describe API plans, not a confirmed customer redistribution licence. Its “200,000+ entities” claim is not a guarantee that our particular 50,000 companies have current news. [8]

The free official-source path has no publisher subscription charge. Hosting, engineering and maintenance still cost money. For paid content, an end user’s normal website login cannot be converted into API redistribution rights. The implemented forms accept provider API credentials, record the user’s declared display entitlement and separately enable full text where supported. A checked box does not verify a contract; it is a local setup control pending a production entitlement system.

## Reading inside the platform

The primary click opens an internal reader. Three honest content modes are available:

1. **Full article/release:** permitted text was actually retrieved and is rendered as plain text with attribution.
2. **News brief:** only the provider’s supplied summary is available; the UI says so.
3. **Source link:** the stored item has only a headline and source URL.

This avoids silently dropping users into a new browser tab. Opening the original publisher is optional and explicit; that publisher may still require payment. No paywall bypass, subscriber-cookie forwarding, arbitrary publisher scraper, embedded browser login or iframe is used. ECB business links must open its own full page, so copying a permitted release into our reader is distinct from framing the ECB website. [2]

Existing `/news` All News/My Stocks, company detail news, `/global`, and global company feeds use stable internal reader links. The original general-news brief cache is bounded to 2,000 items/30 days for this preview; that engineering limit is not itself a licence. Company catalogue pages also lead to the matching V2 company view, and the catalogue has an entry to the full 1,515-row news directory.

## Relevance, accuracy and freshness

**Official source** means identifiable institutional origin; it is not a guarantee that every claim is complete, impartial or correct. An issuer release is the issuer’s statement. A wire story is editorial reporting. An aggregator is a delivery mechanism. V2 preserves those distinctions instead of assigning universal credibility from a publisher-name regex.

Company-specific feeds require a verified association. Unmatched/ambiguous holdings are visible and are never silently expanded into the global feed. Direct company associations and general macro context remain distinct. A central-bank announcement can be useful to a portfolio without proving that it specifically concerns every holding. Provider entity tags remain evidence to check; they are not causal predictions about a share price.

The local portfolio resolver accepts up to 200 distinct holdings and reports an explicit limit for larger portfolios. This is separate from the paginated global company directory. Initial live matching identified only Apple. The final version resolves **all three current holdings** after adding two reviewed mappings: ASML/NASDAQ from ASML’s own share-listings page, and Alphabet Class A/GOOGL from its Q2 2026 filing. The mappings retain source URLs, review dates and a one-year review expiry; incorrect venues, countries and Class C substitutions remain rejected. V1 catalogue/listing rows were not changed. Unreviewed holdings are not quietly matched by ticker alone. [13–14]

V2 polls official sources every **15 minutes** by default and reads the local cache in visible browser tabs every **60 seconds**. Connected paid sources default to a five-minute collection interval, subject to their configured budget. This is **periodic refresh, not a real-time wire or guaranteed 60-second source latency**. Unchanged official feeds avoid fetching all bodies repeatedly; new/changed feed records are fetched, and unchanged release bodies receive a daily correction rescan while they remain in the bounded feed. A correction without a feed metadata change can therefore take about a day plus queue/budget delay to appear. Feed snapshots are not exhaustive archives.

The UI shows publication time separately from receipt/check time, partial errors, missing source coverage and exhausted quotas. A source checked today can legitimately have no release today. Successful polling does not prove that the upstream source published everything or that a company had no news.

Production targets should be agreed after measurement: 99% of eligible received items processed within two minutes, source-specific lag alerts after two missed collection intervals, correction/removal propagation within the contracted feed’s update interval, and separately sampled association precision. These are proposed acceptance targets, not measured MVP SLAs. A multilingual labelled evaluation set should include ambiguous tickers, subsidiaries, funds, share classes, renames, delistings and negative examples.

## Scaling from 1,515 to 50,000 companies

At one request per company and 55 requests/minute, a complete sweep takes approximately 27 minutes for 1,500 companies, 3 hours for 10,000 and 15 hours for 50,000—even before retries or pagination. Repeating a per-company query every five minutes would require 432,000, 2.88 million or 14.4 million requests/day respectively. Increasing thread count cannot overcome those quotas.

| Layer | Implemented now | Required before sustained 10k–50k operation |
| --- | --- | --- |
| Identity | Existing company/listing directory; conservative matching; visible unresolved cases | Audited issuer/security/listing hierarchy, permanent IDs such as LEI/FIGI/ISIN/CIK where licensed, aliases and corporate-action history |
| Acquisition | Bounded incremental provider jobs; shared source budgets | Contracted feed capacity, bulk initial backfill, source-specific completeness monitoring and recovery SLAs |
| Storage | Indexed PostgreSQL articles, associations, revisions and jobs | Retention/partitioning by measured volume; archival storage where licensed; backup restore drills |
| Search | Bounded text search and cursor pagination | Full-text/trigram or dedicated search index, language-aware ranking and relevance evaluation |
| Distribution | One local workspace; server-only credentials | Authenticated tenants and users, licence/user/source cache keys, per-request entitlement checks, audited revocation and deletion |
| Performance | Directory pagination avoids a 50k quote/news request fanout | Load tests at expected article count and concurrent users; query plans, queue lag, p95/p99 latency and failure budgets |
| Product | All/macro/portfolio/company views and source selection | Regional coverage policy, translations where licensed, editorial handling of disputed/corrected stories |

Do not replace the root 50-company CSV with the production file without adapting its schema and quote/profile loading. The two files have different fields, country formats, name conventions and exchange identifiers. The new news directory accesses the full service catalogue without launching quote requests for every row.

## Implemented interface and evidence

The separate `/global-v2` page includes the feed, full directory, portfolio/company views, topic/source filters, search, pagination, provider settings, request status and an internal reader. Real-source screenshots and a machine-readable validation snapshot accompany this report under `screenshots/news-v2-*` and `news-v2-evidence/2026-09-09/`. Test fixtures, if used for failure-case UI tests, are not presented as live source evidence.

The final live check found **20 Fed releases, 6 ECB releases, zero SEC records**, and no connected commercial feed. All three sample holdings resolve, but **zero companies yet have newly ingested V2 company news**: the free records currently available are macro/regulatory releases, and SEC access is blocked. Matching a holding is not the same as supplying fresh company news. The separately selectable V1 archive supplies historical company briefs with unverified display rights and visible publication dates.

Validation completed: **127 offline news-service tests**, **6 PostgreSQL integration tests with transaction rollback**, **19 Polymarket regression tests**, **14 read-only local API checks**, production builds and targeted TypeScript/ESLint checks. Browser tests covered real release-body fidelity, internal/reloadable readers, provider forms, archive/company navigation, 390px mobile width and dark mode. Fixture-only tests additionally exercised revoked access, partial outage, credential handling and pagination. No paid provider credentials were available, so paid-feed ingestion and contractual entitlement have not been verified live.

### Live interface examples

![Global News 2, actual official-source feed](screenshots/news-v2-desktop.png)

*Captured from the running MVP on 9 September 2026. Publication dates, failed-source status and the distinction between catalogue size and news coverage are visible. Source illustrations are neutral interface artwork, not news photographs.*

![Actual Federal Reserve release read inside the MVP](screenshots/news-v2-reader.png)

*The 4 September Federal Reserve enforcement-release example contains 529 characters of retrieved release text. The reader preserves the source and original URL. It does not invent an article body from a headline.*

![Optional provider connections](screenshots/news-v2-providers.png)

*Real connection settings: free sources plus optional API providers. No commercial key was saved or tested for this screenshot.*

![Full company directory](screenshots/news-v2-directory.png)

*The news directory reads the 1,515-row service catalogue with pagination, separately from the original 50-company quote catalogue.*

![Real portfolio archive after reviewed holdings matching](screenshots/news-v2-portfolio.png)

*All three current holdings match. The view shows 18 real archived company stories; the newest was published on 31 August 2026. Archive status and the age warning remain visible. This is evidence of working company filters, not fresh free company coverage.*

## Operating the local version

Keep the existing V1 service on port 8080. Run the V2 service separately on localhost 8081 with `NEWS_V2_WORKER_ENABLED=true` and the V1 scheduler disabled. The root `.env` points `NEWS_V2_SERVICE_URL` to 8081. Both processes share the same `NEWS_V2_ADMIN_TOKEN`; the service additionally needs a random 32-byte base64 `NEWS_V2_ENCRYPTION_KEY`. Those values are server-only and have been configured in the local workspace without committing them.

The migration is additive. Paid providers remain disabled and unconfigured until an entitled user connects them. Default daily budgets are 600 actual HTTP requests per free source and 100 per paid source; these are conservative application caps, not purchased quota guarantees. Jobs and state survive restarts. Pausing/disconnecting a source prevents further display/fetch; credential and content cleanup must follow the exact provider agreement, including backup retention in a production system.

The V2 MVP proxy intentionally serves this single workspace only on localhost in development. Production requires authenticated tenant isolation before enabling it. No provider purchases, sales messages or public deployment were performed.

## Sources

All external sources were checked on 9 September 2026. Repository findings come from code inspection and the local databases; provider access and pricing claims below are based on the providers’ own documentation and terms.

1. [Federal Reserve disclaimer and reuse policy](https://www.federalreserve.gov/disclaimer.htm); [official RSS feeds](https://www.federalreserve.gov/feeds/feeds.htm).
2. [ECB disclaimer, copyright, reuse and framing conditions](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html); [ECB RSS](https://www.ecb.europa.eu/rss/press.html).
3. [SEC EDGAR APIs and fair access](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
4. [SEC webmaster FAQ and public content](https://www.sec.gov/about/webmaster-frequently-asked-questions); [SEC RSS](https://www.sec.gov/about/rss-feeds).
5. [Benzinga API FAQ](https://docs.benzinga.com/introduction/faq); [newsfeed API guide](https://www.benzinga.com/apis/blog/mastering-the-benzinga-newsfeed-api/).
6. [Benzinga official AWS Marketplace product](https://aws.amazon.com/marketplace/pp/prodview-xwgvhwowjmw3g); [product EULA](https://d7umqicpi7263.cloudfront.net/eula/slK904JkkKlPCY4pY7CfGXLQMFrKBnDJAgNQKt_yXMI).
7. [Marketaux documentation](https://www.marketaux.com/documentation); [FAQ: snippets only](https://www.marketaux.com/faq).
8. [Marketaux pricing](https://www.marketaux.com/pricing).
9. [Marketaux terms](https://www.marketaux.com/tos).
10. [Finnhub terms: business use and redistribution](https://finnhub.io/terms-of-service); [API documentation](https://finnhub.io/docs/api).
11. [LSEG News overview](https://developers.lseg.com/en/product/news/overview); [official news API pagination guidance](https://developers.lseg.com/en/article-catalog/article/lseg-data-library-for-python--news-pagination).
12. [Dow Jones official Factiva Analytics SDK](https://github.com/dowjones/factiva-analytics-python).
13. [ASML issuer share-listings table: NASDAQ ASML](https://www.asml.com/en/investors/shares).
14. [Alphabet Q2 2026 filing cover: GOOGL Class A and GOOG Class C](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/R1.htm).
