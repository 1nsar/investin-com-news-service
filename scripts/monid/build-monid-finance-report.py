#!/usr/bin/env python3
"""Build the finance-only assessment and editable cost workbook from saved evidence.

No network requests or paid executions. Requires xlsxwriter; DOCX/PDF rendering
is a separate pandoc/Chrome step. Values are a dated catalogue scenario, not quotes.
"""
import csv
import json
import math
from collections import Counter
from pathlib import Path
import xlsxwriter

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/monid'
EVIDENCE = DOCS / 'evidence/finance/2026-09-09'
ROWS = json.loads((EVIDENCE / 'tools.json').read_text())
PROVIDERS = json.loads((EVIDENCE / 'providers.json').read_text())
SOURCES = json.loads((EVIDENCE / 'sources.json').read_text())

# Excel row numbers are stable and explicitly referenced in every formula.
ASSUMPTIONS = [
 ('Users: smaller scenario',10,'Number of app users; not provider seats.'),
 ('Users: larger scenario',100,'Number of app users; not provider seats.'),
 ('Research lookups / user / workday',5,'Each lookup calls ONE selected endpoint. A multi-tool page sums those endpoint calls.'),
 ('Workdays / month',22,'Budget convention, not the actual exchange/filing calendar.'),
 ('Calendar days / month',30,'Budget convention.'),
 ('Followed security keys / user',20,'A key identifies one security/company query; not necessarily a unique issuer.'),
 ('Unique-union ratio',0.5,'Distinct followed keys / sum of watchlist lengths. Sharing requires permission. Minimum is one full watchlist.'),
 ('Regular market hours / day',6.5,'US regular-session budget; extended and global sessions require a larger setting.'),
 ('Market polling interval: minutes',5,'Proposed polling only; does not establish real-time data.'),
 ('News active hours / calendar day',16,'Hourly news monitoring; not 24-hour coverage.'),
 ('News polling interval: minutes',60,'Hourly polling. New items can wait up to a polling interval plus upstream lag.'),
 ('Filing active hours / workday',16,'Illustrative window, not an exact EDGAR schedule; gaps need catch-up.'),
 ('Global insider polling: minutes',15,'One page per poll by default; not evidence of complete market coverage.'),
 ('Company filing polling: minutes',60,'Hourly company/filing checks in the illustrative workday window.'),
 ('Daily checks / calendar day',1,'Daily snapshots. Event-driven caching may reduce traffic.'),
 ('Lookup cache-miss fraction',0.5,'Applies only to demand-only lookups in the regular-feed scenario.'),
 ('Crypto active hours / calendar day',24,'Optional crypto endpoint only, two assets by default.'),
 ('On-chain mapping interval: minutes',60,'Venue mappings, not a corporate crypto-holdings or trade feed.'),
 ('Premarket hours / workday',5.5,'Illustrative US premarket monitoring window; confirm source session coverage.'),
]
A = {name: value for name,value,_ in ASSUMPTIONS}

# label, scope, formula in Excel, cached result. All formulas reference editable assumptions.
PROFILES = {
 'entity_market':('Per security: every 5 min in regular market hours','entity',"=Assumptions!$B$9*60/Assumptions!$B$10*Assumptions!$B$5",1716),
 'global_market':('Shared market list: every 5 min in regular hours','global',"=Assumptions!$B$9*60/Assumptions!$B$10*Assumptions!$B$5",1716),
 'entity_news':('Per company: hourly, 16 h/day, 30 days','entity',"=Assumptions!$B$11*60/Assumptions!$B$12*Assumptions!$B$6",480),
 'entity_hourly':('Per company: hourly, 16 h/day, 22 workdays','entity',"=Assumptions!$B$13*60/Assumptions!$B$15*Assumptions!$B$5",352),
 'global_insider':('Shared disclosure list: 15 min, 16 h, 22 workdays','global',"=Assumptions!$B$13*60/Assumptions!$B$14*Assumptions!$B$5",1408),
 'entity_daily':('Per company/security: once daily','entity',"=Assumptions!$B$16*Assumptions!$B$6",30),
 'global_daily':('Shared directory/calendar/list: once daily','global',"=Assumptions!$B$16*Assumptions!$B$6",30),
 'lookup_demand':('Demand-only lookup, 50% cache misses','demand',"=0",0),
 'entity_crypto':('Optional crypto: every 5 min, 24 h/day','entity',"=Assumptions!$B$18*60/Assumptions!$B$10*Assumptions!$B$6",8640),
 'entity_onchain':('Tokenized/perpetual venues: hourly, 24 h/day','entity',"=24*60/Assumptions!$B$19*Assumptions!$B$6",720),
 'global_premarket':('Shared premarket list: every 5 min, 5.5 h, 22 days','global',"=Assumptions!$B$20*60/Assumptions!$B$10*Assumptions!$B$5",1452),
}

def money(v): return f'${v:,.2f}'
def price(r): return float(r['price']['amount']['value'])
def unit(v): return f'${v:.4f}'.rstrip('0').rstrip('.')
def costs(r):
    scope = PROFILES[r['feedProfile']][1]
    polls = PROFILES[r['feedProfile']][3]
    out = {}
    for users in [10,100]:
        n = max(20,math.ceil(users*20*.5)) if scope=='entity' else 1
        n = r[f'override{users}'] or n
        research_calls = users*5*22
        feed_calls = research_calls*.5 if scope=='demand' else n*polls
        out.update({f'keys{users}':n,f'researchCalls{users}':research_calls,f'feedCalls{users}':feed_calls,
                    f'researchCost{users}':research_calls*price(r),f'feedCost{users}':feed_calls*price(r)})
    return out

for r in ROWS: r.update(costs(r))
assert len(ROWS)==70 and len({(r['provider'],r['endpoint']) for r in ROWS})==70
assert Counter(r['block'] for r in ROWS)=={1:55,2:15}
assert all(r['price']['type']=='PER_CALL' and r['price']['amount']['currency']=='USD' for r in ROWS)

used = []
def cite(*keys):
    for key in keys:
        assert key in SOURCES,key
        if key not in used: used.append(key)
    return ', '.join(f'[^s{used.index(k)+1}]' for k in keys)

def cost_table(rows):
    lines=['| Tool ID | USD/call | Research: 10 users | Research: 100 | Feed: 10 users | Feed: 100 |',
           '|---|---:|---:|---:|---:|---:|']
    for r in rows:
        lines.append(f"| {r['id']} | {unit(price(r))} | {money(r['researchCost10'])} | {money(r['researchCost100'])} | {money(r['feedCost10'])} | {money(r['feedCost100'])} |")
    return '\n'.join(lines)

def provider_profile(key):
    p=PROVIDERS[key]
    return f"""### {p['code']} — {p['name']}

**Company coverage.** {p['coverage']} {cite(*[k for k in p['refs'] if k in ['nls','yahoo','finvizfaq','finvizcount','finvizall','mbabout','sacoverage','llamadocs','llamaequities','sfhome']])}

**Official source and accuracy.** {p['source']} {p['quality']} {cite(*[k for k in p['refs'] if k in ['nasdaqcalendar','nasdaqfin','nasdaqhold','mbeditorial','mbfaq','mbinsider','sasources','llamaschema','sfmonid']])}

**Speed and real time.** {p['timing']} {cite(*[k for k in p['refs'] if k in ['nasdaqquote','short','retail','yahoo','finvizfaq','mbabout','sasources','saprice','llamaschema','sfbuys','sfsales','sfsignificant','sfoptions','sfratios','sfcompany']])}

**Permission and commercial suitability.** {p['rights']} {cite(*[k for k in p['refs'] if k in ['nasdaqterms','yahoo','yahooterms','finvizapi','finvizplans','mbterms','saapi','saterms','llamaterms','twelve','sfplans']])}

**Who uses it.** {p['audience']} {cite(*[k for k in p['refs'] if k in ['nls','finvizplans','saabout','mbfaq']])}

**Assessment.** {p['decision']}
"""

def cards(rows):
    result=[]
    for r in rows:
        profile,scope,_,_=PROFILES[r['feedProfile']]
        override=f" Fixed monitored keys: {r['override10']} in both user scenarios." if r['override10'] else ''
        detail_citation=cite('parse-'+r['provider']) if 'Parse' in r['limitation'] else ''
        if r['endpoint']=='/get_retail_trading_activity': detail_citation+=cite('retail')
        result.append(f"""#### {r['id']} — {r['displayName']}

[`{r['endpoint']}`]({r['sourceUrl']}) · **{unit(price(r))}/call** · Data type: **{r['dataClass']}** · MVP relevance: **{r['relevance']}**.

{r['description']}. **Potential use:** {r['platformFit']}. **Limit:** {r['limitation']} {detail_citation}

**Budget cadence:** {profile}.{override} Coverage, source authority, rights, audience and speed inherit {r['providerCode']}; the data-type assessment above supplies the accuracy/freshness criteria. Detailed per-tool fields are also in Excel.
""")
    return '\n'.join(result)

md = f"""# Monid Finance Tools: Coverage, Quality and Integration Costs

## Decision brief

**Monid lists useful research connectors, but the public evidence does not establish a licensed, complete, real-time data supply for our platform.** The finance catalogue advertises 71 tools; pagination exposes **70 unique tools**: 55 company/market/news tools and 15 insider/ownership tools. StockAnalysis accounts for the unresolved difference: eight advertised, seven retrievable. The missing listing cannot be identified or costed reliably. This report covers every retrievable finance tool as observed on 9 September 2026. News-category and prediction-market tools are outside this category-specific inventory. {cite('catalogue','public')}

The strongest opportunities are company research cards, filing-linked events and an Insider Activity feature. Only **three endpoints directly discover news**—Nasdaq news, Yahoo news and MarketBeat headlines—plus Finviz news sentiment. None establishes a licensed full-text reader, matching article photos, free access to publisher paywalls or complete macro news coverage.

Three findings materially affect the decision. StockAnalysis explicitly disclaims programmatic access and programmatic resale rights. Several SECForm4 public feeds show a six-month delay, although Monid’s actual entitlement is unknown. DefiLlama’s eight equity endpoints are documented official vendor APIs, but beta status, supported issuers and onward commercial display still need resolution. {cite('saapi','sfsignificant','llamadocs','llamaschema')}

**Recommendation:** evaluate a company-headline source with demonstrated commercial rights and DefiLlama’s documented financial/chart API as distinct additions; use official SEC disclosures as the preferred foundation for insider events. No examined Monid news connector is yet confirmed authorised for our use; an existing licensed adapter or direct provider is an alternative. Hold StockAnalysis production use pending proof of an authorised supply route. Do not purchase all overlapping tools. These are research recommendations; no new provider integration is included in this assessment.

## Evidence and evaluation rules

Catalogue metadata establishes names, prices and listings. Published upstream documentation establishes what the named source says about itself. Monid-delivered payloads, contractual entitlements and performance are a third layer. No authenticated paid executions were used here, so **per-tool supported company counts, measured accuracy, latency percentiles, uptime, pagination and named production customers remain unverified**. Missing evidence is not proof that a private agreement or capability does not exist. Generic provider marketing text must not be read as a guarantee that every endpoint returns all described fields. {cite('inspect','run')}

Matching function names also appear in Parse’s independently described website wrappers: Nasdaq, Yahoo, Finviz, MarketBeat, StockAnalysis and SECForm4. This is a provenance lead, **not proof that Parse supplies Monid**, nor proof that Monid lacks a private agreement. Parse-specific schema/capacity limits are labelled conditional wherever mentioned. A Monid “verified” badge does not itself document publisher authority or commercial redistribution. {cite('parse-nasdaq','parse-yahoo','parse-finviz','parse-marketbeat','parse-stockanalysis','parse-secform4')}

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

**These are catalogue call charges, not all-in commercial quotes.** Prices are USD per call, not per user. Displayed rates are used without adding an unverified extra markup. Licensing/exchange fees, taxes, subscriptions, minimum commitments, hosting, storage, AI processing, historical backfill, full-text/image rights and support are excluded because applicable quotes or requirements are unknown. Failed-call and retry billing also require confirmation. {cite('public','inspect','run')}

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
"""

for provider in list(PROVIDERS)[:-1]:
    selected=[r for r in ROWS if r['block']==1 and r['provider']==provider]
    md += '\n'+provider_profile(provider)+'\n'+cost_table(selected)+'\n\n'+cards(selected)

md += f"""
### Implications for our company-news product

Nasdaq `/get_stock_news`, Yahoo `/get_stock_news` and MarketBeat `/get_stock_headlines` are potential **discovery** inputs for All News, My Stocks and catalogue-company feeds. Price/history/filing data can add context beside an article. Finviz sentiment is optional interpretation, not a substitute for the story or its verification. Company lookups do not establish comprehensive central-bank, government or macroeconomic reporting.

A usable record needs an original publisher/domain, canonical URL, publication/update time, language, company identifiers and an explanation of relevance. The page should distinguish issuer announcements, regulatory filings, reported journalism, commentary and calculated signals. An article mentioning Apple as a comparison should not automatically become an important Apple event. Source facts can be accurate while an issuer’s statements remain promotional or forward-looking.

**In-platform reading and images remain separate permissions.** Fetching a headline/link does not grant the body, photograph or publisher paywall access. Display only fields expressly covered by the contract; provide the original link and show access requirements where applicable. Do not promise free full text to all users, use a subscriber cookie for other customers, or present a subscription as a multi-user licence. The current official-source feed can remain the base; one selected licensed aggregator could extend discovery after evaluation. {cite('nasdaqterms','yahoo','mbterms','saapi')}

## Block 2 — Insider and ownership data

This block contains **15 tools**. Executive transactions, beneficial ownership and institutional holdings are related research areas with different meanings and clocks. Nasdaq retail activity and short interest are deliberately in Block 1; they are not insider trading. The general Nasdaq filings endpoint can help discover original documents but is not counted twice.

### Official reporting versus market events

The **SEC is the official US filing repository**; SECForm4.com is a private aggregator. Form 4 generally follows a transaction within two business days, with exceptions. Code P includes open-market or private purchases; S is a sale; A an award/grant; F withholding; M exercise/conversion; G a gift. Awards, gifts, exercises, tax withholding and proposed sales must not be counted as ordinary investment purchases or completed sales. {cite('secform4','seccodes')}

Institutional 13F filings describe quarter-end positions, normally due within 45 days. The reporting threshold is $100 million in Section 13(f) securities, not all assets. Initial 13D reporting generally has a five-business-day deadline; 13G timing depends on filer and circumstances. These records do not show complete live fund portfolios or establish that a newly published holding was purchased today. {cite('sec13f','sec13dg')}

Scope is also time-sensitive: rules effective in March 2026 extended Section 16(a) reporting to certain foreign private issuer directors/officers, with exemptions. Do not reuse the older blanket assumption that every foreign private issuer is excluded, or infer worldwide coverage from this change. {cite('secfpi','secfpiex','secfpijune')}
"""
md += '\n'+provider_profile('secform4')
for provider in ['secform4','finviz','marketbeat','nasdaq']:
    selected=[r for r in ROWS if r['block']==2 and r['provider']==provider]
    if provider!='secform4':
        p=PROVIDERS[provider]
        md += f"\n### {p['name']} — additional ownership tools\n\nThese tools inherit {p['code']} above, including its unresolved Monid coverage, permissions and delivery performance. Institutional tools describe historical disclosed positions.\n"
    md += '\n'+cost_table(selected)+'\n\n'+cards(selected)

md += f"""
### Best foundation for an Insider Activity feature

**Direct SEC ingestion has the clearest official-source and public reuse position.** SEC public APIs require no API key; submissions metadata typically updates within a second after dissemination, with peak delays possible. That is SEC-side publication processing, not trade-execution timing or our end-to-end service guarantee. Parse the actual ownership XML for transaction details; Company Facts is not an insider-transactions API. Use a shared backend, identified clients, aggregate fair-access limits and bulk files for bootstrap. {cite('secapi')}

The SEC states that public information on its website may be copied or distributed without SEC permission, requests attribution, and restricts misleading use of its marks. Its automated access policy includes an aggregate ten-requests-per-second limit. This is a clearer basis for source facts than an unverified reseller grant; it does not license third-party commentary or illustrations. Public access has no stated vendor per-call fee, but infrastructure, parsing and operations still cost money. {cite('secpolicy')}

The inspected SEC insider datasets cover January 2006 through June 2026 and update quarterly. They are useful for backfill and reconciliation, not same-day alerts, and preserve as-filed limitations. No exact current issuer-coverage count is claimed. Match actual issuer CIKs to our catalogue and report the percentage with supported, recent records. {cite('secdata')}

The proposed UI is an **Insider Activity** page plus company and My Stocks tabs. Show issuer, person/role, transaction code/type, trade date, filing date, price, shares, value, direct/indirect ownership, reporting-plan notes and original filing. Keep Institutional Holdings and Beneficial Ownership as distinct views. Display “reported after the transaction” and the as-of dates; preserve amendments and avoid double-counting joint reports. Ratios and highlighted purchases are research context, not predictions of price direction.

## Budget choices and scaling

The following sums intentionally enable every tool in a provider family, including overlapping alternatives and optional features. They are **mechanical comparison totals, not recommended bundles or production quotes**. The research total assumes each of the five daily research actions calls every listed tool in that family. The feed total sums the separately described schedules and scopes.

| Family | Tools | Research 10 | Research 100 | Feed 10 | Feed 100 |
|---|---:|---:|---:|---:|---:|
"""
for key,p in PROVIDERS.items():
    group=[r for r in ROWS if r['provider']==key]
    md += f"| {p['name']} | {len(group)} | "+' | '.join(money(sum(r[x] for r in group)) for x in ['researchCost10','researchCost100','feedCost10','feedCost100'])+' |\n'
md += '| All 70, redundant reference only | 70 | '+' | '.join(money(sum(r[x] for r in ROWS)) for x in ['researchCost10','researchCost100','feedCost10','feedCost100'])+' |\n'
md += """

For a more useful comparison, one permitted hourly $0.01 headline endpoint plus one daily $0.0006 statements endpoint would incur $481.80 / $4,818 in feed call fees, or $11.66 / $116.60 if each occasional research action calls both. This is a hypothetical two-tool scope, not an assertion of coverage, compatibility or permission. Adding a five-minute DefiLlama summary endpoint brings feed call fees to $584.76 / $5,847.60. Do not add an entire provider family when the product only needs one field set.

For a single endpoint with one request per company and no batching, cataloguing every supported company instead of only followed companies changes costs sharply:

| Covered company-query keys | $0.01 daily | $0.01 hourly news | $0.01 five-minute market | $0.0006 five-minute market |
|---|---:|---:|---:|---:|
"""
for n in [1515,10000,50000]:
    md += f'| {n:,} | '+ ' | '.join(money(n*calls*p) for calls,p in [(30,.01),(480,.01),(1716,.01),(1716,.0006)])+' |\n'
md += f"""

The project’s larger imported catalogue currently contains **1,515 listing rows** (1,441 distinct exact name strings), alongside an older 50-row file. Neither number is an audited unique-issuer count. An additional large US instrument file includes funds; it should not be counted as extra covered companies. The growth objective of 10,000–50,000 companies requires identity mapping and a measured provider universe, not reliance on website marketing totals. These project counts describe inspected repository inputs; they do not measure any vendor’s coverage.

Fundamental statements need not be refreshed continuously. Use event-triggered invalidation, longer reference-data retention and market-wide change feeds where supported and licensed. At 50,000 keys, five-minute per-company polling means about 167 requests/second during the session before pagination/retries; neither Monid throughput nor upstream permission for that workload was established. Changing vendors, batching or event feeds can change that architecture, but requires demonstrated capabilities.

Direct products are **alternatives, not automatic extra Monid charges**: Finviz Elite lists $39.50/month or $299.50/year for its personal product; SECForm4 lists $44.95/month Advanced and $49.95/month Pro; DefiLlama lists a $300/month direct Pro API. None of those prices establishes rights for ten or 100 customers in our platform. A commercial data agreement can add charges or provide a different route; pricing is unknown until its scope is specified. {cite('finvizplans','sfplans','llamadocs')}

## Proposed fit with the MVP and decision requirements

Use the existing shared news-ingestion architecture as the starting point: source adapter → normalized record with publisher/issuer/time/rights fields → shared storage and deduplication → catalogue and portfolio matching → All News, My Stocks, company pages and optional research views. Prices, financial statements, ownership disclosures and journalism need separate record types and freshness rules. Existing adapters and rights fields do not themselves make authentication, user entitlements or a new provider contract production ready.

Keep Monid credentials on the backend, use an endpoint allowlist and input validation, set per-provider spend/retry limits, and validate returned links/content before display. Ticker queries do not need customer names, account balances, holdings quantities or portfolio weights. Match those locally. Monid documents server integrations and synchronous/asynchronous execution, but a public metadata response is not evidence of a security certification, DPA or uptime commitment. {cite('integrations','run')}

Before selecting a connector, obtain its supported security directory and field availability; identify the actual operator and upstream suppliers; confirm the rights for internal analytics, customer display, caching, history, downloads, derived outputs, headlines, bodies and photos. An existing agreement that expressly covers the use may be sufficient; a new email permission is not inherently required for every API. **The evidence here does not establish such a grant for these Monid tools.** Paying a per-call fee proves access purchase, not every downstream right.

Then evaluate a permitted sample spanning major US names, small caps, foreign listings, multiple share classes, delisted securities and likely ticker collisions. Measure identity coverage separately from price, financial, news and insider coverage. Check payloads against the relevant original sources; record missing fields, mismatches, revisions, article relevance, timestamps, p50/p95 latency and publication-to-availability lag. Establish acceptable thresholds before making customer promises. No tool can currently receive an evidence-based numerical accuracy or real-time rating from this public-only review.

**Decision order:** (1) official SEC for insider/filing foundations; (2) one authorised company-news discovery source, compared with the existing free official-source architecture; (3) documented DefiLlama equity data for a bounded chart/fundamentals trial if licensed and sufficiently covered; (4) optional screener, analyst or fund views only where customers need them. StockAnalysis’s programmatic-access conflict, SECForm4 tier/freshness and every reseller’s downstream rights remain explicit unresolved items.

## Sources

Sources were inspected for this 9 September 2026 assessment. Statements about provider websites, direct APIs and independent wrappers are not interchangeable. Exact per-tool catalogue URLs are linked in every tool card and preserved in the workbook and companion inventory. Saved public metadata supports the 70-tool inventory; it is not a data-delivery benchmark.

"""

# Stable unique source index. Word can number repeated native notes separately;
# the dedicated PDF exporter preserves this index instead of those repeat numbers.
for i,key in enumerate(used,1):
    title,url=SOURCES[key]
    md += f'{i}. [{title}]({url}).\n'
md+='\n'
for i,key in enumerate(used,1):
    title,url=SOURCES[key]
    md+=f'[^s{i}]: {title}. {url} (accessed 9 September 2026).\n'
(DOCS/'finance-tools.md').write_text('\n'.join(line.rstrip() for line in md.splitlines())+'\n')

# Machine-readable inventory with all requested per-tool factors and costs.
fields=['id','block','provider','endpoint','displayName','description','coverage','dataClass','accuracyAssessment','freshnessAssessment','responseSpeed','relevance','officialStatus','licenceStatus','safetyAssessment','adoption','targetUsers','platformFit','limitation','feedProfile','override10','override100','researchCalls10','researchCalls100','feedCalls10','feedCalls100','researchCost10','researchCost100','feedCost10','feedCost100','sourceUrl']
with (DOCS/'inventories/finance-tools.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=['usdPerCall']+fields);w.writeheader()
    for r in ROWS: w.writerow({'usdPerCall':price(r),**{k:r[k] for k in fields}})
(EVIDENCE/'costed-tools.json').write_text(json.dumps(ROWS,indent=2,ensure_ascii=False)+'\n')

# Workbook: cached formula results keep default costs visible before Excel recalculates.
wb=xlsxwriter.Workbook(str(DOCS/'reports/Monid-Finance-Tools-Report.xlsx'))
wb.set_properties({'title':'Monid Finance Tools: Coverage, Quality and Integration Costs','comments':'Public evidence and editable scenario estimates, not confirmed commercial quotes.'})
wb.set_calc_mode('auto')
fmt={
 'title':wb.add_format({'font_size':19,'bold':True,'font_color':'#171717','text_wrap':True,'valign':'top'}),
 'head':wb.add_format({'bold':True,'bg_color':'#242424','font_color':'white','text_wrap':True,'valign':'top','border':1}),
 'text':wb.add_format({'text_wrap':True,'valign':'top','font_size':10}),
 'input':wb.add_format({'bg_color':'#EAF2F8','font_color':'#174B75','num_format':'0.00','valign':'top'}),
 'inputint':wb.add_format({'bg_color':'#EAF2F8','font_color':'#174B75','num_format':'0','valign':'top'}),
 'pct':wb.add_format({'bg_color':'#EAF2F8','font_color':'#174B75','num_format':'0%','valign':'top'}),
 'money':wb.add_format({'num_format':'$#,##0.00','valign':'top'}),
 'price':wb.add_format({'num_format':'$0.0000','bg_color':'#EAF2F8','font_color':'#174B75','valign':'top'}),
 'num':wb.add_format({'num_format':'#,##0.00','valign':'top'}),
 'int':wb.add_format({'num_format':'#,##0','valign':'top'}),
 'link':wb.add_format({'font_color':'#174B75','underline':1,'text_wrap':True,'valign':'top'}),
}
def sheet(name,headers,widths):
    ws=wb.add_worksheet(name);ws.hide_gridlines(2);ws.freeze_panes(1,2)
    ws.set_default_row(30);ws.set_row(0,38)
    ws.write_row(0,0,headers,fmt['head'])
    for i,width in enumerate(widths):ws.set_column(i,i,width)
    ws.set_landscape();ws.fit_to_pages(1,0);ws.repeat_rows(0)
    ws.set_footer('&LMonid finance assessment&RPage &P of &N')
    return ws
def comment(ws,row,col,keys,extra=''):
    urls=[SOURCES[k][1] for k in keys]
    ws.write_comment(row,col,extra+'\n'+'\n'.join(urls),{'author':'Source evidence','x_scale':2,'y_scale':2})

read=wb.add_worksheet('Read me');read.hide_gridlines(2);read.set_column('A:A',4);read.set_column('B:B',27);read.set_column('C:H',16)
read.merge_range('B2:H3','Monid Finance Tools',fmt['title'])
notes=[
 ('Scope','70 retrievable finance tools; 71 advertised. Company/market/news: 55. Insider/ownership: 15. Snapshot 9 September 2026.'),
 ('Start here','Company tools and Insider tools contain the complete inventory. Provider evidence supplies inherited coverage, provenance, rights and audience. Sources contains primary links.'),
 ('Cost controls','Edit blue cells in Assumptions and Costs. Profiles are formulas tied to assumptions. Costs shows occasional research and shared regular feeds for 10 and 100 users.'),
 ('Selected budget','Set Include = 1 for tools you actually want. Default selected budget is zero. Reference totals enable all 70 overlapping tools and are NOT recommended bundles.'),
 ('Coverage','Website ticker/profile counts do not prove Monid company coverage. Every exact per-tool supported-company count remains unverified.'),
 ('Permission','No customer-display/storage grant established for these Monid connectors. Paying call charges does not establish news-body/image rights or publisher subscription access.'),
 ('Freshness','No paid endpoint benchmark, measured error rate or confirmed real-time delivery SLA. SECForm4 public delay does not prove the tier Monid uses.'),
 ('Scenario limits','One page and one entity per call, no retries by default. Fees exclude licences, tax, infrastructure, AI processing and backfill. Changing scopes/intervals is not proof of API capacity.'),
 ('Recalculation','Formula cells include cached default results. Excel recalculates when opened/edited. Do not treat saved default results as updated after modifying the file with a non-calculating library.'),
]
for i,(label,body) in enumerate(notes):
    row=4+i*3;read.write(row,1,label,fmt['head']);read.merge_range(row,2,row+1,7,body,fmt['text']);read.set_row(row,28)
read.freeze_panes(4,0)

ass=sheet('Assumptions',['Assumption','Editable value','Meaning / limitation'],[39,19,108])
for i,(name,value,note) in enumerate(ASSUMPTIONS,1):
    ass.write(i,0,name,fmt['text']);ass.write(i,1,value,fmt['pct'] if name in ['Unique-union ratio','Lookup cache-miss fraction'] else fmt['input']);ass.write(i,2,note,fmt['text'])
    ass.write_comment(i,1,'Analyst-defined scenario assumption, not vendor performance or entitlement. '+note)
    ass.data_validation(i,1,i,1,{'validate':'decimal','criteria':'between','minimum':0.01 if 'interval' in name.lower() else 0,'maximum':1 if 'ratio' in name.lower() or 'fraction' in name.lower() else 1000000})
    ass.set_row(i,34)

prof=sheet('Profiles',['Profile key','Proposed cadence','Scope','Polls / key / month'],[23,65,13,22])
profile_rows={}
for i,(key,(label,scope,formula,value)) in enumerate(PROFILES.items(),1):
    profile_rows[key]=i+1;prof.write_row(i,0,[key,label,scope],fmt['text']);prof.write_formula(i,3,formula,fmt['num'],value)
    prof.write_comment(i,3,'Planning cadence only; not proof of freshness, completeness, rate allowance or licensed caching.')

invfields=[('id','ID',8),('provider','Provider',18),('endpoint','Endpoint',39),('description','What it provides',44),('coverage','Company coverage',51),('accuracyAssessment','Accuracy assessment',53),('freshnessAssessment','Freshness / real time',54),('responseSpeed','Response speed',40),('relevance','MVP relevance',25),('platformFit','Possible platform feature',47),('limitation','Specific limitations',65),('officialStatus','Official source status',43),('licenceStatus','Permissions',43),('safetyAssessment','Operational safety',56),('adoption','Confirmed users',40),('targetUsers','Intended users (assessment)',43),('sourceUrl','Exact catalogue source',48)]
for block,name in [(1,'Company tools'),(2,'Insider tools')]:
    ws=sheet(name,[x[1] for x in invfields],[x[2] for x in invfields])
    selected=[r for r in ROWS if r['block']==block]
    for i,r in enumerate(selected,1):
        for j,(field,_,_) in enumerate(invfields):
            if field=='sourceUrl':ws.write_url(i,j,r[field],fmt['link'],'Metadata: '+r['id'])
            else:ws.write(i,j,r[field],fmt['text'])
        ws.set_row(i,100)
        ws.write_comment(i,2,'Catalogue name/path verified; exact paid Monid schema not tested.\n'+r['sourceUrl'])
        comment(ws,i,4,PROVIDERS[r['provider']]['refs'][:2],'See Provider evidence for coverage qualifications. No exact Monid count established.')
        comment(ws,i,10,[k for k in PROVIDERS[r['provider']]['refs'] if k.startswith('parse') or k in ['llamaschema','sfcompany','sfsignificant']],r['sourceUrl']+'\nEndpoint-specific analysis; compare provider evidence and report citations.')
        comment(ws,i,12,PROVIDERS[r['provider']]['refs'],'Provider rights are NOT a confirmed pass-through agreement for this connector.')
    ws.autofilter(0,0,len(selected),len(invfields)-1)

pv=sheet('Provider evidence',['Code','Provider','Tools','Coverage','Official provenance','Accuracy / quality','Upstream freshness','Permissions / suitability','Audience and adoption distinction','Recommendation','Source URLs'],[8,23,9,67,67,56,66,72,66,55,70])
for i,(key,p) in enumerate(PROVIDERS.items(),1):
    pv.write_row(i,0,[p['code'],p['name'],p['count'],p['coverage'],p['source'],p['quality'],p['timing'],p['rights'],p['audience'],p['decision'],'\n'.join(SOURCES[k][1] for k in p['refs'])],fmt['text']);pv.set_row(i,155)
    for col in range(3,10):comment(pv,i,col,p['refs'])
pv.autofilter(0,0,len(PROVIDERS),10)

headers=['ID','Provider','Endpoint','Scope','Profile','USD / call','Include? 0/1','Keys override: 10','Keys override: 100','Entities / call','Pages / poll or lookup','Retry overhead','Polls / key / month','Effective keys: 10','Effective keys: 100','Research calls: 10','Research calls: 100','Research USD: 10','Research USD: 100','Feed calls: 10','Feed calls: 100','Feed USD: 10','Feed USD: 100','Scope / caveat','Metadata']
cs=sheet('Costs',headers,[8,20,39,12,22,15,13,17,18,16,20,16,20,18,19,20,21,20,21,21,22,20,21,68,42])
cs.freeze_panes(1,3)
for i,r in enumerate(ROWS,1):
    row=i+1;scope=PROFILES[r['feedProfile']][1];profrow=profile_rows[r['feedProfile']]
    cs.write_row(i,0,[r['id'],r['provider'],r['endpoint'],scope,r['feedProfile']],fmt['text'])
    cs.write(i,5,price(r),fmt['price']);cs.write(i,6,0,fmt['inputint']);cs.write(i,7,r['override10'],fmt['inputint']);cs.write(i,8,r['override100'],fmt['inputint']);cs.write(i,9,1,fmt['inputint']);cs.write(i,10,1,fmt['inputint']);cs.write(i,11,0,fmt['pct'])
    cs.write_formula(i,12,f'=Profiles!D{profrow}',fmt['num'],PROFILES[r['feedProfile']][3])
    for col,users,assrow,overridecol in [(13,10,2,'H'),(14,100,3,'I')]:
        formula=f'=IF({overridecol}{row}>0,{overridecol}{row},IF(D{row}="entity",MAX(Assumptions!$B$7,ROUNDUP(Assumptions!$B${assrow}*Assumptions!$B$7*Assumptions!$B$8,0)),1))'
        cs.write_formula(i,col,formula,fmt['int'],r[f'keys{users}'])
    for col,users,assrow in [(15,10,2),(16,100,3)]:
        formula=f'=ROUNDUP(Assumptions!$B${assrow}*Assumptions!$B$4*Assumptions!$B$5/J{row},0)*K{row}*(1+L{row})'
        cs.write_formula(i,col,formula,fmt['num'],r[f'researchCalls{users}'])
    cs.write_formula(i,17,f'=P{row}*F{row}',fmt['money'],r['researchCost10']);cs.write_formula(i,18,f'=Q{row}*F{row}',fmt['money'],r['researchCost100'])
    for col,users,keycol,researchcol in [(19,10,'N','P'),(20,100,'O','Q')]:
        formula=f'=IF(D{row}="demand",{researchcol}{row}*Assumptions!$B$17,ROUNDUP({keycol}{row}/J{row},0)*M{row}*K{row}*(1+L{row}))'
        cs.write_formula(i,col,formula,fmt['num'],r[f'feedCalls{users}'])
    cs.write_formula(i,21,f'=T{row}*F{row}',fmt['money'],r['feedCost10']);cs.write_formula(i,22,f'=U{row}*F{row}',fmt['money'],r['feedCost100'])
    scope_note='One page/query assumed; full coverage and pagination unverified. ' + (f'Fixed optional universe of {r["override10"]} keys in both scenarios.' if r['override10'] else 'Shared union of followed keys for entity tools; one shared list for global tools.')
    cs.write(i,23,scope_note,fmt['text']);cs.write_url(i,24,r['sourceUrl'],fmt['link'],'Catalogue price/source')
    cs.write_comment(i,5,'USD PER_CALL catalogue value captured 9 September 2026. No extra markup assumed; applicable licence/tax/commitments unknown.\n'+r['sourceUrl'])
    cs.write_comment(i,9,'Increase only if Monid supports this batch size and charges one call for it. Research formula assumes eligible lookups can be batched; separate interactive requests may not be batchable.')
    cs.write_comment(i,10,'Each page is assumed separately billable. Confirm actual pagination and billing; no pagination may mean permanent incompleteness, not just extra cost.')
    cs.write_comment(i,11,'Expected additional billable attempts as a fraction. Confirm whether failures/retries are charged; default zero is not a reliability claim.')
    cs.data_validation(i,6,i,6,{'validate':'integer','criteria':'between','minimum':0,'maximum':1})
    cs.data_validation(i,7,i,8,{'validate':'integer','criteria':'between','minimum':0,'maximum':1000000})
    cs.data_validation(i,9,i,10,{'validate':'integer','criteria':'between','minimum':1,'maximum':100000})
    cs.data_validation(i,11,i,11,{'validate':'decimal','criteria':'between','minimum':0,'maximum':10})
    cs.set_row(i,62)
cs.autofilter(0,0,len(ROWS),len(headers)-1)
for offset,label,selected in [(2,'ALL 70: redundant reference total',False),(3,'SELECTED tools only: edit Include',True)]:
    i=len(ROWS)+offset;cs.merge_range(i,0,i,4,label,fmt['head'])
    for col,letter,key in [(17,'R','researchCost10'),(18,'S','researchCost100'),(21,'V','feedCost10'),(22,'W','feedCost100')]:
        formula=f'=SUMPRODUCT(G2:G71,{letter}2:{letter}71)' if selected else f'=SUM({letter}2:{letter}71)'
        cs.write_formula(i,col,formula,fmt['money'],0 if selected else sum(r[key] for r in ROWS))

summ=sheet('Budget summary',['Family / scenario','Tools','Research USD: 10','Research USD: 100','Feed USD: 10','Feed USD: 100','Interpretation'],[28,10,23,24,23,24,90])
for i,(key,p) in enumerate(PROVIDERS.items(),1):
    group=[r for r in ROWS if r['provider']==key]
    summ.write_row(i,0,[p['name'],len(group)],fmt['text'])
    for col,costcol,costkey in [(2,'R','researchCost10'),(3,'S','researchCost100'),(4,'V','feedCost10'),(5,'W','feedCost100')]:
        summ.write_formula(i,col,f'=SUMIF(Costs!$B$2:$B$71,"{key}",Costs!${costcol}$2:${costcol}$71)',fmt['money'],sum(r[costkey] for r in group))
    summ.write(i,6,'Enables all tools in this family, including alternatives and optional assets. Research actions call each family tool. Not a proposed bundle.',fmt['text']);summ.set_row(i,45)
for i,label,sel in [(9,'All 70 reference',False),(10,'Selected tools',True)]:
    summ.write(i,0,label,fmt['head'])
    for col,costcol,key in [(2,'R','researchCost10'),(3,'S','researchCost100'),(4,'V','feedCost10'),(5,'W','feedCost100')]:
        formula=f'=SUMPRODUCT(Costs!$G$2:$G$71,Costs!${costcol}$2:${costcol}$71)' if sel else f'=SUM(Costs!${costcol}$2:${costcol}$71)'
        summ.write_formula(i,col,formula,fmt['money'],0 if sel else sum(r[key] for r in ROWS))
    summ.write(i,6,'Edit Include on Costs to build a non-overlapping selection.' if sel else 'Mechanical sum, NOT a recommendation or commercial quote.',fmt['text'])
summ.write(13,0,'Scale: query keys',fmt['head']);summ.write_row(13,1,['USD/call','Daily USD','Hourly news USD','5-min market USD'],fmt['head'])
for i,n in enumerate([1515,10000,50000],14):
    summ.write(i,0,n,fmt['inputint']);summ.write(i,1,.01,fmt['price']);row=i+1
    for col,formula,val in [(2,f'=A{row}*B{row}*Profiles!D{profile_rows["entity_daily"]}',n*.01*30),(3,f'=A{row}*B{row}*Profiles!D{profile_rows["entity_news"]}',n*.01*480),(4,f'=A{row}*B{row}*Profiles!D{profile_rows["entity_market"]}',n*.01*1716)]:summ.write_formula(i,col,formula,fmt['money'],val)
    summ.write(i,6,'One entity/call and one page. Company universe coverage and request throughput NOT established.',fmt['text'])

sw=sheet('Sources',['Source ID','Title / supports','Primary URL','Evidence boundary'],[14,80,110,85])
for i,key in enumerate(used,1):
    title,url=SOURCES[key];sw.write_row(i,0,[f'S{i}',title],fmt['text']);sw.write_url(i,2,url,fmt['link'],url)
    boundary='Operator statement about its own independent wrapper; Monid relationship unverified.' if key.startswith('parse-') else 'Official publisher/operator/regulator source; scope-specific statements do not establish Monid delivery or downstream permission.'
    sw.write(i,3,boundary,fmt['text']);sw.set_row(i,44)
sw.autofilter(0,0,len(used),3)
wb.close()

manifest={'date':'2026-09-09','advertisedTools':71,'retrievedTools':70,'block1':55,'block2':15,'sourcesCited':len(used),'paidExecutions':0,'integratedProviders':0,'totalsReferenceOnly':{k:round(sum(r[k] for r in ROWS),2) for k in ['researchCost10','researchCost100','feedCost10','feedCost100']},'sourceOrder':used}
(EVIDENCE/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
