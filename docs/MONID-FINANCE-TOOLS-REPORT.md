# Monid Finance Tools: Coverage, Quality and Integration Costs

## Decision brief

**Monid lists useful research connectors, but the public evidence does not establish a licensed, complete, real-time data supply for our platform.** The finance catalogue advertises 71 tools; pagination exposes **70 unique tools**: 55 company/market/news tools and 15 insider/ownership tools. StockAnalysis accounts for the unresolved difference: eight advertised, seven retrievable. The missing listing cannot be identified or costed reliably. This report covers every retrievable finance tool as observed on 9 September 2026. News-category and prediction-market tools are outside this category-specific inventory. [^s1], [^s2]

The strongest opportunities are company research cards, filing-linked events and an Insider Activity feature. Only **three endpoints directly discover news**—Nasdaq news, Yahoo news and MarketBeat headlines—plus Finviz news sentiment. None establishes a licensed full-text reader, matching article photos, free access to publisher paywalls or complete macro news coverage.

Three findings materially affect the decision. StockAnalysis explicitly disclaims programmatic access and programmatic resale rights. Several SECForm4 public feeds show a six-month delay, although Monid’s actual entitlement is unknown. DefiLlama’s eight equity endpoints are documented official vendor APIs, but beta status, supported issuers and onward commercial display still need resolution. [^s3], [^s4], [^s5], [^s6]

**Recommendation:** evaluate a company-headline source with demonstrated commercial rights and DefiLlama’s documented financial/chart API as distinct additions; use official SEC disclosures as the preferred foundation for insider events. No examined Monid news connector is yet confirmed authorised for our use; an existing licensed adapter or direct provider is an alternative. Hold StockAnalysis production use pending proof of an authorised supply route. Do not purchase all overlapping tools. These are research recommendations; no new provider integration is included in this assessment.

## Evidence and evaluation rules

Catalogue metadata establishes names, prices and listings. Published upstream documentation establishes what the named source says about itself. Monid-delivered payloads, contractual entitlements and performance are a third layer. No authenticated paid executions were used here, so **per-tool supported company counts, measured accuracy, latency percentiles, uptime, pagination and named production customers remain unverified**. Missing evidence is not proof that a private agreement or capability does not exist. Generic provider marketing text must not be read as a guarantee that every endpoint returns all described fields. [^s7], [^s8]

Matching function names also appear in Parse’s independently described website wrappers: Nasdaq, Yahoo, Finviz, MarketBeat, StockAnalysis and SECForm4. This is a provenance lead, **not proof that Parse supplies Monid**, nor proof that Monid lacks a private agreement. Parse-specific schema/capacity limits are labelled conditional wherever mentioned. A Monid “verified” badge does not itself document publisher authority or commercial redistribution. [^s9], [^s10], [^s11], [^s12], [^s13], [^s14]

**Accuracy** means correct identity, values, units and event interpretation, not an invented percentage. **Response speed** means request latency; **freshness** means age since the source observation/publication. Neither proves real time. **Relevance** is our assessment of usefulness for All News, My Stocks, the company catalogue or an optional research feature. **Safety** includes provenance, permissions and operational handling; no security certification or penetration-test result was established for these connectors. **Adoption** distinguishes named users of a specific API from general website readers.

The following judgments apply to every tool tagged with that data type. Per-tool limits can narrow them further. No numerical quality score is justified by the available evidence.

| Data type | Accuracy / relevance assessment | Freshness meaning |
|---|---|---|
| news | High potential for company discovery; publisher, subject match, duplication and truth need checks | Article publication plus collection lag; not measured through Monid |
| filing / insider | Strong auditability when original filing, codes and amendments are retained; high event relevance | Disclosure follows the underlying event; processing adds delay |
| ownership / beneficial | Useful historical ownership context; reconcile reporting entity, security class and amendments | Quarter-end or threshold-triggered disclosure; not live holdings/trades |
| reported | Useful factual company context if reconciled to issuer statements, periods, units and revisions | Reporting-cycle data; “live financials” does not mean continuous accounts |
| quote / option | Useful price display if venue, timestamp, side, currency and contract identity are valid | Source/exchange delay plus gateway delay; no verified tick stream |
| history / nav | Useful charts or fund valuations; check adjustments, gaps and valuation dates | Historical bars or periodic NAV, not live trades |
| lookup / profile / screen | Useful identity, catalogue and discovery support; coverage and matching unmeasured | Reference updates or ranked snapshots; a list is not a complete universe |
| short | Useful positioning context; distinguish short interest from short-sale volume | Periodic reported positions |
| derived / sentiment / score / opinion | Conditional analytical context; methodology and attribution required; not verified future outcomes | Depends on input age and recalculation; faster refresh does not increase truth |
| calendar | Useful reminders if estimated/confirmed/cancelled states are separate | Event-driven revisions and tentative dates |
| venue | Niche tokenized-equity/perpetual discovery; not evidence of corporate holdings | Hourly mapping snapshots in the documented DefiLlama API |

## Monthly cost model: 10 and 100 users

**These are catalogue call charges, not all-in commercial quotes.** Prices are USD per call, not per user. Displayed rates are used without adding an unverified extra markup. Licensing/exchange fees, taxes, subscriptions, minimum commitments, hosting, storage, AI processing, historical backfill, full-text/image rights and support are excluded because applicable quotes or requirements are unknown. Failed-call and retry billing also require confirmation. [^s2], [^s7], [^s8]

**Occasional research:** five lookups per user per workday × 22 days. This is 1,100 calls for ten users or 11,000 for 100 users **for one selected endpoint**. If a research action calls several tools, add their costs; a website page view is not necessarily one call.

**Regular feeds:** 20 followed security keys per user; a 50% unique-union ratio produces 100 distinct keys for ten users and 1,000 for 100 users. Acquire each permitted shared record once, then match locally to user holdings. The ratio describes the combined watchlists, not a measured overlap in our app. Same-universe global listings are acquired once regardless of user count. Sharing and caching are conditional on licence rights.

| Feed profile | Illustrative monthly calls before pagination/retries |
|---|---|
| Company quotes/candles | Per key: 5-minute polling × 6.5 h × 22 days = 1,716 |
| Company news/sentiment | Per key: hourly × 16 h × 30 days = 480 |
| Company filings/insiders | Per key: hourly × 16 h × 22 days = 352 |
| Shared insider listing | Per list: every 15 minutes × 16 h × 22 days = 1,408 |
| Daily reference/financial data | Per key or shared list: 30 |
| Search/typeahead | Demand only: research requests × 50% cache misses |
| Optional crypto quotes | Per crypto key: 5-minute polling × 24 h × 30 days = 8,640 |
| Tokenized-equity venue mappings | Per company key: hourly × 24 h × 30 days = 720 |
| Premarket movers | Shared list: 5-minute polling × 5.5 h × 22 days = 1,452 |

The default is **one page and one entity per call**, no retry overhead. This is a modelling assumption, not a verified API capability or a completeness guarantee. Global feeds can truncate/lose records between polls; extra pages or unavailable pagination can invalidate the estimate. A batch must be verified before increasing the batch-size input. Scheduled calls continue even when no new information appears. Search is not a substitute for enumerating a universe.

Optional assets use explicit fixed overrides in both user scenarios: five mutual funds, five ETFs, five individual indices, two cryptocurrencies and ten fund managers. These are illustrative non-company workloads, not inferred portfolio holdings. Daily global calendar/screener/list examples track one query or list; additional filters, dates or list slugs multiply calls. US regular-session polling does not cover every global session; overnight/weekend news and missed filings need a catch-up design. Changing a refresh interval changes polling cost, **not the source’s delay**.

For example, a $0.01 hourly company-news tool costs **$480/month for ten users or $4,800 for 100** under these assumptions. A $0.05 equivalent costs **$2,400 / $24,000**. A shared $0.01 insider list costs **$14.08 in either scenario**, but that purchases one page per poll, not guaranteed complete or timely disclosure coverage. The workbook exposes assumptions, per-tool batching/pagination/retry settings and optional scope overrides; all cost cells use formulas with cached default results.

## Block 1 — Stocks, companies, tickers and news

This block includes 55 tools. Company/market data supports the news product but is not necessarily news. Each tool’s exact catalogue URL, four monthly cost estimates, description, fit and limitations appear below. Provider-level coverage, source, rights, audience and unmeasured delivery speed apply to all its tools; type-level quality criteria apply as stated above.

### P1 — Nasdaq

**Company coverage.** No exact Monid company count verified. Related official feeds cover US exchange-listed securities; each news, fund, options and filing tool can cover a different subset. [^s15]

**Official source and accuracy.** Nasdaq is an official exchange operator. Its website also republishes third-party company data and journalism. These Monid listings are not verified as licensed Nasdaq feeds. Strong potential traceability for exchange data and original filings; mixed confidence for estimates, third-party news and derived fields. No measured connector accuracy. [^s16], [^s17], [^s18]

**Speed and real time.** Website quote bar: three-second refresh; indices at least one minute delayed. Short interest is twice-monthly. Neither establishes Monid delivery latency. The separate official Retail Trading Activity Tracker is daily with a one-day reporting lag. [^s19], [^s20], [^s21]

**Permission and commercial suitability.** Nasdaq website terms restrict automated capture and commercial copying, storage and derivative products without consent. A separate licensed feed/distributor agreement is the relevant route; no Monid pass-through grant established. [^s22]

**Who uses it.** Retail investors and analysts are the apparent audience. Trading 212 and Microsoft Excel are named users of the separate direct Nasdaq Last Sale product, not these Monid tools. [^s15]

**Assessment.** Conditional research candidate; use an authorised Nasdaq route for critical prices.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T01 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T02 | $0.01 | $11.00 | $110.00 | $17.16 | $17.16 |
| T03 | $0.01 | $11.00 | $110.00 | $0.30 | $0.30 |
| T04 | $0.01 | $11.00 | $110.00 | $352.00 | $3,520.00 |
| T05 | $0.01 | $11.00 | $110.00 | $1.50 | $1.50 |
| T06 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T07 | $0.01 | $11.00 | $110.00 | $1,716.00 | $17,160.00 |
| T08 | $0.01 | $11.00 | $110.00 | $5.50 | $55.00 |
| T09 | $0.01 | $11.00 | $110.00 | $17.16 | $17.16 |
| T10 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T12 | $0.01 | $11.00 | $110.00 | $17.16 | $17.16 |
| T13 | $0.01 | $11.00 | $110.00 | $85.80 | $85.80 |
| T14 | $0.01 | $11.00 | $110.00 | $172.80 | $172.80 |
| T15 | $0.01 | $11.00 | $110.00 | $480.00 | $4,800.00 |
| T16 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T17 | $0.01 | $11.00 | $110.00 | $85.80 | $85.80 |
| T18 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T19 | $0.01 | $11.00 | $110.00 | $1,716.00 | $17,160.00 |
| T20 | $0.01 | $11.00 | $110.00 | $0.30 | $0.30 |

#### T01 — Get earnings results

[`/get_stock_earnings`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_earnings) · **$0.01/call** · Data type: **reported** · MVP relevance: **High**.

Reported earnings and expectations. **Potential use:** Company earnings card and results alerts. **Limit:** Actuals and analyst estimates must remain separate; expected dates can change.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T02 — Run stock screener

[`/get_stock_screener`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_screener) · **$0.01/call** · Data type: **screen** · MVP relevance: **Medium**.

Filter listed stocks. **Potential use:** Catalogue discovery and saved screens. **Limit:** Universe, pagination and filter parity with Nasdaq are unverified.

**Budget cadence:** Shared market list: every 5 min in regular hours. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T03 — Get earnings calendar

[`/get_earnings_calendar`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_earnings_calendar) · **$0.01/call** · Data type: **calendar** · MVP relevance: **Medium**.

Upcoming earnings dates. **Potential use:** Shared earnings calendar matched to holdings. **Limit:** Some dates are algorithmic estimates; mark confirmed versus estimated.

**Budget cadence:** Shared directory/calendar/list: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T04 — Get SEC filings

[`/get_stock_sec_filings`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_sec_filings) · **$0.01/call** · Data type: **filing** · MVP relevance: **High**.

Company filing records and source links. **Potential use:** Company filing timeline and original-document links. **Limit:** General filing discovery; confirm accession IDs, form filters and amendments.

**Budget cadence:** Per company: hourly, 16 h/day, 22 workdays. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T05 — Get mutual fund quote

[`/get_mutual_fund_quote`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_mutual_fund_quote) · **$0.01/call** · Data type: **nav** · MVP relevance: **Medium; optional feature**.

Mutual-fund price or NAV snapshot. **Potential use:** Optional fund facts panel. **Limit:** Fund NAV is typically periodic; this is not a live stock quote or company count.

**Budget cadence:** Per company/security: once daily. Fixed monitored keys: 5 in both user scenarios. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T06 — Get dividend history

[`/get_stock_dividend_history`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_dividend_history) · **$0.01/call** · Data type: **reported** · MVP relevance: **High**.

Past dividend payments. **Potential use:** Company income and distribution history. **Limit:** Past dividends do not guarantee future payments; distinguish ex-date and payment date.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T07 — Get stock quote

[`/get_stock_quote`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_quote) · **$0.01/call** · Data type: **quote** · MVP relevance: **High**.

Stock quote snapshot. **Potential use:** Company header and watchlist price card. **Limit:** Website quote updates do not establish Monid feed latency or exchange entitlement.

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T08 — Search ticker symbols

[`/search_symbols`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/search_symbols) · **$0.01/call** · Data type: **lookup** · MVP relevance: **Medium**.

Search security identifiers. **Potential use:** Catalogue symbol resolver. **Limit:** Interactive search is not a complete security master; exchange collisions need resolution.

**Budget cadence:** Demand-only lookup, 50% cache misses. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T09 — Get market indices

[`/get_market_indices`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_market_indices) · **$0.01/call** · Data type: **quote** · MVP relevance: **High**.

Broad market index overview. **Potential use:** Global markets overview. **Limit:** Index levels are not company coverage; provider-specific index delays apply.

**Budget cadence:** Shared market list: every 5 min in regular hours. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T10 — Get historical quotes

[`/get_stock_historical_quotes`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_historical_quotes) · **$0.01/call** · Data type: **history** · MVP relevance: **High**.

Historical stock price observations. **Potential use:** Company historical price chart. **Limit:** Confirm adjusted prices, corporate actions and maximum history. The same-named Parse wrapper describes end-of-day history only; its relationship to Monid is unverified. [^s9]

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T12 — Get market movers

[`/get_market_movers`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_market_movers) · **$0.01/call** · Data type: **screen** · MVP relevance: **Medium**.

Leading price movers. **Potential use:** Market discovery panel. **Limit:** Ranking is a selected subset, not all stocks; volume and reference session matter.

**Budget cadence:** Shared market list: every 5 min in regular hours. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T13 — Get ETF quote

[`/get_etf_quote`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_etf_quote) · **$0.01/call** · Data type: **quote** · MVP relevance: **Medium; optional feature**.

ETF quote snapshot. **Potential use:** ETF catalogue extension. **Limit:** ETFs represent funds, not additional operating companies.

**Budget cadence:** Per security: every 5 min in regular market hours. Fixed monitored keys: 5 in both user scenarios. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T14 — Get cryptocurrency quote

[`/get_cryptocurrency_quote`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_cryptocurrency_quote) · **$0.01/call** · Data type: **quote** · MVP relevance: **Medium; optional feature**.

Cryptocurrency quote snapshot. **Potential use:** Optional cross-asset market panel. **Limit:** Outside company coverage; venue, pair and 24-hour timing need confirmation.

**Budget cadence:** Optional crypto: every 5 min, 24 h/day. Fixed monitored keys: 2 in both user scenarios. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T15 — Get stock news

[`/get_stock_news`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_news) · **$0.01/call** · Data type: **news** · MVP relevance: **High**.

Company-related headlines and links. **Potential use:** Company news cards and My Stocks feed. **Limit:** Full text, image rights, publisher identity and ticker relevance are not established.

**Budget cadence:** Per company: hourly, 16 h/day, 30 days. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T16 — Get company financials

[`/get_stock_financials`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_financials) · **$0.01/call** · Data type: **reported** · MVP relevance: **High**.

Financial statement values. **Potential use:** Company financials and comparisons. **Limit:** Confirm units, periods, currencies and restatements. The same-named Parse wrapper advertises four financial periods; Monid equivalence/history depth unverified. [^s9]

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T17 — Get index detail

[`/get_index_detail`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_index_detail) · **$0.01/call** · Data type: **quote** · MVP relevance: **Medium; optional feature**.

Details for a selected index. **Potential use:** Benchmark comparison panel. **Limit:** Index definitions and permissions differ from stock data.

**Budget cadence:** Per security: every 5 min in regular market hours. Fixed monitored keys: 5 in both user scenarios. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T18 — Get short interest

[`/get_stock_short_interest`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_short_interest) · **$0.01/call** · Data type: **short** · MVP relevance: **Medium**.

Reported short positions. **Potential use:** Company positioning context. **Limit:** Short interest is a periodic position report, not real-time short-sale volume.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T19 — Get option chain

[`/get_stock_option_chain`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_option_chain) · **$0.01/call** · Data type: **option** · MVP relevance: **Medium; optional feature**.

Listed option strikes and quotes. **Potential use:** Optional derivatives research panel. **Limit:** Coverage only for optionable securities; chain depth, Greeks and latency unverified.

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T20 — Get retail trading activity

[`/get_retail_trading_activity`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_retail_trading_activity) · **$0.01/call** · Data type: **derived** · MVP relevance: **Medium**.

Retail trading activity rankings. **Potential use:** Separate retail sentiment panel. **Limit:** Retail flows are not insider activity. The separate official RTAT dataset is daily with a one-day reporting lag; Monid list size, tier and additional latency are unverified. [^s21]

**Budget cadence:** Shared directory/calendar/list: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### P2 — Yahoo Finance

**Company coverage.** Global exchanges are listed in Yahoo help, but no exact company or news count was verified for Monid. Quote, profile and headline coverage are different questions. [^s23]

**Official source and accuracy.** Publisher and secondary financial-data aggregator. Not the original issuer of every article or price record; Monid distribution authority unverified. Useful international research scope, but adjustments, stale profiles, article duplicates and ticker matching need measurement. No accuracy percentage established.

**Speed and real time.** Exchange dependent: the official table includes real-time Nasdaq, 15-minute OPRA/OTC, 20-minute ASX and 30-minute Shanghai/Shenzhen. Monid adds unmeasured collection/cache lag. [^s23]

**Permission and commercial suitability.** Yahoo Finance help prohibits redistribution of its displayed/provided information. No separate Monid grant was verified. Article and photo rights require their own entitlement. [^s23], [^s24]

**Who uses it.** Suitable for individual investors and analysts (product assessment); no named production customer verified for these Monid endpoints.

**Assessment.** On-demand alternative only after rights resolution; comparatively costly for frequent polling.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T21 | $0.05 | $55.00 | $550.00 | $150.00 | $1,500.00 |
| T22 | $0.05 | $55.00 | $550.00 | $150.00 | $1,500.00 |
| T23 | $0.05 | $55.00 | $550.00 | $2,400.00 | $24,000.00 |
| T24 | $0.05 | $55.00 | $550.00 | $8,580.00 | $85,800.00 |
| T25 | $0.05 | $55.00 | $550.00 | $27.50 | $275.00 |

#### T21 — Get historical prices

[`/get_historical_data`](https://api.monid.ai/public/v1/providers/yahoo-finance/endpoints/get_historical_data) · **$0.05/call** · Data type: **history** · MVP relevance: **High**.

Historical security prices. **Potential use:** Company and benchmark charts. **Limit:** Exchange/timezone and adjustment settings need verification; source availability varies.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P2; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T22 — Get company profile

[`/get_company_profile`](https://api.monid.ai/public/v1/providers/yahoo-finance/endpoints/get_company_profile) · **$0.05/call** · Data type: **profile** · MVP relevance: **High**.

Company identity and business description. **Potential use:** Catalogue company profile. **Limit:** Ticker coverage is not news coverage; profile freshness and source licence unverified.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P2; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T23 — Get market news

[`/get_stock_news`](https://api.monid.ai/public/v1/providers/yahoo-finance/endpoints/get_stock_news) · **$0.05/call** · Data type: **news** · MVP relevance: **High**.

Company or market news discovery. **Potential use:** All News and company cards. **Limit:** Confirm per-ticker input and company matching; no blanket full-text or image licence.

**Budget cadence:** Per company: hourly, 16 h/day, 30 days. Coverage, source authority, rights, audience and speed inherit P2; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T24 — Get quote

[`/get_quote`](https://api.monid.ai/public/v1/providers/yahoo-finance/endpoints/get_quote) · **$0.05/call** · Data type: **quote** · MVP relevance: **High**.

Security quote snapshot. **Potential use:** Watchlist and company price display. **Limit:** Yahoo lists exchange-dependent delays; do not label the wrapper uniformly real time.

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P2; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T25 — Search tickers

[`/search_tickers`](https://api.monid.ai/public/v1/providers/yahoo-finance/endpoints/search_tickers) · **$0.05/call** · Data type: **lookup** · MVP relevance: **Medium**.

Search ticker identifiers. **Potential use:** Catalogue search and disambiguation. **Limit:** Search returns candidate securities, not a complete company universe.

**Budget cadence:** Demand-only lookup, 50% cache misses. Coverage, source authority, rights, audience and speed inherit P2; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### P3 — Finviz

**Company coverage.** The stock-only website screener showed 5,613 ticker rows; the unrestricted version 11,614 including funds. These dynamic observations are not unique companies, insider/news coverage or Monid-supported totals. Source FAQ lists Nasdaq, NYSE and AMEX. [^s25], [^s26], [^s27]

**Official source and accuracy.** Secondary screener/aggregator. Direct Elite API/export access exists, but the Monid connector is not verified as that authorised product. Useful screening context, subject to universe/result caps. Sentiment is an interpretation, with no validated model or factual-accuracy score established.

**Speed and real time.** Free website stock quotes are one minute delayed; Elite quotes can be real time; fundamentals refresh hourly. News/insider latency and Monid refresh remain unknown. [^s25]

**Permission and commercial suitability.** Direct API policy is personal-use and prohibits third-party redistribution/resale. Its one-request-per-five-seconds limit is not a verified Monid limit. A personal Elite subscription is not a licence for our app users. [^s28], [^s29]

**Who uses it.** Finviz addresses beginners and professional traders. No named production customer verified for these Monid tools. [^s29]

**Assessment.** Potential screener feature, secondary priority; resolve licence and pagination first.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T26 | $0.01 | $11.00 | $110.00 | $17.16 | $17.16 |
| T28 | $0.01 | $11.00 | $110.00 | $1,716.00 | $17,160.00 |
| T29 | $0.01 | $11.00 | $110.00 | $480.00 | $4,800.00 |
| T30 | $0.01 | $11.00 | $110.00 | $17.16 | $17.16 |

#### T26 — Run screener

[`/get_screener_results`](https://api.monid.ai/public/v1/providers/finviz/endpoints/get_screener_results) · **$0.01/call** · Data type: **screen** · MVP relevance: **Medium**.

Screen stocks by research criteria. **Potential use:** Saved catalogue screens. **Limit:** US-listed source scope. The same-named Parse wrapper returns up to 20 first-page results without pagination; Monid equivalence, filters and pagination remain unverified. [^s11]

**Budget cadence:** Shared market list: every 5 min in regular hours. Coverage, source authority, rights, audience and speed inherit P3; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T28 — get_ticker_sectors_with_performance

[`/get_ticker_sectors_with_performance`](https://api.monid.ai/public/v1/providers/finviz/endpoints/get_ticker_sectors_with_performance) · **$0.01/call** · Data type: **derived** · MVP relevance: **Medium**.

Sector labels and performance context. **Potential use:** Portfolio sector exposure and movers. **Limit:** Batch size and calculation window are unverified; sector classification can differ by source.

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P3; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T29 — Get news sentiment

[`/get_stock_news_sentiment`](https://api.monid.ai/public/v1/providers/finviz/endpoints/get_stock_news_sentiment) · **$0.01/call** · Data type: **sentiment** · MVP relevance: **Medium**.

Sentiment attached to stock news. **Potential use:** Optional labelled sentiment beside source articles. **Limit:** Scoring method is not established for Monid; sentiment is not factual verification or a full news feed.

**Budget cadence:** Per company: hourly, 16 h/day, 30 days. Coverage, source authority, rights, audience and speed inherit P3; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T30 — Get market movers

[`/get_market_movers`](https://api.monid.ai/public/v1/providers/finviz/endpoints/get_market_movers) · **$0.01/call** · Data type: **screen** · MVP relevance: **Medium**.

Top gaining or losing stocks. **Potential use:** Global market overview. **Limit:** Session and ranking scope need confirmation. Same-named Parse documentation describes first-page-only output capped at 20; Monid equivalence and full coverage unverified. [^s11]

**Budget cadence:** Shared market list: every 5 min in regular hours. Coverage, source authority, rights, audience and speed inherit P3; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### P4 — MarketBeat

**Company coverage.** Website advertises 20,000 public-company profiles, with US, Canadian and UK sections. No exact Monid count or assurance that all 14 tools cover all these companies was verified. [^s30]

**Official source and accuracy.** Private publisher and aggregator; discloses market-data suppliers and editorial policies. SEC-derived insider tables remain secondary. Editorial source checks and corrections are positive signals, not a measured endpoint error rate. Some summaries use AI; ratings/forecasts and MarketRank are opinions or models. [^s31], [^s32], [^s33]

**Speed and real time.** Source fair-market-value estimates update each minute; other Barchart market data is at least ten minutes delayed. Model scores, earnings and holdings have different cadences; Monid latency unmeasured. [^s30]

**Permission and commercial suitability.** Terms distinguish personal access, site/XML licences and commercial licensing, and restrict bulk redistribution. No Monid downstream customer-display/storage grant established. [^s34]

**Who uses it.** Retail-investor publisher with a large claimed newsletter readership. This is audience evidence, not named Monid API-customer evidence. [^s32]

**Assessment.** One of the more relevant headline/research candidates, conditional on a valid commercial licence.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T31 | $0.02 | $22.00 | $220.00 | $60.00 | $600.00 |
| T33 | $0.02 | $22.00 | $220.00 | $60.00 | $600.00 |
| T35 | $0.01 | $11.00 | $110.00 | $5.50 | $55.00 |
| T36 | $0.01 | $11.00 | $110.00 | $1,716.00 | $17,160.00 |
| T37 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T38 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T39 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T40 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T41 | $0.01 | $11.00 | $110.00 | $480.00 | $4,800.00 |
| T42 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T43 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T44 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |

#### T31 — Get financial statements

[`/get_financial_statements`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_financial_statements) · **$0.02/call** · Data type: **reported** · MVP relevance: **High**.

Company financial statements. **Potential use:** Company financial tabs. **Limit:** Currency, history depth and restatement handling unverified; costs twice the basic endpoint rate.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T33 — Get analyst ratings

[`/get_analyst_ratings`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_analyst_ratings) · **$0.02/call** · Data type: **opinion** · MVP relevance: **Medium**.

Analyst-rating data; exact Monid aggregation unverified. **Potential use:** Analyst sentiment history and consensus context. **Limit:** Same-named Parse tool describes monthly rating counts, not individual broker alerts; Monid equivalence and exact fields unverified. Opinions are not verified future outcomes. [^s12]

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T35 — Search stocks

[`/search_stocks`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/search_stocks) · **$0.01/call** · Data type: **lookup** · MVP relevance: **Medium**.

Find stock records. **Potential use:** Company onboarding and catalogue search. **Limit:** Website advertises 20,000 profiles; Monid supported symbols and pagination remain unverified.

**Budget cadence:** Demand-only lookup, 50% cache misses. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T36 — Get options chain

[`/get_options_chain`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_options_chain) · **$0.01/call** · Data type: **option** · MVP relevance: **Medium; optional feature**.

Option contracts and quotes. **Potential use:** Optional options panel. **Limit:** Optionable securities only; same-named Parse wrapper lacks expiry filtering. Monid filter support, chain completeness and quote age unverified. [^s12]

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T37 — Get stock overview

[`/get_stock_overview`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_stock_overview) · **$0.01/call** · Data type: **profile** · MVP relevance: **High**.

Company research snapshot. **Potential use:** Company overview page. **Limit:** Mixed quote/profile fields; source FMV estimates are not necessarily exchange last trades. Fetch time does not establish every field's observation time. Budget is a daily research snapshot, not a live-price panel; refresh quote fields separately.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T38 — Get earnings

[`/get_earnings`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_earnings) · **$0.01/call** · Data type: **reported** · MVP relevance: **High**.

Earnings estimates and historical results context. **Potential use:** Company earnings comparison card. **Limit:** Separate consensus estimates and reported results; upcoming calendar fields and structured surprise/beat-miss flags not established for this Monid tool.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T39 — Get competitors

[`/get_competitors`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_competitors) · **$0.01/call** · Data type: **derived** · MVP relevance: **Medium**.

Peer comparison data. **Potential use:** Peer comparison and catalogue navigation. **Limit:** Same-named Parse tool compares financial metrics with a primary competitor; complete peer-universe and Monid schema unverified. Not a supply-chain relationship map. [^s12]

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T40 — Get MarketRank score

[`/get_marketrank`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_marketrank) · **$0.01/call** · Data type: **score** · MVP relevance: **Medium**.

Proprietary MarketRank score. **Potential use:** Optional explained research score. **Limit:** Proprietary ranking is not an accuracy guarantee, probability or investment recommendation.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T41 — Get stock headlines

[`/get_stock_headlines`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_stock_headlines) · **$0.01/call** · Data type: **news** · MVP relevance: **High**.

Company headline discovery. **Potential use:** Company news and portfolio headlines. **Limit:** No established full-body/image entitlement. Same-named Parse tool exposes roughly 5–10 recent headline links with relative dates; Monid page size, pagination and exact fields unverified. [^s12]

**Budget cadence:** Per company: hourly, 16 h/day, 30 days. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T42 — Get short interest

[`/get_short_interest`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_short_interest) · **$0.01/call** · Data type: **short** · MVP relevance: **Medium**.

Reported short-interest metrics. **Potential use:** Company positioning card. **Limit:** Periodic disclosed positions; short volume and short interest must not be merged.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T43 — Get profitability metrics

[`/get_profitability_metrics`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_profitability_metrics) · **$0.01/call** · Data type: **derived** · MVP relevance: **Medium**.

Profitability ratios and margins. **Potential use:** Financial comparison table. **Limit:** TTM, fiscal-period and sector accounting differences can make ratios incomparable.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T44 — Get price forecast

[`/get_stock_forecast`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_stock_forecast) · **$0.01/call** · Data type: **opinion** · MVP relevance: **Medium**.

Analyst target and forecast summary. **Potential use:** Labelled analyst expectations panel. **Limit:** Forecasts are uncertain opinions; contributor population and stale targets require checks.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### P5 — StockAnalysis

**Company coverage.** Website advertises 130,000+ tradable symbols worldwide, including ETFs and multiple listings. This is not a unique-company number or proven Monid coverage. Seven listings were retrievable although eight were advertised. [^s35]

**Official source and accuracy.** Secondary research publisher using providers including S&P Global and Fiscal.ai. It explicitly says it has no programmatic API/MCP and lacks programmatic resale rights. Documented upstream vendors and review practices support manual research. No independent Monid accuracy or completeness benchmark; derived ratios and financial periods need reconciliation. [^s36]

**Speed and real time.** US website stock pages refresh every five seconds for free users and stream for paid users; source screeners are roughly minute-based; other markets can be delayed or end-of-day. This is not Monid streaming evidence. [^s36], [^s37]

**Permission and commercial suitability.** Published no-programmatic-access position is a concrete blocker for assuming these are official licensed APIs. A valid, separately evidenced upstream rights chain would be needed before production use. [^s3], [^s38]

**Who uses it.** Regular/individual investors are its stated audience. No named Monid endpoint customers verified. [^s39]

**Assessment.** Hold production integration pending an explanation and proof of lawful programmatic supply.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T45 | $0.01 | $11.00 | $110.00 | $0.30 | $0.30 |
| T46 | $0.01 | $11.00 | $110.00 | $5.50 | $55.00 |
| T47 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T48 | $0.01 | $11.00 | $110.00 | $14.52 | $14.52 |
| T49 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T50 | $0.01 | $11.00 | $110.00 | $0.30 | $0.30 |
| T51 | $0.01 | $11.00 | $110.00 | $1,716.00 | $17,160.00 |

#### T45 — List stocks

[`/get_stock_list`](https://api.monid.ai/public/v1/providers/stockanalysis/endpoints/get_stock_list) · **$0.01/call** · Data type: **screen** · MVP relevance: **Medium**.

Stock-list lookup; full-universe coverage unverified. **Potential use:** Curated stock-discovery lists. **Limit:** Same-named Parse tool retrieves a curated list by URL slug; it is not evidence of a full supported-symbol directory. Monid parameters/relationship unverified. [^s13]

**Budget cadence:** Shared directory/calendar/list: once daily. Coverage, source authority, rights, audience and speed inherit P5; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T46 — Search stocks

[`/search_stocks`](https://api.monid.ai/public/v1/providers/stockanalysis/endpoints/search_stocks) · **$0.01/call** · Data type: **lookup** · MVP relevance: **Medium**.

Search stock records. **Potential use:** Catalogue symbol matching. **Limit:** Search completeness and exchange-qualified IDs unverified; programmatic-use restriction unresolved.

**Budget cadence:** Demand-only lookup, 50% cache misses. Coverage, source authority, rights, audience and speed inherit P5; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T47 — Get income statement

[`/get_stock_financials_income`](https://api.monid.ai/public/v1/providers/stockanalysis/endpoints/get_stock_financials_income) · **$0.01/call** · Data type: **reported** · MVP relevance: **High**.

Income-statement figures. **Potential use:** Company income-statement tab. **Limit:** Income statement only; full balance-sheet/cash-flow time series not established. Same-named Parse tool describes annual data; Monid quarterly support and history unverified. [^s13]

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P5; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T48 — Get pre-market movers

[`/get_market_movers_premarket`](https://api.monid.ai/public/v1/providers/stockanalysis/endpoints/get_market_movers_premarket) · **$0.01/call** · Data type: **screen** · MVP relevance: **Medium**.

Premarket price movers. **Potential use:** Premarket overview. **Limit:** Premarket subset; same-named Parse tool can return an empty active list outside that session. Universe/filter completeness unverified. [^s13]

**Budget cadence:** Shared premarket list: every 5 min, 5.5 h, 22 days. Coverage, source authority, rights, audience and speed inherit P5; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T49 — Get stock statistics

[`/get_stock_statistics`](https://api.monid.ai/public/v1/providers/stockanalysis/endpoints/get_stock_statistics) · **$0.01/call** · Data type: **derived** · MVP relevance: **Medium**.

Company valuation and trading metrics. **Potential use:** Company statistics panel. **Limit:** Derived metrics require consistent price date, shares, accounting period and currency.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P5; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T50 — Get IPO calendar

[`/get_ipo_calendar`](https://api.monid.ai/public/v1/providers/stockanalysis/endpoints/get_ipo_calendar) · **$0.01/call** · Data type: **calendar** · MVP relevance: **Medium**.

Upcoming IPO calendar. **Potential use:** IPO discovery and reminders. **Limit:** Dates can be tentative, postponed or withdrawn; historical/recent IPO coverage not established. Calendar entries are not ongoing news coverage.

**Budget cadence:** Shared directory/calendar/list: once daily. Coverage, source authority, rights, audience and speed inherit P5; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T51 — Get stock overview

[`/get_stock_overview`](https://api.monid.ai/public/v1/providers/stockanalysis/endpoints/get_stock_overview) · **$0.01/call** · Data type: **quote** · MVP relevance: **High**.

Stock quote/overview snapshot; exact Monid shape unverified. **Potential use:** Company quote and market-session panel. **Limit:** Same-named Parse tool is a quote overview; do not promise a company business profile. Source offers no official programmatic product. [^s13]

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P5; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### P6 — DefiLlama equities

**Company coverage.** Exact supported company count unverified. Official companies-list returns ticker/country identities to enumerate and match; upstream Twelve Data breadth is not proof of this beta subset. [^s5], [^s40]

**Official source and accuracy.** All eight paths are documented in the vendor’s official Pro API. Equities market/fundamental data is secondary Twelve Data; filing links can lead to primary SEC documents. Monid resale authority remains unverified. Clearer documented schemas than the web-style wrappers, but beta stability, per-field coverage and source reconciliation need validation. [^s6]

**Speed and real time.** Beta snapshot/chart service, not a demonstrated tick stream. Short-window charts may use five-minute bars with daily fallback; on-chain venue mappings are hourly. End-to-end lag unmeasured. [^s6]

**Permission and commercial suitability.** DefiLlama API terms and underlying Twelve Data display/redistribution entitlements apply. No confirmed pass-through customer-display grant through Monid. Direct Pro API pricing is a separate purchase route. [^s41], [^s42]

**Who uses it.** Potential audience: equity and crypto researchers. No named adopter of these exact beta equities/Monid endpoints verified.

**Assessment.** Best low-cost documented API candidate for a limited fundamentals/chart evaluation, after rights and coverage checks.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T52 | $0.0006 | $0.66 | $6.60 | $1.80 | $18.00 |
| T53 | $0.0006 | $0.66 | $6.60 | $21.12 | $211.20 |
| T54 | $0.0006 | $0.66 | $6.60 | $102.96 | $1,029.60 |
| T55 | $0.0006 | $0.66 | $6.60 | $1.80 | $18.00 |
| T56 | $0.0006 | $0.66 | $6.60 | $0.02 | $0.02 |
| T57 | $0.0006 | $0.66 | $6.60 | $102.96 | $1,029.60 |
| T58 | $0.0006 | $0.66 | $6.60 | $43.20 | $432.00 |
| T59 | $0.0006 | $0.66 | $6.60 | $1.80 | $18.00 |

#### T52 — /equities/v1/statements

[`/equities/v1/statements`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/statements) · **$0.0006/call** · Data type: **reported** · MVP relevance: **High**.

Equity financial statements. **Potential use:** Source-aware financials tab. **Limit:** Beta coverage; period, schema and restatement completeness need per-company validation.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T53 — /equities/v1/filings

[`/equities/v1/filings`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/filings) · **$0.0006/call** · Data type: **filing** · MVP relevance: **High**.

Filing metadata and original-document links. **Potential use:** Company documents timeline. **Limit:** Links and metadata do not establish full document bodies, earnings news or reproduction rights.

**Budget cadence:** Per company: hourly, 16 h/day, 22 workdays. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T54 — /equities/v1/summary

[`/equities/v1/summary`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/summary) · **$0.0006/call** · Data type: **quote** · MVP relevance: **High**.

Compact current-market snapshot. **Potential use:** Company price and valuation summary. **Limit:** Response lacks ticker/name; bind to requested ticker plus country. Mixed market and financial fields do not necessarily share one observation time.

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T55 — /equities/v1/price-history

[`/equities/v1/price-history`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/price-history) · **$0.0006/call** · Data type: **history** · MVP relevance: **High**.

Company price time series. **Potential use:** Company historical chart. **Limit:** Five-minute intraday bars are best effort and may fall back to daily; not a tick stream.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T56 — /equities/v1/companies-list

[`/equities/v1/companies-list`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/companies-list) · **$0.0006/call** · Data type: **lookup** · MVP relevance: **Medium**.

Supported company directory. **Potential use:** Coverage audit and catalogue matching. **Limit:** This is the relevant universe to test; exact count and Monid coverage are not publicly established.

**Budget cadence:** Shared directory/calendar/list: once daily. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T57 — /equities/v1/ohlcv

[`/equities/v1/ohlcv`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/ohlcv) · **$0.0006/call** · Data type: **history** · MVP relevance: **High**.

OHLCV price candles. **Potential use:** Candlestick research chart. **Limit:** Short windows use best-effort 5-minute candles with possible daily fallback; longer windows are daily. Verify session, adjustments and returned interval.

**Budget cadence:** Per security: every 5 min in regular market hours. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T58 — /equities/v1/onchain

[`/equities/v1/onchain`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/onchain) · **$0.0006/call** · Data type: **venue** · MVP relevance: **Low for core news; niche feature**.

Tokenized-equity and perpetual-contract venue mappings. **Potential use:** Optional venues offering stock-linked token or perpetual exposure. **Limit:** US-listed tickers only; no history. Maps stock-linked exposure venues, not company-owned crypto or treasury holdings; token issuer differs from underlying listed company.

**Budget cadence:** Tokenized/perpetual venues: hourly, 24 h/day. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T59 — /equities/v1/dimensions

[`/equities/v1/dimensions`](https://api.monid.ai/public/v1/providers/defillama/endpoints/equities/v1/dimensions) · **$0.0006/call** · Data type: **derived** · MVP relevance: **Medium**.

Quarterly/annual revenue, holder-revenue, earnings and share series. **Potential use:** Company financial-trend comparisons. **Limit:** Defined financial metric series, not arbitrary operational KPIs or business/geographic segments; validate periods and company completeness.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P6; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### Implications for our company-news product

Nasdaq `/get_stock_news`, Yahoo `/get_stock_news` and MarketBeat `/get_stock_headlines` are potential **discovery** inputs for All News, My Stocks and catalogue-company feeds. Price/history/filing data can add context beside an article. Finviz sentiment is optional interpretation, not a substitute for the story or its verification. Company lookups do not establish comprehensive central-bank, government or macroeconomic reporting.

A usable record needs an original publisher/domain, canonical URL, publication/update time, language, company identifiers and an explanation of relevance. The page should distinguish issuer announcements, regulatory filings, reported journalism, commentary and calculated signals. An article mentioning Apple as a comparison should not automatically become an important Apple event. Source facts can be accurate while an issuer’s statements remain promotional or forward-looking.

**In-platform reading and images remain separate permissions.** Fetching a headline/link does not grant the body, photograph or publisher paywall access. Display only fields expressly covered by the contract; provide the original link and show access requirements where applicable. Do not promise free full text to all users, use a subscriber cookie for other customers, or present a subscription as a multi-user licence. The current official-source feed can remain the base; one selected licensed aggregator could extend discovery after evaluation. [^s22], [^s23], [^s34], [^s3]

## Block 2 — Insider and ownership data

This block contains **15 tools**. Executive transactions, beneficial ownership and institutional holdings are related research areas with different meanings and clocks. Nasdaq retail activity and short interest are deliberately in Block 1; they are not insider trading. The general Nasdaq filings endpoint can help discover original documents but is not counted twice.

### Official reporting versus market events

The **SEC is the official US filing repository**; SECForm4.com is a private aggregator. Form 4 generally follows a transaction within two business days, with exceptions. Code P includes open-market or private purchases; S is a sale; A an award/grant; F withholding; M exercise/conversion; G a gift. Awards, gifts, exercises, tax withholding and proposed sales must not be counted as ordinary investment purchases or completed sales. [^s43], [^s44]

Institutional 13F filings describe quarter-end positions, normally due within 45 days. The reporting threshold is $100 million in Section 13(f) securities, not all assets. Initial 13D reporting generally has a five-business-day deadline; 13G timing depends on filer and circumstances. These records do not show complete live fund portfolios or establish that a newly published holding was purchased today. [^s45], [^s46]

Scope is also time-sensitive: rules effective in March 2026 extended Section 16(a) reporting to certain foreign private issuer directors/officers, with exemptions. Do not reuse the older blanket assumption that every foreign private issuer is excluded, or infer worldwide coverage from this change. [^s47], [^s48], [^s49]

### P7 — SECForm4.com

**Company coverage.** No exact company, issuer-CIK or manager count verified for Monid. SEC filing coverage is not a worldwide 50,000-company universe; owner, security and transaction counts are different. [^s50]

**Official source and accuracy.** Private SEC-data aggregator, not the SEC. Original accession numbers/documents are needed to establish each record’s provenance. Potentially highly auditable with originals, but no tested error rate. Amendments, joint reporting, rounded totals and non-split-adjusted shares need handling. [^s51]

**Speed and real time.** Five public modules disclose a six-month delay: buys, sales, significant buys, insider options and ratios. Company history can be newer. Monid subscription tier and delivered freshness are unverified. [^s52], [^s53], [^s4], [^s54], [^s55], [^s56]

**Permission and commercial suitability.** Website subscriptions do not establish a redistribution/API licence. No public grant for Monid customer display, history storage or exports was established. [^s57]

**Who uses it.** Investors studying executives and institutions are the intended audience. No named production customer verified for these Monid endpoints.

**Assessment.** Do not promise timely insider alerts until tier/lag/rights are proven; prefer official SEC ingestion as the foundation.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T60 | $0.01 | $11.00 | $110.00 | $5.50 | $55.00 |
| T61 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |
| T62 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |
| T63 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |
| T64 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T65 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |
| T66 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |
| T67 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |
| T68 | $0.01 | $11.00 | $110.00 | $352.00 | $3,520.00 |
| T69 | $0.01 | $11.00 | $110.00 | $3.00 | $3.00 |
| T70 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |

#### T60 — Search filings

[`/search`](https://api.monid.ai/public/v1/providers/secform4/endpoints/search) · **$0.01/call** · Data type: **lookup** · MVP relevance: **Medium**.

Search insider and ownership filings. **Potential use:** Insider research search. **Limit:** Search scope and pagination unverified; company and owner identifiers are different.

**Budget cadence:** Demand-only lookup, 50% cache misses. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T61 — Get 13D filings

[`/get_13d_filings`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_13d_filings) · **$0.01/call** · Data type: **beneficial** · MVP relevance: **High**.

Activist or significant beneficial-ownership disclosures. **Potential use:** Ownership-event alerts linked to original filings. **Limit:** 13D is beneficial ownership, not a complete trade tape; filing deadlines differ from Form 4.

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T62 — Get insider sales

[`/get_insider_sales`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_insider_sales) · **$0.01/call** · Data type: **insider** · MVP relevance: **High**.

Reported insider sale list. **Potential use:** Shared insider-sales feed. **Limit:** Public source module explicitly six months delayed; Monid entitlement and actual freshness unknown.

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T63 — Get significant insider buys

[`/get_significant_insider_buys`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_significant_insider_buys) · **$0.01/call** · Data type: **insider** · MVP relevance: **High**.

Selected large insider purchases. **Potential use:** Prioritised insider alert queue. **Limit:** Public source six-month delay; vendor selection threshold is not evidence of investment quality.

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T64 — Get institutional holders

[`/get_institution_holders`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_institution_holders) · **$0.01/call** · Data type: **ownership** · MVP relevance: **Medium**.

Institutional holders of an issuer. **Potential use:** Company ownership history. **Limit:** Reported holdings lag quarter-end; holder population and security class matching matter.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T65 — Get insider buy/sell ratios

[`/get_insider_buy_sell_ratios`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_insider_buy_sell_ratios) · **$0.01/call** · Data type: **derived** · MVP relevance: **Medium**.

Aggregated insider purchase/sale ratios. **Potential use:** Labelled insider-activity indicator. **Limit:** Public source six-month delay; ratios depend on transaction types, window and reporting population.

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T66 — Get insider stock options

[`/get_stock_options`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_stock_options) · **$0.01/call** · Data type: **insider** · MVP relevance: **High**.

Insider option-related transactions. **Potential use:** Compensation versus cash-purchase explanation. **Limit:** Insider option disclosures, not an exchange option chain; public module six months delayed.

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T67 — Get insider buys

[`/get_insider_buys`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_insider_buys) · **$0.01/call** · Data type: **insider** · MVP relevance: **High**.

Reported insider purchase list. **Potential use:** Shared insider-purchase feed. **Limit:** Public source six-month delay; verify cash purchases versus grants and exercises.

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T68 — Get company insider trading

[`/get_company_insider_trading`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_company_insider_trading) · **$0.01/call** · Data type: **insider** · MVP relevance: **High**.

Issuer-specific insider history. **Potential use:** Company insider timeline. **Limit:** Transaction and filing dates differ; site warns share counts are not split adjusted.

**Budget cadence:** Per company: hourly, 16 h/day, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T69 — Get hedge fund portfolio

[`/get_hedge_fund_portfolio`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_hedge_fund_portfolio) · **$0.01/call** · Data type: **ownership** · MVP relevance: **Medium; optional feature**.

A fund manager's reported portfolio. **Potential use:** Institutional portfolio-change research. **Limit:** Historical disclosed positions are not its live portfolio; confidential or unreported positions may be absent.

**Budget cadence:** Per company/security: once daily. Fixed monitored keys: 10 in both user scenarios. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T70 — Get 13G filings

[`/get_13g_filings`](https://api.monid.ai/public/v1/providers/secform4/endpoints/get_13g_filings) · **$0.01/call** · Data type: **beneficial** · MVP relevance: **High**.

Passive or qualified beneficial-ownership disclosures. **Potential use:** Company ownership notifications. **Limit:** 13G filing cadence depends on filer type and triggering change; not immediate trading activity.

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P7; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### Finviz — additional ownership tools

These tools inherit P3 above, including its unresolved Monid coverage, permissions and delivery performance. Institutional tools describe historical disclosed positions.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T27 | $0.01 | $11.00 | $110.00 | $14.08 | $14.08 |

#### T27 — Get insider trading

[`/get_insider_trading`](https://api.monid.ai/public/v1/providers/finviz/endpoints/get_insider_trading) · **$0.01/call** · Data type: **insider** · MVP relevance: **High**.

Recent reported insider transactions. **Potential use:** Shared insider activity feed filtered to holdings. **Limit:** Verify original forms, transaction codes, dates and amendments. A same-named Parse sample labels a Form 144 proposed-sale link as Form 4; this is not a tested Monid defect or proof of a completed sale. [^s11]

**Budget cadence:** Shared disclosure list: 15 min, 16 h, 22 workdays. Coverage, source authority, rights, audience and speed inherit P3; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### MarketBeat — additional ownership tools

These tools inherit P4 above, including its unresolved Monid coverage, permissions and delivery performance. Institutional tools describe historical disclosed positions.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T32 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |
| T34 | $0.01 | $11.00 | $110.00 | $352.00 | $3,520.00 |

#### T32 — Get institutional ownership

[`/get_institutional_ownership`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_institutional_ownership) · **$0.01/call** · Data type: **ownership** · MVP relevance: **Medium**.

Institutional holders and ownership changes. **Potential use:** Ownership tab with filing dates. **Limit:** Historical institution positions are not director/officer transactions or current portfolios.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

#### T34 — Get insider trades

[`/get_insider_trades`](https://api.monid.ai/public/v1/providers/marketbeat/endpoints/get_insider_trades) · **$0.01/call** · Data type: **insider** · MVP relevance: **High**.

Company insider transactions. **Potential use:** Company insider timeline and holding alerts. **Limit:** Reported transactions need original SEC links, codes and amendment handling.

**Budget cadence:** Per company: hourly, 16 h/day, 22 workdays. Coverage, source authority, rights, audience and speed inherit P4; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### Nasdaq — additional ownership tools

These tools inherit P1 above, including its unresolved Monid coverage, permissions and delivery performance. Institutional tools describe historical disclosed positions.

| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |
|---|---:|---:|---:|---:|---:|
| T11 | $0.01 | $11.00 | $110.00 | $30.00 | $300.00 |

#### T11 — Get institutional holdings

[`/get_stock_institutional_holdings`](https://api.monid.ai/public/v1/providers/nasdaq/endpoints/get_stock_institutional_holdings) · **$0.01/call** · Data type: **ownership** · MVP relevance: **Medium**.

Institutional ownership records. **Potential use:** Company ownership and investor changes. **Limit:** Institutional filings describe historical positions; not same-day insider trades.

**Budget cadence:** Per company/security: once daily. Coverage, source authority, rights, audience and speed inherit P1; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.

### Best foundation for an Insider Activity feature

**Direct SEC ingestion has the clearest official-source and public reuse position.** SEC public APIs require no API key; submissions metadata typically updates within a second after dissemination, with peak delays possible. That is SEC-side publication processing, not trade-execution timing or our end-to-end service guarantee. Parse the actual ownership XML for transaction details; Company Facts is not an insider-transactions API. Use a shared backend, identified clients, aggregate fair-access limits and bulk files for bootstrap. [^s58]

The SEC states that public information on its website may be copied or distributed without SEC permission, requests attribution, and restricts misleading use of its marks. Its automated access policy includes an aggregate ten-requests-per-second limit. This is a clearer basis for source facts than an unverified reseller grant; it does not license third-party commentary or illustrations. Public access has no stated vendor per-call fee, but infrastructure, parsing and operations still cost money. [^s59]

The inspected SEC insider datasets cover January 2006 through June 2026 and update quarterly. They are useful for backfill and reconciliation, not same-day alerts, and preserve as-filed limitations. No exact current issuer-coverage count is claimed. Match actual issuer CIKs to our catalogue and report the percentage with supported, recent records. [^s60]

The proposed UI is an **Insider Activity** page plus company and My Stocks tabs. Show issuer, person/role, transaction code/type, trade date, filing date, price, shares, value, direct/indirect ownership, reporting-plan notes and original filing. Keep Institutional Holdings and Beneficial Ownership as distinct views. Display “reported after the transaction” and the as-of dates; preserve amendments and avoid double-counting joint reports. Ratios and highlighted purchases are research context, not predictions of price direction.

## Budget choices and scaling

The following sums intentionally enable every tool in a provider family, including overlapping alternatives and optional features. They are **mechanical comparison totals, not recommended bundles or production quotes**. The research total assumes each of the five daily research actions calls every listed tool in that family. The feed total sums the separately described schedules and scopes.

| Family | Tools | Research 10 | Research 100 | Feed 10 | Feed 100 |
|---|---:|---:|---:|---:|---:|
| Nasdaq | 20 | $220.00 | $2,200.00 | $4,847.48 | $44,892.98 |
| Yahoo Finance | 5 | $275.00 | $2,750.00 | $11,307.50 | $113,075.00 |
| Finviz | 5 | $55.00 | $550.00 | $2,244.40 | $22,008.40 |
| MarketBeat | 14 | $176.00 | $1,760.00 | $2,913.50 | $29,135.00 |
| StockAnalysis | 7 | $77.00 | $770.00 | $1,796.62 | $17,830.12 |
| DefiLlama equities | 8 | $5.28 | $52.80 | $275.66 | $2,756.42 |
| SECForm4.com | 11 | $121.00 | $1,210.00 | $489.06 | $3,976.56 |
| All 70, redundant reference only | 70 | $929.28 | $9,292.80 | $23,874.22 | $233,674.48 |


For a more useful comparison, one permitted hourly $0.01 headline endpoint plus one daily $0.0006 statements endpoint would incur $481.80 / $4,818 in feed call fees, or $11.66 / $116.60 if each occasional research action calls both. This is a hypothetical two-tool scope, not an assertion of coverage, compatibility or permission. Adding a five-minute DefiLlama summary endpoint brings feed call fees to $584.76 / $5,847.60. Do not add an entire provider family when the product only needs one field set.

For a single endpoint with one request per company and no batching, cataloguing every supported company instead of only followed companies changes costs sharply:

| Covered company-query keys | $0.01 daily | $0.01 hourly news | $0.01 five-minute market | $0.0006 five-minute market |
|---|---:|---:|---:|---:|
| 1,515 | $454.50 | $7,272.00 | $25,997.40 | $1,559.84 |
| 10,000 | $3,000.00 | $48,000.00 | $171,600.00 | $10,296.00 |
| 50,000 | $15,000.00 | $240,000.00 | $858,000.00 | $51,480.00 |


The project’s larger imported catalogue currently contains **1,515 listing rows** (1,441 distinct exact name strings), alongside an older 50-row file. Neither number is an audited unique-issuer count. An additional large US instrument file includes funds; it should not be counted as extra covered companies. The growth objective of 10,000–50,000 companies requires identity mapping and a measured provider universe, not reliance on website marketing totals. These project counts describe inspected repository inputs; they do not measure any vendor’s coverage.

Fundamental statements need not be refreshed continuously. Use event-triggered invalidation, longer reference-data retention and market-wide change feeds where supported and licensed. At 50,000 keys, five-minute per-company polling means about 167 requests/second during the session before pagination/retries; neither Monid throughput nor upstream permission for that workload was established. Changing vendors, batching or event feeds can change that architecture, but requires demonstrated capabilities.

Direct products are **alternatives, not automatic extra Monid charges**: Finviz Elite lists $39.50/month or $299.50/year for its personal product; SECForm4 lists $44.95/month Advanced and $49.95/month Pro; DefiLlama lists a $300/month direct Pro API. None of those prices establishes rights for ten or 100 customers in our platform. A commercial data agreement can add charges or provide a different route; pricing is unknown until its scope is specified. [^s29], [^s57], [^s5]

## Proposed fit with the MVP and decision requirements

Use the existing shared news-ingestion architecture as the starting point: source adapter → normalized record with publisher/issuer/time/rights fields → shared storage and deduplication → catalogue and portfolio matching → All News, My Stocks, company pages and optional research views. Prices, financial statements, ownership disclosures and journalism need separate record types and freshness rules. Existing adapters and rights fields do not themselves make authentication, user entitlements or a new provider contract production ready.

Keep Monid credentials on the backend, use an endpoint allowlist and input validation, set per-provider spend/retry limits, and validate returned links/content before display. Ticker queries do not need customer names, account balances, holdings quantities or portfolio weights. Match those locally. Monid documents server integrations and synchronous/asynchronous execution, but a public metadata response is not evidence of a security certification, DPA or uptime commitment. [^s61], [^s8]

Before selecting a connector, obtain its supported security directory and field availability; identify the actual operator and upstream suppliers; confirm the rights for internal analytics, customer display, caching, history, downloads, derived outputs, headlines, bodies and photos. An existing agreement that expressly covers the use may be sufficient; a new email permission is not inherently required for every API. **The evidence here does not establish such a grant for these Monid tools.** Paying a per-call fee proves access purchase, not every downstream right.

Then evaluate a permitted sample spanning major US names, small caps, foreign listings, multiple share classes, delisted securities and likely ticker collisions. Measure identity coverage separately from price, financial, news and insider coverage. Check payloads against the relevant original sources; record missing fields, mismatches, revisions, article relevance, timestamps, p50/p95 latency and publication-to-availability lag. Establish acceptable thresholds before making customer promises. No tool can currently receive an evidence-based numerical accuracy or real-time rating from this public-only review.

**Decision order:** (1) official SEC for insider/filing foundations; (2) one authorised company-news discovery source, compared with the existing free official-source architecture; (3) documented DefiLlama equity data for a bounded chart/fundamentals trial if licensed and sufficiently covered; (4) optional screener, analyst or fund views only where customers need them. StockAnalysis’s programmatic-access conflict, SECForm4 tier/freshness and every reseller’s downstream rights remain explicit unresolved items.

## Sources

Sources were inspected for this 9 September 2026 assessment. Statements about provider websites, direct APIs and independent wrappers are not interchangeable. Exact per-tool catalogue URLs are linked in every tool card and preserved in the workbook and companion inventory. Saved public metadata supports the 70-tool inventory; it is not a data-delivery benchmark.

1. [Monid finance directory and paginated public catalogue](https://monid.ai/tools?c=finance).
2. [Monid public finance endpoint metadata](https://api.monid.ai/public/v1/endpoints?category=finance&limit=24).
3. [StockAnalysis: no API/MCP or programmatic redistribution rights, 8 July 2026](https://stockanalysis.com/help/faq/api-access/).
4. [SECForm4 significant buys: delay and selection thresholds](https://www.secform4.com/significant-buys).
5. [DefiLlama official API documentation and direct Pro pricing](https://api-docs.defillama.com/).
6. [DefiLlama official Pro endpoint documentation](https://github.com/DefiLlama/api-docs/blob/main/llms-pro.txt).
7. [Monid endpoint inspection documentation](https://monid.ai/docs/api/inspect).
8. [Monid execution documentation](https://monid.ai/docs/api/run).
9. [Parse own documentation: independent Nasdaq wrapper](https://parse.bot/marketplace/8357401b-21c5-4fa5-8701-fff62d9a9922/nasdaq-com-api).
10. [Parse own documentation: independent Yahoo wrapper](https://parse.bot/marketplace/417d966a-b180-44b0-80e5-477772dfc4e2/yahoofinance-com-api).
11. [Parse own documentation: independent Finviz wrapper](https://parse.bot/marketplace/09c62661-67ab-42f3-bdbe-e4f90fbd888d/finviz-com-api).
12. [Parse own documentation: independent MarketBeat wrapper](https://parse.bot/marketplace/7efa2b5b-c2ed-4d9d-99d4-0f3e152f73f3/marketbeat-com-api).
13. [Parse own documentation: independent StockAnalysis wrapper](https://parse.bot/marketplace/c9e8ac45-0663-4195-91fb-b986563bdfe8/stockanalysis-com-api).
14. [Parse own documentation: independent SECForm4 wrapper](https://parse.bot/marketplace/a56dfc20-a7a3-48db-9766-5437ed41cefb/secform4-com-api).
15. [Nasdaq Last Sale: official product and named direct users](https://www.nasdaq.com/products/data/equities/nasdaq-last-sale).
16. [Nasdaq market activity: earnings-calendar methodology](https://www.nasdaq.com/market-activity).
17. [Nasdaq Apple financials: displayed units](https://www.nasdaq.com/market-activity/stocks/aapl/financials).
18. [Nasdaq institutional-holdings methodology](https://www.nasdaq.com/market-activity/stocks/aapl/institutional-holdings).
19. [Nasdaq Apple quote page: website refresh and index delay](https://www.nasdaq.com/market-activity/stocks/aapl).
20. [Nasdaq Trader short-interest reporting and dissemination](https://nasdaqtrader.com/trader.aspx?id=ShortInterest).
21. [Nasdaq Retail Trading Activity Tracker: separate direct dataset](https://data.nasdaq.com/databases/RTAT/documentation?anchor=sample-data).
22. [Nasdaq website legal terms, updated 11 May 2026](https://www.nasdaq.com/legal).
23. [Yahoo Finance exchange delays, providers and redistribution notice](https://help.yahoo.com/kb/finance/SLN2310.html).
24. [Yahoo Finance additional terms](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/finance/index.html).
25. [Finviz FAQ: exchanges, quote delays and fundamental refresh](https://finviz.com/help/faq).
26. [Finviz stock-only screener: observed listing-row count](https://finviz.com/screener?f=ind_stocksonly&v=111).
27. [Finviz unrestricted screener: stocks and funds](https://finviz.com/screener?v=111).
28. [Finviz direct API usage limits and personal-use restrictions](https://finviz.com/knowledge-base/market-data-research/api/usage-limits).
29. [Finviz Elite: direct subscription, audience and features](https://finviz.com/elite).
30. [MarketBeat company coverage, audience and data suppliers](https://www.marketbeat.com/about/).
31. [MarketBeat editorial standards and corrections](https://www.marketbeat.com/editorial-guidelines/).
32. [MarketBeat FAQ: analytical scores and AI-assisted content](https://www.marketbeat.com/faq/).
33. [MarketBeat insider screener: SEC-derived transactions](https://www.marketbeat.com/all-access/insider-trades-screener/).
34. [MarketBeat terms: site/XML licences and commercial use](https://www.marketbeat.com/terms/).
35. [StockAnalysis data coverage: tradable symbols, updated 31 July 2026](https://stockanalysis.com/help/data-and-downloads/about-our-data/).
36. [StockAnalysis sources and financial update timings](https://stockanalysis.com/data-sources/).
37. [StockAnalysis price refresh and exchange-dependent delays](https://stockanalysis.com/help/faq/stock-price-data/).
38. [StockAnalysis terms of use](https://stockanalysis.com/terms-of-use/).
39. [StockAnalysis intended audience](https://stockanalysis.com/about/).
40. [DefiLlama equities beta and source attribution](https://defillama.com/equities).
41. [DefiLlama terms covering APIs and commercial republication](https://defillama.com/terms/).
42. [Twelve Data terms: external display and redistribution entitlements](https://twelvedata.com/terms).
43. [SEC investor bulletin on insider reporting](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-69).
44. [SEC ownership transaction codes](https://www.sec.gov/edgar/searchedgar/ownershipformcodes.html).
45. [SEC Form 13F FAQ: threshold, holdings and reporting deadlines](https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/frequently-asked-questions-about-form-13f).
46. [SEC beneficial ownership reporting interpretations](https://www.sec.gov/rules-regulations/staff-guidance/corporation-finance-interpretations/exchange-act-sections-13d-13g-regulation-13d-g-beneficial-ownership-reporting).
47. [SEC 2026 foreign-insider reporting final rules](https://www.sec.gov/newsroom/press-releases/2026-23-sec-adopts-final-rules-holding-foreign-insiders-accountable-act).
48. [SEC foreign-insider exemption order](https://www.sec.gov/rules-regulations/2026/03/34-104931).
49. [SEC June 2026 foreign-insider exemption extension](https://www.sec.gov/files/rules/exorders/2026/34-105517.pdf).
50. [SECForm4.com service description](https://www.secform4.com/).
51. [Monid vendor-reported Form 4 examples, 7 September 2026](https://monid.ai/blog/guides/insider-trading-api-form-4-data).
52. [SECForm4 public buys: six-month delay notice](https://www.secform4.com/all-buys).
53. [SECForm4 public sales: six-month delay notice](https://www.secform4.com/insider-sales).
54. [SECForm4 public insider options: six-month delay notice](https://www.secform4.com/stock-options).
55. [SECForm4 public buy/sell ratios: six-month delay notice](https://www.secform4.com/insider-buy-sell-ratios).
56. [SECForm4 Apple history: reported dates and split-adjustment warning](https://www.secform4.com/insider-trading/320193.htm).
57. [SECForm4 direct website subscription plans](https://www.secform4.com/account/sign-up).
58. [SEC EDGAR APIs: access, update timing and bulk data](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
59. [SEC public information reuse and automated access policy](https://www.sec.gov/about/privacy-information).
60. [SEC insider transaction datasets and as-filed limitations](https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets).
61. [Monid server integration documentation](https://monid.ai/docs/integrations/overview).

[^s1]: Monid finance directory and paginated public catalogue. https://monid.ai/tools?c=finance (accessed 9 September 2026).
[^s2]: Monid public finance endpoint metadata. https://api.monid.ai/public/v1/endpoints?category=finance&limit=24 (accessed 9 September 2026).
[^s3]: StockAnalysis: no API/MCP or programmatic redistribution rights, 8 July 2026. https://stockanalysis.com/help/faq/api-access/ (accessed 9 September 2026).
[^s4]: SECForm4 significant buys: delay and selection thresholds. https://www.secform4.com/significant-buys (accessed 9 September 2026).
[^s5]: DefiLlama official API documentation and direct Pro pricing. https://api-docs.defillama.com/ (accessed 9 September 2026).
[^s6]: DefiLlama official Pro endpoint documentation. https://github.com/DefiLlama/api-docs/blob/main/llms-pro.txt (accessed 9 September 2026).
[^s7]: Monid endpoint inspection documentation. https://monid.ai/docs/api/inspect (accessed 9 September 2026).
[^s8]: Monid execution documentation. https://monid.ai/docs/api/run (accessed 9 September 2026).
[^s9]: Parse own documentation: independent Nasdaq wrapper. https://parse.bot/marketplace/8357401b-21c5-4fa5-8701-fff62d9a9922/nasdaq-com-api (accessed 9 September 2026).
[^s10]: Parse own documentation: independent Yahoo wrapper. https://parse.bot/marketplace/417d966a-b180-44b0-80e5-477772dfc4e2/yahoofinance-com-api (accessed 9 September 2026).
[^s11]: Parse own documentation: independent Finviz wrapper. https://parse.bot/marketplace/09c62661-67ab-42f3-bdbe-e4f90fbd888d/finviz-com-api (accessed 9 September 2026).
[^s12]: Parse own documentation: independent MarketBeat wrapper. https://parse.bot/marketplace/7efa2b5b-c2ed-4d9d-99d4-0f3e152f73f3/marketbeat-com-api (accessed 9 September 2026).
[^s13]: Parse own documentation: independent StockAnalysis wrapper. https://parse.bot/marketplace/c9e8ac45-0663-4195-91fb-b986563bdfe8/stockanalysis-com-api (accessed 9 September 2026).
[^s14]: Parse own documentation: independent SECForm4 wrapper. https://parse.bot/marketplace/a56dfc20-a7a3-48db-9766-5437ed41cefb/secform4-com-api (accessed 9 September 2026).
[^s15]: Nasdaq Last Sale: official product and named direct users. https://www.nasdaq.com/products/data/equities/nasdaq-last-sale (accessed 9 September 2026).
[^s16]: Nasdaq market activity: earnings-calendar methodology. https://www.nasdaq.com/market-activity (accessed 9 September 2026).
[^s17]: Nasdaq Apple financials: displayed units. https://www.nasdaq.com/market-activity/stocks/aapl/financials (accessed 9 September 2026).
[^s18]: Nasdaq institutional-holdings methodology. https://www.nasdaq.com/market-activity/stocks/aapl/institutional-holdings (accessed 9 September 2026).
[^s19]: Nasdaq Apple quote page: website refresh and index delay. https://www.nasdaq.com/market-activity/stocks/aapl (accessed 9 September 2026).
[^s20]: Nasdaq Trader short-interest reporting and dissemination. https://nasdaqtrader.com/trader.aspx?id=ShortInterest (accessed 9 September 2026).
[^s21]: Nasdaq Retail Trading Activity Tracker: separate direct dataset. https://data.nasdaq.com/databases/RTAT/documentation?anchor=sample-data (accessed 9 September 2026).
[^s22]: Nasdaq website legal terms, updated 11 May 2026. https://www.nasdaq.com/legal (accessed 9 September 2026).
[^s23]: Yahoo Finance exchange delays, providers and redistribution notice. https://help.yahoo.com/kb/finance/SLN2310.html (accessed 9 September 2026).
[^s24]: Yahoo Finance additional terms. https://legal.yahoo.com/us/en/yahoo/terms/product-atos/finance/index.html (accessed 9 September 2026).
[^s25]: Finviz FAQ: exchanges, quote delays and fundamental refresh. https://finviz.com/help/faq (accessed 9 September 2026).
[^s26]: Finviz stock-only screener: observed listing-row count. https://finviz.com/screener?f=ind_stocksonly&v=111 (accessed 9 September 2026).
[^s27]: Finviz unrestricted screener: stocks and funds. https://finviz.com/screener?v=111 (accessed 9 September 2026).
[^s28]: Finviz direct API usage limits and personal-use restrictions. https://finviz.com/knowledge-base/market-data-research/api/usage-limits (accessed 9 September 2026).
[^s29]: Finviz Elite: direct subscription, audience and features. https://finviz.com/elite (accessed 9 September 2026).
[^s30]: MarketBeat company coverage, audience and data suppliers. https://www.marketbeat.com/about/ (accessed 9 September 2026).
[^s31]: MarketBeat editorial standards and corrections. https://www.marketbeat.com/editorial-guidelines/ (accessed 9 September 2026).
[^s32]: MarketBeat FAQ: analytical scores and AI-assisted content. https://www.marketbeat.com/faq/ (accessed 9 September 2026).
[^s33]: MarketBeat insider screener: SEC-derived transactions. https://www.marketbeat.com/all-access/insider-trades-screener/ (accessed 9 September 2026).
[^s34]: MarketBeat terms: site/XML licences and commercial use. https://www.marketbeat.com/terms/ (accessed 9 September 2026).
[^s35]: StockAnalysis data coverage: tradable symbols, updated 31 July 2026. https://stockanalysis.com/help/data-and-downloads/about-our-data/ (accessed 9 September 2026).
[^s36]: StockAnalysis sources and financial update timings. https://stockanalysis.com/data-sources/ (accessed 9 September 2026).
[^s37]: StockAnalysis price refresh and exchange-dependent delays. https://stockanalysis.com/help/faq/stock-price-data/ (accessed 9 September 2026).
[^s38]: StockAnalysis terms of use. https://stockanalysis.com/terms-of-use/ (accessed 9 September 2026).
[^s39]: StockAnalysis intended audience. https://stockanalysis.com/about/ (accessed 9 September 2026).
[^s40]: DefiLlama equities beta and source attribution. https://defillama.com/equities (accessed 9 September 2026).
[^s41]: DefiLlama terms covering APIs and commercial republication. https://defillama.com/terms/ (accessed 9 September 2026).
[^s42]: Twelve Data terms: external display and redistribution entitlements. https://twelvedata.com/terms (accessed 9 September 2026).
[^s43]: SEC investor bulletin on insider reporting. https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-69 (accessed 9 September 2026).
[^s44]: SEC ownership transaction codes. https://www.sec.gov/edgar/searchedgar/ownershipformcodes.html (accessed 9 September 2026).
[^s45]: SEC Form 13F FAQ: threshold, holdings and reporting deadlines. https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/frequently-asked-questions-about-form-13f (accessed 9 September 2026).
[^s46]: SEC beneficial ownership reporting interpretations. https://www.sec.gov/rules-regulations/staff-guidance/corporation-finance-interpretations/exchange-act-sections-13d-13g-regulation-13d-g-beneficial-ownership-reporting (accessed 9 September 2026).
[^s47]: SEC 2026 foreign-insider reporting final rules. https://www.sec.gov/newsroom/press-releases/2026-23-sec-adopts-final-rules-holding-foreign-insiders-accountable-act (accessed 9 September 2026).
[^s48]: SEC foreign-insider exemption order. https://www.sec.gov/rules-regulations/2026/03/34-104931 (accessed 9 September 2026).
[^s49]: SEC June 2026 foreign-insider exemption extension. https://www.sec.gov/files/rules/exorders/2026/34-105517.pdf (accessed 9 September 2026).
[^s50]: SECForm4.com service description. https://www.secform4.com/ (accessed 9 September 2026).
[^s51]: Monid vendor-reported Form 4 examples, 7 September 2026. https://monid.ai/blog/guides/insider-trading-api-form-4-data (accessed 9 September 2026).
[^s52]: SECForm4 public buys: six-month delay notice. https://www.secform4.com/all-buys (accessed 9 September 2026).
[^s53]: SECForm4 public sales: six-month delay notice. https://www.secform4.com/insider-sales (accessed 9 September 2026).
[^s54]: SECForm4 public insider options: six-month delay notice. https://www.secform4.com/stock-options (accessed 9 September 2026).
[^s55]: SECForm4 public buy/sell ratios: six-month delay notice. https://www.secform4.com/insider-buy-sell-ratios (accessed 9 September 2026).
[^s56]: SECForm4 Apple history: reported dates and split-adjustment warning. https://www.secform4.com/insider-trading/320193.htm (accessed 9 September 2026).
[^s57]: SECForm4 direct website subscription plans. https://www.secform4.com/account/sign-up (accessed 9 September 2026).
[^s58]: SEC EDGAR APIs: access, update timing and bulk data. https://www.sec.gov/search-filings/edgar-application-programming-interfaces (accessed 9 September 2026).
[^s59]: SEC public information reuse and automated access policy. https://www.sec.gov/about/privacy-information (accessed 9 September 2026).
[^s60]: SEC insider transaction datasets and as-filed limitations. https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets (accessed 9 September 2026).
[^s61]: Monid server integration documentation. https://monid.ai/docs/integrations/overview (accessed 9 September 2026).
