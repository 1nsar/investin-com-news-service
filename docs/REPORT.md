# Company news component — project report

A standalone backend that keeps a news feed for every company in a
**1,515-company catalogue**. Its own process, its own database, no UI.

Every figure is reproducible with `npm run metrics`; the gaps with
`npm run export:gaps`. Article counts are a snapshot of a live corpus.

## Results

| | | | |
| --- | ---: | --- | ---: |
| Companies in catalogue | **1,515** | **Connected** | **1,509 (99.6%)** |
| Identified to a real security | **1,512 (99.8%)** | Returning news | **1,450 (95.7%)** |
| Exchange listings found | **2,023** | Attribution certain | **99.9%** of links |
| Depositary receipts | **154** | Articles with an image | **83.6%** |

**Recurring cost: $0.** No paid API, and no language model is called anywhere.

**"Connected" is the metric that matters.** A company counts as working when it
either has news *or* was asked correctly and genuinely had none. A quiet week is
a real answer — treating it as a failure is how a broken pipeline hides.
`GET /v1/status` reports this live and names the companies in each faulty state.

## How it works

**The problem:** free news APIs cover companies listed in America. A third of
this catalogue isn't American.

**The approach:** most foreign companies also trade in America under a different
code — Toyota is `7203` in Tokyo and `TM` in New York. So before fetching any
news, every ticker is resolved to *all* the venues it trades on, including its
US depositary receipt.

| Segment | Companies | |
| --- | ---: | --- |
| US exchange listing | 1,313 | Well covered |
| US OTC line only | 170 | Thinner coverage |
| **Reachable with a US symbol** | **1,483 (97.9%)** | The two above |
| No US line at all | 30 | Needs a non-US source |
| Not identified | 3 | See below |

That resolution step is why no paid API is required.

## Five problems that mattered more than coverage

**1. The window was too narrow.** Asking for 7 days made active companies look
silent — AvalonBay returned **0 articles over 7 days and 89 over 90**. The first
fetch now looks back 90 days; later runs fetch only since the last one.

**2. A confident zero stopped the chain.** 263 companies were reported as having
no news after only one provider was tried. That rule was right when the fallback
guessed by company name, but the fallback is now ticker-native, so a second
opinion costs nothing. It now falls through, stopping only if the remaining
sources are name-matched.

**3. Links pointed at a redirect, not the article.** Finnhub returns a link into
its own domain that 302s onward. Storing that meant every reader paid an extra
hop, the link died if Finnhub did, and the hidden destination made a dead
publisher impossible to filter. Links are now resolved to the publisher's own
address before storing: **0 wrappers across 214 domains**. That exposed
`chartmill.com`, which refuses every connection, now filtered out.

**4. Four major UK companies were silently mis-queried.** Identifier sources
write LSE tickers in Bloomberg form — Aviva is `AV/`, BAE `BA/`, Rolls-Royce
`RR/`. Appending the venue suffix produced `AV/.L`, which matches nothing, so
all four returned a clean zero indistinguishable from a quiet week.

**5. Scarce quota went to companies that did not need it.** Companies were
fetched in catalogue order, so the fallback provider's 100 daily lookups were
spent on whoever sorted first — 36 well-covered companies sat ahead of the first
company with no news at all. Companies without news are now served first.

## What happens when a reader clicks

Links open the publisher directly. Where they land:

| Publisher | Share | What the reader sees |
| --- | ---: | --- |
| finance.yahoo.com | 46.5% | Opens normally |
| **benzinga.com** | **23.2%** | Often a bot check or sign-up prompt |
| **seekingalpha.com** | **12.5%** | Often a registration wall |
| fool.com and 210 others | ~18% | Mostly opens normally |

**About 36% of clicks may meet a registration wall.** Nothing is broken — these
are the correct publisher URLs. Those sites serve real browsers fine, and
dropping them would delete a third of the feed.

**This is not fixable with the current providers.** Finnhub and Marketaux
license a headline, a teaser and a *link*; rendering the full text anyway would
be republishing copyrighted work. Showing articles in our own interface is a
licensing decision — see below.

## The 6 companies with no news, and why

The other **1,509 of 1,515 (99.6%)** are connected — each either has news, or was
asked with a valid symbol and genuinely had none in the 90-day window. A quiet
week is a real answer, so those are not listed here.

### 3 companies: we cannot pin down which security it is

We know exactly who these businesses are. What we cannot get is an *address* a
news provider will accept.

Shares are often quoted in several currencies on small side exchanges — a
"priced in pounds" version, a "priced in francs" version — which exist for
hedging and which nobody writes news against. For these three, those side quotes
are the only thing that comes back. **The ordinary home listing never appears.**

| Ticker | Company | What it does | Where | Why no news |
| --- | --- | --- | --- | --- |
| `BMRM.F` | Société Anonyme des Bains  | Casinos, hotels and resorts in Monte-Carlo | Monaco | Only currency-hedged side quotes come back — never its Paris listing |
| `CIEZ.F` | Corporación Interamericana | Live entertainment — concerts, venues, events | Mexico | Only currency-hedged side quotes come back — never its Mexico listing |
| `NVPT.F` | Navitas Petroleum, Limited | Oil and gas exploration | Israel | Only currency-hedged side quotes come back — never its Tel Aviv listing |

### 3 companies: no news source covers where they trade

Identified, but unreachable — each for a different reason.

| Ticker | Company | What it does | Where | Why no news |
| --- | --- | --- | --- | --- |
| `0M6I` | Heijmans NV | Construction — roads, housing, infrastructure | Netherlands | Shares are Dutch depositary receipts; the search index never returns its Amsterdam line |
| `0QEP` | Maire Tecnimont SpA | Engineering — builds chemical and energy plants | Italy | Only a US-dollar side quote, on a venue no provider covers |
| `MIA` | Malta International Airpor | Operates the country’s airport | Malta | Malta’s exchange is tiny; no provider we use carries it |

Heijmans is the near miss. Its shares are Dutch **depositary receipts**
(*certificaten van aandelen*) rather than ordinary stock. Searching for those now
works — that fix connected Unipol — but the search index still returns only side
quotes for Heijmans, never its Amsterdam line. The lookup-by-ticker endpoint does
have it; using that would mean guessing the ticker, and a wrong guess attributes
another company's news.

## The component in use

No UI of its own — it is a backend. These are the existing research app
consuming it over its HTTP API.

![The catalogue served over the API: per-company article counts, the venue each ticker resolved to, and the US symbol used to fetch news.](screenshots/global-news.png)

*`LN:0A1U` is the London line, `US:UBER` the symbol news is fetched with. A `0`
marked "no news" is a clean zero, not an error.*

![A single company's feed, with source, age and attribution per article.](screenshots/company-microsoft.png)

*"also mentions 1 other" is the shared-article model: a story naming several
companies is stored once and linked to each.*

## Do we need to pay?

**Not for coverage** — 97.8% is reachable free and ticker-native.

**Yes, for the reading experience.** Every headline leaves the platform, and
about a third land somewhere that may demand a sign-up. No free tier fixes this,
because none license the article body.

**Recommendation: Benzinga's embeddable newsfeed.** It owns its newsroom, so its
paid tiers permit the **full body and image to be shown inside our own
interface** — no redirect, no third-party sign-in. Delivery is REST plus
WebSocket and webhooks, so freshness stops depending on how often we poll and
cost stops scaling with catalogue size. Its free tier is headline + teaser +
link, i.e. the constraint we want to escape. Limitation, stated plainly:
~130–160 articles a day from a US-focused newsroom — deep, not wide. Keep
**Marketaux** as the single fallback: two providers total.

## Design decisions worth knowing

- **Provider-agnostic.** Sources sit behind one interface, ordered by config.
- **Idempotent.** Articles keyed on a cleaned-up URL; a daily re-run stores
  nothing new. Verified: zero duplicate URLs.
- **"No news" is not "provider refused."** Identical if you only count articles.
  Recorded separately, with every provider tried per company.
- **One ingest at a time, across processes** — a Postgres advisory lock, because
  the API cannot see an ingest started from the command line.
- **No language model.** Article text is written by strangers; letting a model
  decide what gets stored would hand outsiders influence over the pipeline.

## Known limits

- **3 companies (0.2%) unidentified** — explained above.
- **Name matching is the weakest component.** "Adobe Systems" vs "Adobe" is
  indistinguishable in form from "Prudential" vs "Prudential Financial" — the
  first is one company, the second is two. Known equivalences are a small,
  tested alias table rather than a looser threshold.
- **Some publishers block automated clients**, so those articles carry no image.
  We do not disguise the service as a browser to get around it.
- **A few US companies are missing from both identifier sources.** AvalonBay and
  Equity Residential are absent from Finnhub's 30,995-row directory, and
  OpenFIGI returns their *bonds* for the same ticker. Where the supplier asserts
  a US listing and names a US venue, its ticker is used at the lowest confidence
  in the set, so consumers can filter those out.

Full detail: README.md · COMPARISON.md · API.md · OPERATIONS.md ·
`data/coverage-gaps.csv`
