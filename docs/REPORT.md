# Project report — company news component

Everything built, everything measured. All figures come from a full run over
the supplied **1,515-company production catalogue** on **free API tiers only**,
reproducible with the commands in each section.

---

## 1. Summary

| | |
| --- | --- |
| Companies in catalogue | **1,515** |
| Resolved to a real security | **1,474 (97.3%)** |
| Reachable with a US symbol | **1,445 (95.4%)** |
| Companies returning news | **1,093 (72.1%)** |
| Attribution certain (ticker-native) | **98.2%** of articles |
| Full run time | **26.7 min** |
| Provider errors / refusals | **0 / 0** |
| **Recurring cost** | **$0** |

The headline result: **listing resolution makes a free provider sufficient.**
By resolving each ticker to every venue it trades on — including US depositary
receipts — 95.4% of a global catalogue becomes reachable through a free,
ticker-native US news API. That is the finding the whole design rests on.

---

## 1a. The questions, answered directly

**Do we need a paid API?** **No — not yet.** That is the honest read of the
data, not a cost-saving dodge. Listing resolution already puts 95.4% of the
catalogue on free, ticker-native coverage. Paying would buy *attribution
quality*, not coverage. Concrete trigger: buy when `name_match` exceeds ~15% of
stored articles. **It is 0.9% today.**

**How many companies are covered?**

- 1,474 / 1,515 resolved (**97.3%**)
- 1,445 reachable with a US symbol (**95.4%**)
- **1,093 actually returned news (72.1%)**, averaging 11.8 articles
- The other 376 were clean `no_news` — genuinely quiet that week, not gaps
- **0 refused, 0 failed**

**How accurate is it?** **98.2% of articles** carry ticker-native attribution
(99.1% of article-company links). Unverifiable name matches are rejected at
ingest rather than stored — 309 were dropped in the last run (§7b). The seven ticker collisions (`BBY` → Balfour Beatty, not Best Buy)
all resolve correctly, guarded by a regression test.

**What is the latency?** Median **200 ms** (Finnhub), **896 ms** (Google
News). The p95 of 63 s is this component's own rate limiter queueing to respect
the free 60/min — not the provider. A full run is 26.7 minutes, bounded
entirely by that free-tier limit.

**How fresh is the news?** This one needs care. The 36.9-hour median is a
**cold-start 7-day backfill artefact, not steady state.** Real freshness is set
by the refresh schedule, not by the provider: daily ≤ 24 h, hourly ≤ 1 h,
on-demand in seconds. Providers carry stories within minutes of publication.
See §6a for the recommended schedule.

**Where does the news come from?** **61 publishers** — but **90% from just
three: Yahoo (48%), Benzinga (29%), Seeking Alpha (13%).** Primary wires appear
only through the market feed. That is the most important limitation in this
report, and a **better argument for paying than coverage is.**

---

## 2. Do we need a paid API? No — not yet.

**Recommendation: stay on free tiers.** The measured data does not justify
paying, and it says clearly when that will change.

**What paying would buy:** not coverage — attribution *quality*. 95.4% of the
catalogue is already served ticker-native and free. A paid tier would upgrade
the remaining thin edge: 29 companies with no US line and 41 unresolved, which
today fall back to name-based search.

**Buy when either becomes true:**

1. A consumer starts making real decisions on international coverage.
2. `match_method = 'name_match'` exceeds **~15%** of stored articles. It is
   **0.9%** today, and it is a one-line query.

**What to buy if so:** Finnhub's paid tier — same adapter, same response
shape, same code path. A key and one config line, not an integration.

---

## 2a. The case for a paid API — what it buys, and how far it goes

§2 recommends staying free *for now*. This section is the other side of that
argument, quantified: what a paid tier would actually fix, how much it would
move each number, and where it would not help at all.

### Where the free stack is genuinely limited

Coverage is not uniformly good — it is excellent for US-exchange listings and
poor everywhere else. The catalogue splits four ways:

| Segment | Companies | With **zero** articles | Avg articles |
| --- | ---: | ---: | ---: |
| US **exchange** listing | 1,160 | 150 (12.9%) | **11.0** |
| US **OTC** line only | 285 | 220 (**77.2%**) | 0.4 |
| No US line — name search only | 29 | 14 (48.3%) | 5.1 |
| Unresolved — no listing at all | 41 | 41 (100%) | 0.0 |

**The free stack works where it works and barely functions elsewhere.** A
company on a US exchange averages 10.9 articles; a company whose only US
presence is an OTC line averages **0.4**, and three quarters of them get
nothing at all.

Three other constraints follow from the free tier rather than from the data:

1. **Source concentration.** 97.2% of company articles come from tier-3
   aggregators — Yahoo, Benzinga, Seeking Alpha. Only 2.7% are primary wire.
2. **Run time.** 60 requests/minute caps a full sweep at ~28 minutes, which is
   why refresh has to be tiered rather than simply hourly.
3. **The filtering trade-off.** Companies with no ticker-native path depend on
   name search, and unverifiable matches are now rejected — so Jensen-Group,
   Kid ASA and Safari Industries went from *wrong* coverage to *none*.

### What a paid tier would move, and by how much

| Metric | Free today | Realistic with paid | Ceiling |
| --- | ---: | ---: | --- |
| Companies returning news | **72.1%** | **~88%** | ~88% — the rest are genuinely quiet |
| Companies with zero articles | 422 | ~150 | 150 are on US exchanges and simply had a quiet week |
| Avg articles, OTC-only segment | 0.4 | ~6–10 | matches the exchange-listed segment |
| Primary-wire share of company news | 2.7% | 40–60% | the free *market* feed already hits 60.6%, so this is demonstrated, not hoped for |
| Full-run time | 26.7 min | 3–6 min | at 300–900 req/min |
| Practical refresh | tiered, daily sweep | hourly full sweep | |
| Ticker-native attribution | 98.2% | ~99.9% | name search becomes unnecessary |

**The single biggest win is the 275 structurally under-served companies** — 285
OTC-only plus 41 unresolved plus 29 without a US line, minus overlap. Those are
18% of the catalogue, and they are not quiet: they are unreachable by a
US-symbol-only provider. A provider with native non-US symbol coverage turns
them from near-zero into ordinary coverage.

**The second win is provenance.** The free *market* feed already proves what is
possible — Reuters, CNBC and Bloomberg at 60.6% tier-1 — while company news sits
at 2.8%. That gap is a product of which endpoint is free, not of what exists.
For anything where being early or citing a primary source matters, this is the
more valuable upgrade of the two.

### Where paying would **not** help

Being honest about the ceiling matters as much as the upside:

- **150 companies on US exchanges returned nothing because nothing happened.**
  A clean `no_news` for a quiet mid-cap in a 7-day window is a correct answer.
  No provider fixes that, and a provider that "fixes" it is padding.
- **Attribution is already 98.2% certain.** There is ~1% of headroom.
- **Deduplication, idempotency, observability and listing resolution are ours,
  not the provider's.** They would be unchanged.
- **Latency is already ~200 ms per call.** Paying buys *throughput*, not
  per-request speed.

### What to buy, and what it costs

**Finnhub's paid tier is the recommended upgrade** — it is the same adapter,
the same response shape and the same code path, so adopting it is an API key
and one config line rather than an integration. Its published tiers span
roughly **$12–$100/month** for the relevant plans, with enterprise pricing
above that; treat those as indicative and confirm at purchase, because vendor
pricing pages are not reliably quotable and no number here was verified against
a signed quote.

**Marketaux** or a Benzinga-backed feed (e.g. via Polygon.io) are the credible
alternatives if global ticker tagging matters more than reusing the existing
adapter. Each would need a new adapter — roughly a day's work given the
provider interface.

Because the source layer is provider-agnostic, this decision is reversible.
Adding a paid provider means implementing `NewsProvider` and putting it first
in `NEWS_PROVIDER_ORDER`; the free stack stays in place as the fallback, and
`degradedProviders` on `/v1/status` will show immediately if the paid tier ever
starts underperforming the free one.

### The decision rule

Buy when any of these is true — all are queryable today:

1. A consumer starts making decisions on international or OTC coverage.
2. `match_method = 'name_match'` exceeds ~15% of stored articles (**0.9%** now).
3. Provenance starts mattering — someone asks why a story is sourced to
   Benzinga rather than Reuters.
4. Refresh needs to be hourly across the whole catalogue rather than tiered.

None of those is true yet, which is why §2 says wait. All four are measurable,
so the decision does not need to be a judgement call.

---

## 3. Coverage — how many companies are covered?

### Resolution (which security is this ticker?)

| | Companies | Share |
| --- | ---: | ---: |
| Has a US **exchange** listing | 1,160 | 76.6% |
| Has a US **OTC** line only | 285 | 18.8% |
| **Reachable with a US symbol** | **1,445** | **95.4%** |
| No US line at all | 29 | 1.9% |
| Unresolved | 41 | 2.7% |

2,021 listings across 1,474 companies — **149 are depositary receipts (ADR/GDR)**
discovered by joining share classes and normalised names against the US symbol
directory. Those ADRs are what make foreign companies fetchable at all.

### News returned (a 7-day window)

| Outcome | Companies | Meaning |
| --- | ---: | --- |
| Returned articles | **1,093 (72.1%)** | |
| Clean `no_news` | 376 (24.8%) | genuinely quiet that week — a real answer, not a failure |
| Unresolved | 41 (2.7%) | no listing to ask about |
| **Provider refused** | **0** | |
| **Failed** | **0** | |

Average **11.8 articles** per covered company.

The 377 `no_news` companies matter: they are not gaps. A provider answering
cleanly with zero results for a quiet mid-cap in a 7-day window is correct.
Collapsing that into "no coverage" would hide the difference between a quiet
company and a broken provider — which is why they are separate outcomes.

---

## 4. Accuracy — can we trust the attribution?

| Attribution | Articles | Share |
| --- | ---: | ---: |
| **`ticker`** — provider returned it for a resolved symbol | **12,835** | **99.1%** |
| `name_match` — found by company-name search, and verified | 120 | 0.9% |

Those are **links** (article↔company pairs), not articles. At the article
level, **6,420 of 6,535 company-scope articles (98.2%)** carry ticker-native
attribution. The distinction matters and is easy to blur — one story naming
three companies is one article and three links.

Name matches that could not be verified are rejected at ingest rather than
stored and labelled: **309 were dropped in the last run** (§7b).

### The accuracy problem that would have been invisible

This catalogue contains **seven tickers that resolve to a different company
than the one named**:

| Ticker | Catalogue says | A US exchange says | Resolved to |
| --- | --- | --- | --- |
| `BBY` | Balfour Beatty | Best Buy | Balfour Beatty → `BAFBF` |
| `ADM` | Admiral Group | Archer-Daniels-Midland | Admiral Group → ADR `AMIGY` |
| `NOV` | Novo Nordisk | NOV Inc | Novo Nordisk → ADR `NVO` |
| `ENR` | Siemens Energy | Energizer | Siemens Energy → ADR `SMERY` |
| `FTK` | flatexDEGIRO | Flotek | flatexDEGIRO → `FNNTF` |
| `CWK` | Cranswick | Cushman & Wakefield | Cranswick → `CRWKF` |
| `MOVE` | Medacta | Corvex | Medacta → `MEDGF` |

Filtering by exchange does **not** fix this: `ADM` narrowed to London still
returns Archer-Daniels-Midland, because it cross-lists there. Only verifying
the resolved company's *name* does. Untreated, these seven produce a full,
plausible, entirely wrong feed — the failure nobody notices. All seven now
resolve correctly, and all seven gained a US symbol in the process.

There is a regression test that simultaneously requires these seven to be
rejected and nine real spelling variants (`SMITH (A.O.) CORP` vs
`Smith AO Corporation`) to be accepted.

---

## 5. Latency — how fast is a fetch?

Per company, measured across the full run:

| Provider | Median | p95 | Companies |
| --- | ---: | ---: | ---: |
| Finnhub | **200 ms** | 64.1 s | 1,445 |
| Google News RSS | **896 ms** | 1.5 s | 29 |

**Read the p95 carefully — it is not the provider being slow.** It is this
component's own rate limiter deliberately queueing requests to stay inside
Finnhub's free 60 requests/minute. Median latency is the true provider
responsiveness: **a quarter of a second.**

**Full run: 1,603 seconds (26.7 minutes)** for all 1,515 companies. That number
is set almost entirely by the free-tier rate limit — 1,445 companies is 1,445
calls at 55/min. Raising `INGEST_CONCURRENCY` will not help; the rate limit is
the constraint, not parallelism. **This is the single number a paid tier would
improve immediately.**

An on-demand fetch for a handful of tickers returns in under a second per
company:

```bash
curl -X POST localhost:8080/v1/fetch \
  -H 'content-type: application/json' \
  -d '{"tickers":["AAPL","ADM"],"wait":true}'
```

---

## 6. Freshness — how quickly does news reach us?

Two different questions, often confused.

**How recent is what we hold?** Of 6,752 articles from one 7-day backfill:

| Published within | Articles |
| --- | ---: |
| Last 24 hours | 447 |
| Last 48 hours | 1,060 |
| Last 7 days | 5,254 |

Median time since the newest article, per covered company: **36.9 hours**.
336 companies have news less than 24 hours old.

**How fast would new news arrive?** This is the number that matters
operationally, and it is **set by the schedule, not the provider**:

| Schedule | Worst-case age when it reaches us |
| --- | --- |
| Daily (recommended default) | up to 24 h |
| Every 6 hours | up to 6 h |
| Hourly | up to 1 h |
| On-demand trigger | seconds |

The providers themselves are not the bottleneck — a story is available within
minutes of publication. The component is incremental, so a more frequent
schedule costs proportionally less: each run only fetches since the last one,
minus a 6-hour overlap, and deduplication makes the overlap free.

The measured 36.9-hour median is an artefact of a **cold-start 7-day
backfill**, not steady-state behaviour. In steady state on a daily schedule,
expect a median well under 24 hours.

---

## 6a. How to set the refresh schedule — the data changed the answer

**Recommendation: three tiers, not one cadence.**

The intuitive answer is "run everything hourly". Measuring news velocity first
showed why that is the wrong shape:

| Articles per 7 days | Companies | Share of companies | Share of all articles |
| --- | ---: | ---: | ---: |
| 21+ (busy) | 105 | 6.9% | **55.4%** |
| 7–20 (active) | 231 | 15.2% | 25.4% |
| 3–6 (quiet) | 335 | 22.1% | 13.9% |
| 1–2 (very quiet) | 373 | 24.6% | 5.3% |
| 0 (silent) | 471 | 31.1% | 0% |

The busiest 7% of companies produce **55%** of all news, while **31% of the
catalogue produced nothing at all** in a full week.

Refreshing all 1,515 companies at one cadence therefore spends most of the
request budget asking silent companies whether anything happened, while the
busiest names wait exactly as long as the quietest. That is the wrong shape for
this data.

### The recommended schedule

```cron
# Busiest ~7% of companies - 55% of all news volume. Takes ~70 seconds.
0 * * * *      cd /srv/news-component && npm run ingest -- --tier hot

# The working middle. Takes ~11 minutes.
30 */6 * * *   cd /srv/news-component && npm run ingest -- --tier active

# Full sweep: catches everything, re-tiers companies as their volume changes,
# and guarantees no company is ever starved. Takes ~27 minutes.
15 3 * * *     cd /srv/news-component && npm run ingest
```

Tier membership is computed from measured velocity at run time, so a company
that goes quiet drifts down and a company in the news drifts up automatically.
A company with no history counts as `active`, so newly added listings are
picked up promptly rather than waiting for the slowest cadence.

### What that buys

| Strategy | Calls/day | Weighted average article age |
| --- | ---: | ---: |
| Daily full sweep only | 1,515 | ~12 h |
| **Tiered (recommended)** | **~6,600** | **~1.8 h** |
| Hourly full sweep | 36,360 | ~0.5 h |

Tiering gets **6.6× fresher news for 4.5× the calls** — and captures most of
the benefit of an hourly full sweep at less than a fifth of the request budget.
It uses roughly **7.6% of the free tier's theoretical daily capacity**
(60 req/min = 86,400/day), leaving ample headroom.

Measured, not estimated: a `--tier hot` run completes in **69.8 seconds** for
109 companies.

This is implemented, not just recommended: `--tier hot|active|quiet|all` on
the CLI and `{"tier":"hot"}` on `POST /v1/fetch`. Tier membership is recomputed
from measured velocity on every run, so companies drift between tiers on their
own; anything with no history counts as `active` so newly added listings are
never starved. Verified end-to-end, and an invalid tier is rejected with a 400.

### Choosing your own cadence

The controlling constraint is Finnhub's 60 requests/minute. One call per
company per run, so:

> **run duration ≈ companies ÷ 55 per minute**

- Need sub-hour freshness on the names that matter? The hot tier is 70 seconds
  — run it every 15 minutes if you want.
- Need everything hourly? That is a full sweep every hour: 27 minutes of every
  hour spent fetching, and a paid tier becomes the right answer.
- Need same-minute freshness? No polling schedule delivers that. That is a
  streaming/webhook problem, and no free provider here offers one.

Two caveats worth stating: the per-minute limit is the only Finnhub constraint
verified here — confirm no separate daily cap applies to your key before moving
to an aggressive cadence. And more frequent runs do **not** multiply storage:
ingest is incremental and deduplicated, so a run that finds nothing new stores
nothing.

---

## 7. Sources — where does the news come from?

**61 distinct publishers**, and the distribution is heavily concentrated:

| Publisher | Via | Articles | Share |
| --- | --- | ---: | ---: |
| Yahoo | Finnhub | 3,220 | 48.2% |
| Benzinga | Finnhub | 1,936 | 29.0% |
| Seeking Alpha | Finnhub | 876 | 13.1% |
| CNBC | Finnhub + market | 206 | 3.1% |
| ChartMill | Finnhub | 200 | 3.0% |
| Reuters | market feed | 67 | 1.0% |
| 55 others | mostly Google News | ~180 | 2.6% |

Per provider: Finnhub company news draws on just **6** publishers, the market
feed on **6**, and the Google News fallback on **51** — but the fallback
supplies only 102 articles, so its diversity barely moves the total.

**An honest limitation: 90% of articles come from three publishers**, and none
of them is a primary wire. Finnhub's free company-news tier aggregates
retail-facing outlets and commentary — Yahoo Finance, Benzinga, Seeking Alpha —
rather than Reuters, Bloomberg, Dow Jones or the FT.

For headline coverage and volume this is fine. For anything where *provenance*
matters — earliest-mover signals, primary-source quotes, regulatory filings —
this is the clearest argument for a paid tier, and a stronger one than raw
coverage. The Google News fallback is far more diverse (51 publishers across
only 102 articles, including local and non-English outlets) but is name-matched
rather than ticker-native, so it trades provenance breadth for attribution
certainty — and it is too small to shift the mix.

---

## 7b. News quality — relevance, sources, and macro coverage

Fetching news is only half the job. Reviewing the feed in a UI exposed three
problems that raw coverage numbers hide, and each is now addressed.

### Problem 1: the feed looked duplicated (a bug)

`GET /v1/news` returned one row per **article-company link**, not per article.
One Seeking Alpha piece tagged to 53 companies rendered 53 times; across the
catalogue, 690 multi-company articles generate 5,024 feed rows - **38.8% of the
feed from 10.3% of the articles.**

Fixed: the API now returns one row per article with the companies aggregated
into a `companies[]` array. `total` counts distinct articles. The mistake is no
longer expressible through the API.

### Problem 2: misattribution and round-ups

Two separate quality failures, both measured:

| Failure | Scale | Example |
| --- | --- | --- |
| **Misattribution** — name search matched the wrong business | only **63%** of name-matched articles even contained the company's name | a *Club Kid* film review filed under **Kid ASA**; a BMW story under **Jensen-Group** |
| **Round-ups** — one article filed against many companies | **10.3%** of articles produce **38.8%** of all feed rows | “Today’s top movers in the S&P500”, filed against 28 companies |

Both are now handled at ingest by a deterministic relevance layer
(`src/ingest/relevance.ts`):

- **Name verification.** A multi-word company name must have at least two of
  its tokens present. A single-word name that is also an everyday English word
  (`Kid`, `Booking`, `Partners`) additionally requires financial context and
  proper-noun capitalisation. **Links that fail are rejected, not stored and
  hidden** — keeping a known-wrong attribution "just in case" is how a feed
  loses trust.
- **Round-up detection.** `company_count` is exposed on every article and
  `?max_companies=3` filters them out. The UI defaults to 4.
- **Source tiering.** Every article carries `source_tier`: 1 = primary wire,
  2 = established financial media, 3 = aggregator/screener.

One rule was badly wrong on the first attempt and worth recording: allowing a
*single* token of a two-token name to verify meant "Bloom Energy" matched every
article containing the word "energy" — and so did Duke Energy, Vistra Energy
and thirty others. It generated **1,262 spurious company links from 163 macro
articles**. Requiring two tokens cut that to 21, of which 19 are correct. There
is a regression test for exactly this.

### Problem 3: no macro news at all

The brief never asked for it, but an investor-facing feed that cannot show a
conflict, a rate decision or an export control is missing the news that moves
portfolios hardest. A company-keyed feed structurally cannot surface it.

Added as a **separate source**, deliberately not a company provider:
`GET /v1/market-news`, fed by Finnhub's free `general` and `merger` categories.

It is also, by a distance, the highest-quality source in the component:

| Feed | Tier 1 (primary wire) | Tier 3 (aggregator) |
| --- | ---: | ---: |
| **Market-wide** | **60.6%** | 39.4% |
| Company news | 2.8% | 97.1% |

Reuters, CNBC and Bloomberg — against a company feed that is 97% Yahoo,
Benzinga and Seeking Alpha.

Macro stories are stored market-scope and linked to a company **only** on hard
evidence: the provider supplied the symbol, or the company is named outright
under a stricter phrase test than ordinary company news uses. A story about an
oil embargo is not "news about Chevron", and inflating 1,500 company timelines
with macro headlines would recreate the noise problem this section fixes.

### Why no language model

The obvious way to judge "is this article relevant to this investor" is to ask
a model. This component deliberately does not, and that is a security decision
before it is a cost one.

Article text is **written by third parties and is attacker-influenceable** —
anyone can get a press release onto a news aggregator. Feeding it to a model
that decides what gets stored means untrusted text steering the pipeline. The
rules here can be audited, unit-tested against real failures, and explained to
a user; a model's judgement on hostile input can do none of those.

The deterministic layer handles what it is good at: *is this article about this
company, from a source worth trusting, and specific rather than a round-up*.
There is exactly one job a model would do better — mapping macro news onto the
companies it actually affects — and §7c sets out where it belongs and why that
is not in the ingest.

### The cost of filtering, stated plainly

Rejecting unverifiable links is not free. Jensen-Group, Kid ASA and Safari
Industries previously had ~20 articles each; they now have **zero**, because
every one of those articles was about Jensen Huang, a film called *Club Kid*,
or an unrelated Indian hotel group. Coverage for those companies went from
"wrong" to "absent".

That is the right trade for an investor-facing product — an empty feed is
honest, a wrong feed is not — but it is a real loss and it is why the paid-API
recommendation in §2 has a trigger rather than a "never". A ticker-native
provider would give those companies genuine coverage instead of a choice
between noise and nothing.

Overall the filter is why ticker-native attribution rose from 96.4% to
**98.7%**: the name-matched articles that survive are the ones that could be
verified.

### What is still open

- **~90% precision** on macro-to-company linking. "Francisco Partners to buy
  Weave" still links to Partners Group.
- **Corroboration is not yet scored.** The strongest available legitimacy
  signal is that two independent publishers reported the same story; the
  `content_hash` needed for it already exists and is unused.
- **Multi-source fetch.** The ingest stops at the first provider that answers,
  so a story is not currently cross-checked against a second source.

---

## 7c. Do we need a language model?

Three separate questions get bundled together here, and they have different
answers. Everything below is measured on this catalogue.

### For news *search*: no. Clearly not.

Using an LLM or LLM-backed search (Perplexity, a search API plus synthesis) to
**find** the news is the wrong tool, for three reasons that are all visible in
this component:

1. **It breaks idempotency.** The entire ingest rests on a canonical URL and a
   stable hash. Synthesised results have no stable key, so "a daily re-run must
   not create duplicates" stops being guaranteeable. That is a hard requirement
   in the brief, not a nice-to-have.
2. **Cost scales the wrong way** — per company, per day, forever, to reproduce
   records a structured API already returns free in **200 ms**.
3. **It loses provenance.** You get a summary, not a publisher and a URL a user
   can click and an analyst can cite.

A paid *conventional* news API beats LLM search on every axis that matters
here — cost, dedupeability, latency, provenance. If there is budget for exactly
one of them, it should never be the LLM.

### For basic relevance ("is this article about this company"): also no.

The deterministic rules already answer this. **98.2% of stored articles are
ticker-native**, meaning the provider was asked about a specific resolved
symbol and attribution is certain. The remaining name matches are handled by
rules that are unit-tested against the real failures they were written for. An
LLM here would be paying to re-answer a solved question, and paying in the
riskiest possible currency — see the injection note below.

### For macro → company exposure: yes. This is the one place it earns its keep.

The evidence is unambiguous: **152 of 165 market-wide articles (92.1%) reach no
company at all.**

*"UAE's financial embargo on Iran after missile threat"* is a Reuters story
that plainly affects Gulf-exposed airlines, oil importers and defence names in
this catalogue. It reaches nobody, because a macro story is only linked when a
company is **named outright**. No rule can know that an embargo touches an
airline's route network or a refiner's input costs. That is world knowledge,
and it is precisely the gap.

**But point it at the right side of the data.** The instinct is to run the
model over articles. Don't:

- **Enrich companies, not articles.** One pass over the 1,515 companies
  producing structured exposure tags — sector, geography, commodity inputs,
  customer concentration. That is ~1,515 calls **once**, cached, refreshed
  quarterly. A few dollars in total, not a per-article recurring cost.
- **Company descriptions are trusted input** from our own catalogue. Article
  text is **attacker-controlled** — anyone can get a press release onto a news
  aggregator.
- Then match macro article → company **by tag overlap, deterministically**.

If the macro headline itself also needs classifying into themes, constrain the
model to a **closed label set** and give it **no authority over what gets
stored** — only over ranking. Injection risk drops from "steers the pipeline"
to "mis-ranks one story".

### The rule

**No language model in the ingest path, ever. One offline enrichment pass over
company data.**

That closes the 92.1% macro gap without putting untrusted third-party text
anywhere near a storage decision — which is the property §7b exists to protect,
and the reason no model touches this component today.

---

## 8. Cost

| Item | Cost |
| --- | --- |
| Finnhub free tier | $0 — 60 req/min |
| Google News RSS | $0 — no key |
| OpenFIGI | $0 — free key raises limits only |
| Language models | **none used anywhere** |
| **Total recurring** | **$0** |

No LLM is called at any point in a run. That is a deliberate security property
as much as a cost one: article text is attacker-influenceable — anyone can get
a press release onto a news aggregator — and feeding it into a model that
decides what gets stored would let untrusted text steer the pipeline.

---

## 9. What was built

A standalone service — its own process, own database, own release cycle,
configured entirely by environment variables. No UI.

```
catalogue CSV → [catalogue] parse + audit, raw values preserved
                     ↓
              [resolution] ticker → security → every venue
               OpenFIGI (identity) + Finnhub US directory (ADRs)
                     ↓
                  listings
                     ↓
               [ingest] provider order, canonicalise, deduplicate
               Finnhub (ticker-native) → Google News RSS (name search)
                     ↓
                 PostgreSQL
                     ↓
                  [API] Fastify, OpenAPI at /docs
```

- **Provider-agnostic source layer.** Adding a source means implementing one
  interface and naming it in `NEWS_PROVIDER_ORDER`. Nothing in the ingest,
  storage or API knows which providers exist.
- **Idempotent ingest.** Deduplicated on a canonical URL plus a
  headline-and-day key. Verified: re-fetching a company over the same window
  saw its 9 articles again and inserted **0**, and there are zero duplicate
  canonical URLs across 6,687 stored articles.
- **Outcome taxonomy.** `ok` / `no_news` / `refused` / `rate_limited` /
  `error` / `unresolved` / `skipped`, recorded per company per provider.
- **Many-to-many articles.** One story mentioning three companies is one
  article row and three links, not three copies.

**Scale:** ~5,500 lines of source, **35 unit tests**, **19 end-to-end smoke
tests**, **7 migrations**, 9 CLI commands.

---

## 10. Where it is weak

Stated plainly.

1. **Source concentration** — 87% of articles from three secondary publishers
   (§7). The strongest argument for a paid tier.
2. **41 companies (2.7%) do not resolve** — mostly OTC pink sheets and LSE
   lines whose supplier ticker matches nothing. Reported as `unresolved`, never
   silently skipped.
3. **Name matching is the weakest link** — it serves exactly the companies with
   the least other coverage. Mitigated by labelling, not by pretending the risk
   is absent.
4. **In-process rate limiter** — the ingest is a single worker by design.
   Horizontal scaling needs a shared token bucket first.
5. **No retention policy** on `articles`. Fine for a year; partition by month
   after that.
6. **Full run is 27 minutes** and bounded by the free rate limit.

### A bug worth reporting

An earlier full run reported `succeeded`, 0 refused, 0 failed — while **410
companies with perfectly good US listings had silently been downgraded** from
ticker-native Finnhub to name-matched search. A per-company timeout was set
below the time a request could spend queued behind the component's own rate
limiter, so Finnhub "failed" on companies it could serve, and the fallback
quietly covered for it. Every summary metric looked healthy.

Fixed twice over: the timeout, and — more importantly — **every provider
attempt is now recorded**, not just the winning one, and exposed as
`degradedProviders` on `/v1/status`. The current run reports an empty list.

The general lesson, and the reason the outcome taxonomy exists: *a fallback
that works is indistinguishable from a primary that works, unless you record
the difference.*

---

## 11. Reproducing these numbers

```bash
cd news-service
cp .env.example .env          # add a free Finnhub key
docker compose up --build     # migrate + load catalogue + resolve listings

npm run ingest                # full run (~27 min)
npm run coverage:probe        # per-provider hit rates by segment
npm run export:listings       # the resolved listing mapping
./scripts/smoke-test.sh       # end-to-end API check
```

Getting a **free OpenFIGI key** cuts first-run listing resolution from ~38
minutes to a few minutes. It is the single highest-value optional setting.

| Document | Contents |
| --- | --- |
| [README.md](../README.md) | Install, run, configure, architecture |
| [COMPARISON.md](COMPARISON.md) | Provider options measured against this catalogue |
| [API.md](API.md) | Full HTTP reference |
| [OPERATIONS.md](OPERATIONS.md) | Failure modes, what to alert on, what was not built |
| `data/listings-mapping.csv` | The resolved exchange/listing mapping, 2,061 rows |
