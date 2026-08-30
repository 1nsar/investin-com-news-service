# News provider comparison — for this catalogue

The first assignment compared news options on a 50-company sample. This is the
same question re-asked against the real list: **1,515 companies, 34 countries,
33 distinct exchange hints**, and a daily run.

Everything below is measured on that catalogue, not quoted from a vendor page.
The measurement command is in the repo (`npm run coverage:probe`) and the
per-company results are written to `data/out/coverage-probe.json`.

**Conclusion up front:** Finnhub as primary, Marketaux as fallback, both on
free tiers, with listing resolution doing the heavy lifting that would otherwise
require a paid global feed. The paid upgrade worth buying is discussed in §6 —
and it is a *quality* upgrade, not a coverage one.

**Revised after measurement.** Google News RSS was the original fallback and is
still the widest-hitting free source in the table below. It was **retired from
the default order** anyway, because its links are `news.google.com` redirects
that cannot be opened: the token decodes to an opaque Google identifier rather
than the article's address, the page returns nothing to a non-browser client,
and browsers frequently refuse the redirect. Those articles can also never carry
an image. Hit rate is not the metric that matters if the reader cannot open the
result.

---

## 1. The finding that changed the answer

The obvious reading of this problem is "Finnhub only covers US symbols, so
1,515 companies across 34 countries needs a global provider." That reading is
wrong, and proving it wrong is most of the engineering in this component.

A company's *listings* are not its ticker. Most non-US companies in this
catalogue also trade in the US — as a sponsored ADR, or as a foreign ordinary
line — and a US ADR usually carries news where the home-exchange symbol returns
nothing. So the question is not "which provider covers Tokyo?" but "how many of
these companies can be given a US symbol?"

**How the mapping was produced.** Two free sources, joined locally:

1. **OpenFIGI** (`/v3/mapping`, no key required) maps ticker + exchange onto
   Bloomberg FIGI identifiers, giving a stable identity and a share class.
2. **Finnhub's US symbol directory** — one download, 30,995 rows, each carrying
   `shareClassFIGI`, `mic`, `isin` and a description. Held in memory and joined
   two ways: by share class (exact), and by normalised company name (which is
   how sponsored ADRs are found, since an ADR is a separate share class and
   nothing structural links it to the home line).

**The result:**

| Segment | Companies | Share |
| --- | ---: | ---: |
| Has a US **exchange** listing | 1,252 | 82.6% |
| Has a US **OTC** line only | 182 | 12.0% |
| **Total reachable with a US symbol** | **1,483** | **97.9%** |
| No US line at all | 29 | 1.9% |
| Could not be resolved | 9 | 0.6% |

**97.9% of the catalogue can be served by a ticker-native US provider.** That
is what makes a free primary viable at this scale, and it is the single most
important number in this document.

Getting there took two rounds. The first pass resolved 94.5% and left 83
companies unresolved — and inspecting those failures showed most were not
unresolvable at all, but rejected by an over-strict name check. The reference
source writes `SMITH (A.O.) CORP`, `BRINK'S CO/THE`, `BABCOCK INTL GROUP PLC`
and `CONCENTRA GROUP HOLDINGS PAR` (truncated at 28 characters); the catalogue
writes them out in full. Teaching the matcher about abbreviations, punctuation
and truncation moved resolution to 99.7% **without loosening it enough to let
any of the seven ticker collisions through** — there is a regression test that
holds both properties at once.

### The name check is not optional

A ticker is not an identifier, and neither is ticker + exchange. This catalogue
contains seven tickers that resolve to a *different company* than the one
named:

| Ticker | Catalogue says | A US exchange says | Resolved to |
| --- | --- | --- | --- |
| `BBY` | Balfour Beatty | Best Buy | Balfour Beatty → `BAFBF` |
| `ADM` | Admiral Group | Archer-Daniels-Midland | Admiral Group → ADR `AMIGY` |
| `NOV` | Novo Nordisk | NOV Inc | Novo Nordisk → ADR `NVO` |
| `ENR` | Siemens Energy | Energizer | Siemens Energy → ADR `SMERY` |
| `FTK` | flatexDEGIRO | Flotek | flatexDEGIRO → `FNNTF` |
| `CWK` | Cranswick | Cushman & Wakefield | Cranswick → `CRWKF` |
| `MOVE` | Medacta | Corvex | Medacta → `MEDGF` |

Narrowing by exchange does **not** fix this: `ADM` filtered to London still
returns Archer-Daniels-Midland, because it cross-lists there. Only confirming
the resolved security's name against the catalogue's name does. Untreated,
these seven produce a full, plausible, entirely wrong feed — the failure mode
nobody notices.

All seven now resolve correctly, and all seven gained a US symbol in the
process.

---

## 2. Measured coverage

Stratified sample, 25 companies per segment, 7-day window, both providers run
against every company.

**hit%** = returned at least one article, as a share of companies the provider
said it could serve.

| Provider | Segment | n | hit% | no news | refused | error | declined | articles/hit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Finnhub | US exchange | 25 | **76%** | 6 | 0 | 0 | 0 | 10.1 |
| Finnhub | US OTC only | 25 | 20% | 20 | 0 | 0 | 0 | 2.0 |
| Finnhub | Foreign w/ US line | 25 | **44%** | 14 | 0 | 0 | 0 | 6.2 |
| Finnhub | Foreign, no US line | 25 | — | 0 | 0 | 0 | **25** | — |
| Finnhub | Unresolved | 25 | — | 0 | 0 | 0 | **25** | — |
| Google News RSS | US exchange | 25 | 100% | 0 | 0 | 0 | 0 | 46.6 |
| Google News RSS | US OTC only | 25 | 96% | 1 | 0 | 0 | 0 | 36.6 |
| Google News RSS | Foreign w/ US line | 25 | 92% | 2 | 0 | 0 | 0 | 39.5 |
| Google News RSS | Foreign, no US line | 25 | **88%** | 3 | 0 | 0 | 0 | 18.4 |
| Google News RSS | Unresolved | 25 | 92% | 2 | 0 | 0 | 0 | 27.2 |

### Reading this honestly

**Zero refusals.** Finnhub never 403s, because the adapter *declines* companies
with no US listing instead of asking. That is the "declined" column: the
provider correctly reports it cannot serve them, rather than burning a call and
a retry on a refusal it can predict.

**Google News wins on volume and loses on trust.** It hits more often and
returns 4× the articles — but it searches by *company name*, so a fraction of
what it returns is about a different business with a similar name. Finnhub is
ticker-native: an article filed against `AAPL` really is about Apple. That
distinction is stored on every article (`match_method`), not averaged away.

**Finnhub's 76% is not a failure.** Of the 24% that missed, all were clean
`no_news` — genuinely quiet companies in a 7-day window. A quiet week is a
legitimate answer, and papering over it with name-matched search results would
replace a fact with a guess.

**OTC coverage is genuinely thin** (20%, 2 articles each). Companies whose only
US line is OTC are effectively international for coverage purposes.

**Latency numbers in the raw output are not provider latency.** They include
this component's own rate limiting; Finnhub's 13s figure for the OTC segment is
token-bucket waiting, not Finnhub being slow. Directly measured, both providers
answer in a few hundred milliseconds.

---

## 3. The options considered

| Option | Coverage on this catalogue | Quality | Cost at ~1,500/day | Verdict |
| --- | --- | --- | --- | --- |
| **Finnhub free** | 97.9% reachable, 76% hit on US exchange | Ticker-native, structured, dedupeable | $0, 60 req/min | **Primary** |
| **Google News RSS** | ~90% across every segment | Name-matched, headline+URL only, no summary, **links cannot be opened** | $0, no formal limit | **Retired** — see §1 |
| **Marketaux free** | 75% US exchange, 50% OTC, 0% no-US-line | Ticker-native, structured, real publisher links **and images** | $0 at 100 req/day; $29–$199/mo paid | **Fallback** |
| Finnhub paid | Adds non-US symbols directly | Same, ticker-native everywhere | Tiered, roughly $12–$100/mo for the relevant tiers; confirm at purchase | See §6 |
| Search API + LLM extraction | Broad, but unbounded | Free-text; needs an LLM to structure it | LLM cost per company per day, plus search | **Rejected** |
| Perplexity / LLM-native search | Broad | Prose, not records; hard to dedupe | Per-query, and the most expensive per company | **Rejected** |
| Alpha Vantage | US-centric, ticker-tagged | Structured, sentiment-scored | $49.99–$249.99/mo | Viable alternative to a Finnhub upgrade |
| Polygon.io | US-centric | Structured | $29–$199/mo, licensed *individual use only* | **Rejected** — licence |

### Why search + LLM was rejected

The first assignment considered it and this one confirms it. Three reasons, in
order of severity:

1. **Cost scales with the catalogue, every day.** A per-company LLM call at
   1,500 companies daily is a recurring five-figure annual line item to
   reproduce data that a structured API already returns for free.
2. **It is not dedupeable.** The whole ingest rests on a canonical URL and a
   stable hash. Prose summaries have neither, so idempotent daily re-runs —
   criterion 4 — become impossible to guarantee.
3. **It adds a prompt-injection surface for no benefit.** Article text is
   attacker-influenceable: anyone can get a press release onto a news
   aggregator. Feeding it to a model that decides what gets stored means
   untrusted text steering the pipeline. No language model touches this
   component, and that is a deliberate security property.

LLMs are the right tool for *interpreting* a feed. They are the wrong tool for
*building* one.

---

## 4. The recommended stack

```
NEWS_PROVIDER_ORDER=finnhub,marketaux
```

Per company, first provider that can serve it wins:

1. **Finnhub** if the company has any US listing — 97.9% of the catalogue.
   Ticker-native, so attribution is certain.
2. **Marketaux** otherwise, queried by **exchange-qualified** symbol — `BBY.L`,
   never bare `BBY`, because a bare symbol silently returns the wrong company
   (see §2). Its entity confirmation is mandatory: an article is accepted only
   when Marketaux itself reports the qualified symbol as an entity of the story.

`google_news_rss` remains in the tree and can be re-enabled by adding it to the
order. It was searched by company name against the home country's edition, and
locale mattered more than it looks — Munich Re returned almost nothing in
`en-US` and a full feed in `de-DE`. It is off by default only because of the
unopenable-link problem in §1.

A clean `no_news` from Finnhub **stops** the chain rather than falling through.
Trading a confident "quiet week" for a name-matched guess would make the data
worse, not better.

Swapping or reordering providers is an environment variable and a restart. The
adapter interface is the only thing a new source has to satisfy.

---

## 4b. What the recommended stack actually did

The full run over all 1,515 companies. **Measured with
`NEWS_PROVIDER_ORDER=finnhub,google_news_rss`, which is not the shipped
default.** Google News RSS was retired afterwards (§1), and its 249 companies
are the coverage that retirement cost. The recommended `finnhub,marketaux`
order has an adapter and per-segment measurements (§6a) but has **not** been run
at catalogue scale, because the free Marketaux tier allows 100 requests a day
against ~260 companies that need it. Reproducing this exact table requires the
old order:

| Provider | Companies served | Outcome |
| --- | ---: | --- |
| Finnhub | 943 | returned articles |
| Finnhub | 258 | clean `no_news` |
| Google News RSS | 249 | returned articles |
| Google News RSS | 14 | clean `no_news` |
| — | 51 | unresolved, no listing to ask about |
| **Total** | **1,515** | 0 refused, 0 failed |

The split follows the resolution: **1,483 companies had a US listing and were
served ticker-native.** That ratio is the whole argument of this document —
without listing resolution, every non-US company would have landed on the
name-matched fallback.

The effect on data quality is direct and measurable: **98.7% of stored articles
carry certain, ticker-native attribution**, and only 1.3% come from name
matching — after unverifiable matches are rejected at ingest (see REPORT.md §7b).

### A caveat worth recording

An earlier version of this run reported the same totals with a very different
split: 435 companies served by Google News instead of 25. Nothing errored. The
run status was `succeeded`.

The cause was a per-company timeout set below the time a request could spend
queued behind this component's own rate limiter — so Finnhub "failed" on
companies it could serve perfectly well, and the fallback quietly covered for
it. 410 companies silently moved from ticker-native attribution to name
matching, and every summary metric looked healthy.

That is precisely the silent-degradation failure this component is supposed to
catch, and the first version did not catch it. The fix was to record **every**
provider attempted per company, not just the one that succeeded, and to expose
it as `degradedProviders` on the status endpoint. It is worth stating plainly
because it is the strongest evidence in this write-up for why the outcome
taxonomy matters: a fallback that works is indistinguishable from a primary
that works, unless you record the difference.

---

## 5. Operating cost

| Item | Cost |
| --- | --- |
| Finnhub free tier | $0 — 60 req/min |
| Google News RSS | $0 — no key |
| OpenFIGI | $0 — free key raises limits only |
| Postgres | one small instance |
| **Total recurring** | **$0 in provider fees** |

The binding constraint is Finnhub's 60 requests/minute, which sets the floor on
a full run — see the README for measured timings. This is the reason the ingest
is incremental: after the first run each company is fetched from where it left
off, and deduplication makes the overlap free.

---

## 6. What a paid tier would buy, and when to buy it

> **Superseded by §9.** This section answers "is free good enough for
> *coverage*?" — and the answer, still, is yes. It was written before the
> reading experience was examined: half of all links land on a publisher that
> may demand a sign-up, and no free tier can fix that because none of them
> license the article body. §9 revises the recommendation accordingly. The
> reasoning below is kept because it is why we are *not* paying for coverage.

**It would not buy much more coverage.** Listing resolution already reaches
97.9% of the catalogue with a free ticker-native provider. A paid global feed
would add the 29 companies with no US line and improve the 203 OTC-only ones —
roughly 2–18% of the list depending on how strictly you count.

**It would buy attribution quality**, which is the real weakness. Today, a
company with no US line is served by name-based search, and name matching is
where misattribution comes from. A paid Finnhub tier serves those companies by
ticker instead, replacing the weakest link in the chain.

**My recommendation:** stay on free tiers for now. The measured data does not
justify a paid tier yet — the fallback is doing its job at 88% hit rate on the
segment that needs it. Revisit when either of two things is true:

- **A consumer starts making decisions on international coverage.** The moment
  name-matched articles feed something that matters, pay to make them
  ticker-native.
- **`match_method='name_match'` exceeds ~15% of stored articles.** That is the
  point at which the trust characteristics of the corpus have materially
  changed, and it is queryable today.

If a key is provisioned, **Finnhub's paid tier is the one to buy**: it is the
same adapter, the same response shape, and the same code path, so the change is
a key and a config line rather than an integration. Marketaux is the credible
alternative if global tagging matters more than reusing the existing adapter.
Published pricing for both should be confirmed at purchase — vendor pricing
pages are not reliably quotable and I would rather say so than print a number I
could not verify.

---

## 6a. Closing the gap: Marketaux

The recommendation in §6 was "stay free for now, and here is the trigger to
revisit". Reviewing where coverage is actually missing sharpened that: the gap
is not spread evenly, it is concentrated in two segments the free stack
structurally cannot serve.

| Segment | Companies | Zero articles |
| --- | ---: | ---: |
| US exchange listing | 1,253 | 22.0% — mostly genuinely quiet |
| **US OTC line only** | **183** | **84.6%** |
| **Unresolved** | **9** | 100% |
| **No US line at all** | **29** | 100% |

*(Regenerate with `npm run metrics` and `npm run export:gaps`. These rates
reflect the corpus after Google News RSS was retired, which removed ~1,400
unopenable links — see §1.)*

Two things follow.

**First, part of that gap was ours, not the provider's.** Finnhub answers a
clean zero for an OTC-only company just as it does for a quiet NYSE company,
and the ingest treated both as final — so 224 companies were never offered to
the fallback. Providers now declare whether their own silence is meaningful.
That fix costs nothing and is the single largest recovery available.

**Second, what remains is genuinely a provider limitation.** Finnhub's free
company-news draws on **six publishers**; nothing about a thin OTC line or a
Frankfurt-only listing is going to appear in them. That is what
[Marketaux](https://www.marketaux.com) is for:

| | Free stack | Marketaux |
| --- | --- | --- |
| Sources | 6 publishers | 5,000+ |
| Markets | US only (free tier) | 80+ |
| Languages | English | 30+ |
| Entities | — | 200,000+, tagged per article |
| Attribution | ticker or *our* name matching | provider's own entity tags |
| Cost | $0 | $0 / $29 / $49 / $99 / $199 per month |

The attribution row matters as much as the coverage rows. Name matching is the
least trustworthy code in this component — it is what filed a film review under
Kid ASA. A provider that tags entities itself removes that entire class of
error rather than filtering it after the fact.

**Billing shape also matters for later.** Marketaux charges per request-day
with a page size, which is the shape a bulk "everything since X" pull needs.
Alpha Vantage charges per request-minute, which is the shape per-company
polling needs — and per-company polling stops working around a few thousand
companies. Same monthly price, opposite trajectory.

**Status: adapter built, not yet measured.** `npm run evaluate` samples the
failing segments specifically, rather than the catalogue evenly, so a free-tier
quota of 100 requests/day is enough to answer whether it covers our gaps.
The recommendation stays provisional until that runs.

## 7. What is still weak

Stated plainly, because pretending otherwise would be the wrong kind of
write-up:

- **4 companies (0.3%) did not resolve** — meaning the ticker matched no
  identifier in our sources, not that the company is delisted. Most are foreign
  secondary listings our identifier sources do not index — 16 London `0XXX` lines (Orkla, Safran, Vinci, Barrick Gold), 13
  Frankfurt `.F` lines (Airbus, Marks & Spencer) — and 7 are duplicate rows for
  companies already covered under another ticker. The full breakdown is in
  `data/coverage-gaps.csv` (`npm run export:gaps`). They are reported as
  `unresolved`, never silently skipped.
- **Name matching is the weakest link** in the whole component. It is the
  fallback for exactly the companies with the least other coverage, and it is
  where a wrong article would enter. Mitigated by storing `match_method` and
  `confidence` on every link so consumers can filter, not by pretending the
  risk is absent.
- **OTC-only companies get thin coverage** (20% hit, 2 articles). This is a
  property of the securities, not of the provider.
- **The rate limiter is in-process**, so the ingest is a single worker by
  design. Scaling horizontally needs a shared token bucket first.
- **A full run takes 26 minutes** and that is set by Finnhub's 60 requests per
  minute, not by anything in this component. It is the one number a paid tier
  would improve immediately.

---

## 8. LLM-native search: Perplexity and Grok

The brief lists "LLM tools such as Perplexity" among the options, so this is a
considered rejection rather than an omission.

**Not in the ingest path.** Four properties make them unsuitable, and the first
two are disqualifying rather than merely inconvenient:

| Property | Why it breaks this component |
| --- | --- |
| Returns prose, not records | The schema keys on a canonical URL. An LLM answer has no stable URL, no `published_at`, no dedupe key — criterion 4 stops being satisfiable |
| Non-deterministic | The same query twice gives different text. Criterion 5 requires a daily re-run to create no duplicates; a paraphrase cannot be deduped |
| Reads attacker-controlled text | Article bodies are written by strangers. A model that reads them and decides what gets stored hands outsiders influence over the pipeline |
| Summarises rather than attributes | It does not guarantee a source said what it reports. Misattributed financial news is precisely what the relevance layer exists to prevent |

Cost and latency are secondary but real: ~1,500 LLM queries a day against $0
today, at seconds per query rather than tens of milliseconds.

**Where one would genuinely earn its place: offline identity resolution.** The
52 unresolved companies are a different kind of problem — *"which company does
LSE code `0IU8` refer to?"*, *"is 'Westinghouse Air Brake Technologies' the same
company as 'WABTEC CORP'?"* Those are exactly what a search-grounded model is
good at, and the task has the properties the ingest path lacks:

- **bounded** — 52 rows once, not 1,500 a day
- **offline** — a resolution pass, not a per-article hot path
- **verifiable** — the output is an identifier, checked against OpenFIGI before
  anything is written
- **cheap** — tens of queries, not tens of thousands

A wrong answer costs nothing because it is confirmed before use. **Perplexity
over Grok** for this, because it cites sources and a citation is what makes the
answer checkable; Grok's advantage is real-time X access, which suits sentiment,
not identity resolution.

**Verdict:** rejected as a news source, recommended as a one-off resolution aid
for the ~29 foreign secondary listings — a bounded task worth an afternoon, not
an architecture.

## 9. Revised recommendation: what to actually buy

The stack above is the best *free* answer. It is not the best answer if the
product needs articles to open inside our own interface.

Free and low-cost APIs — Finnhub, Marketaux, Alpha Vantage — license a headline,
a teaser and a **link**, and their terms require the link out. Rendering the
full text anyway, or scraping the publisher's page for it, is republishing
copyrighted work. So "read it without leaving our site" is a licensing question,
not an engineering one.

**Buy Benzinga's embeddable newsfeed as the primary source.** It owns its
newsroom, so it can license what an aggregator cannot: paid tiers permit the
**full body and image to be displayed on our platform**, with no redirect and no
third-party sign-in. Delivery is REST with `updatedSince` plus WebSocket, TCP
stream and webhooks — push, so freshness stops depending on how often we poll,
and cost stops scaling with catalogue size. Its free tier is headline + teaser +
link, i.e. exactly the constraint we want to escape.

The limitation, stated plainly: ~130–160 articles a day from a US-focused
newsroom. Deep, not wide. Keep **Marketaux** as the single fallback for
companies it does not reach, and drop Finnhub once the licensed feed proves out
— two providers total, which is the practical minimum for this catalogue.

Pricing is quoted per customer via `licensing@benzinga.com` rather than
published, so the ask is a quote for the embeddable-body tier at ~1,500
companies.
