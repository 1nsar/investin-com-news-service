# Company news component — project report

A standalone backend that keeps a news feed for every company in a
**1,515-company catalogue**. Its own process, its own database, no UI.

Every figure is reproducible with `npm run metrics`; the coverage gaps with
`npm run export:gaps`. Article counts are a point-in-time snapshot of a live
corpus.

## Results

| | | | |
| --- | ---: | --- | ---: |
| Companies in catalogue | **1,515** | **Connected** | **1,471 (97.1%)** |
| Identified to a real security | **1,506 (99.4%)** | Returning news | **1,445 (95.4%)** |
| Exchange listings found | **2,056** | Attribution certain | **99.9%** of links |
| Depositary receipts | **151** | Articles carrying an image | **83.6%** |

**Recurring cost: $0.** No paid API, and no language model is called anywhere.

**"Connected" is the metric that matters.** It counts a company as working when
it either has news *or* was asked correctly and genuinely had none. A quiet week
is a real answer, not a failure — conflating the two is how a broken pipeline
hides. `GET /v1/status` reports this live, and names the companies in each
faulty state.

## How it works

**The problem:** free news APIs cover companies listed in America. A third of
this catalogue isn't American.

**The approach:** most foreign companies also trade in America under a different
code — Toyota is `7203` in Tokyo and `TM` in New York. So before fetching any
news, the service resolves every ticker to *all* the venues it trades on,
including its US depositary receipt.

| Segment | Companies | |
| --- | ---: | --- |
| US exchange listing | 1,274 | Well covered |
| US OTC line only | 203 | Thinner coverage |
| **Reachable with a US symbol** | **1,477 (97.5%)** | The two above |
| No US line at all | 29 | Needs a non-US source |
| Not identified | 9 | See below |

That resolution step is why no paid API is required.

## Getting the feed right

Four problems mattered more than coverage, and each is fixed:

**The window was too narrow.** Asking for 7 days made active companies look
silent — AvalonBay returned **0 articles over 7 days and 89 over 90**. The
initial window is now 90 days; later runs fetch only since the last one.

**A confident zero stopped the chain.** 263 companies were reported as having no
news after just one provider was tried. That rule was right when the fallback
guessed by company name, but the fallback is now ticker-native, so a second
opinion costs nothing in accuracy. It now falls through — and stops only if the
remaining sources are name-matched.

**Links pointed at a redirect, not the article.** Finnhub returns a link into
its own domain that 302s onward. Storing that meant every reader paid an extra
hop, the link died if Finnhub did, and — because the destination was hidden —
a dead publisher could not be filtered. Links are now resolved to the
publisher's own address before storing: **0 wrappers, across 214 domains**.
That exposed `chartmill.com`, which refuses every connection, and it is now
filtered out.

**Round-ups drowned the feed.** Aggregators tag one macro story against every
ticker it mentions. Attribution is *certain* (the provider named the ticker) but
the story is not *about* any one company. A company's own feed now excludes
articles filed against more than three companies.

## The component in use

No UI of its own — it is a backend. These are the existing research app
consuming it over its HTTP API, which is how it would be integrated.

![The catalogue served over the API: per-company article counts, the venue each ticker resolved to, and the US symbol used to fetch news.](screenshots/global-news.png)

*Every company, with the venues it resolved to. `LN:0A1U` is the London line,
`US:UBER` the symbol news is fetched with. A `0` marked "no news" is a clean
zero, not an error.*

![A single company's feed, with source, age and attribution for each article.](screenshots/company-microsoft.png)

*One company's feed. "also mentions 1 other" is the shared-article model: a
story naming several companies is stored once and linked to each.*

## What happens when a reader clicks

Links now open the publisher directly. Where they land:

| Publisher | Share | What the reader sees |
| --- | ---: | --- |
| finance.yahoo.com | 46.6% | Opens normally |
| **benzinga.com** | **23.2%** | Often a bot check or sign-up prompt |
| **seekingalpha.com** | **12.5%** | Often a registration wall |
| fool.com and 211 others | ~18% | Mostly opens normally |

**About 36% of clicks may meet a registration wall.** Nothing is broken — these
are the correct publisher URLs. We did not drop those sites, because they serve
real browsers fine and removing them would delete 36% of the feed.

**This is not fixable with the current providers.** Finnhub and Marketaux
license a headline, a teaser and a *link*; rendering the full text anyway would
be republishing copyrighted work. Showing articles in our own UI is a licensing
decision — see the recommendation below.

### The 44 companies with no news, and why

The other **1471 of 1515 (97.1%)** are connected — each either has news,
or was asked correctly and genuinely had none in the 90-day window. A clean zero
is a real answer and is not listed here.

**Not identified — 9.** The ticker matched no identifier in any source we use,
so we cannot confirm *which* security it refers to. Guessing risks attributing
another company's news to them.

| Ticker | Company | Why |
| --- | --- | --- |
| `0HAC` | ACS Actividades Constr y Srvcs | London `0XXX` line; local code not in our identifier sources |
| `0Q6M` | Unipol Gruppo Finanziario SpA | London `0XXX` line; local code not in our identifier sources |
| `0RKF` | Construcciones y Auxiliar de F | London `0XXX` line; local code not in our identifier sources |
| `BMRM.F` | Société Anonyme des Bains de M | Frankfurt line; local code not in our identifier sources |
| `CIEZ.F` | Corporación Interamericana de  | Frankfurt line; local code not in our identifier sources |
| `LBGU.F` | L E Lundbergföretagen AB (publ | Frankfurt line; local code not in our identifier sources |
| `LVMH_F` | LVMH Moët Hennessy - Louis Vui | Frankfurt line; local code not in our identifier sources |
| `NVPT.F` | Navitas Petroleum, Limited Par | Frankfurt line; local code not in our identifier sources |
| `NVZM.F` | Novozymes AS | Frankfurt line; local code not in our identifier sources |

**No provider covers them — 7.** Identified correctly, but no source in our stack
serves their market. Closing these needs a new provider, not a code fix.

| Ticker | Company | Why |
| --- | --- | --- |
| `0E64` | DO & CO AG | London-only listing; the free Finnhub plan is US-only |
| `0GQE` | Clas Ohlson AB | London-only listing; the free Finnhub plan is US-only |
| `0H0G` | Sweco AB | London-only listing; the free Finnhub plan is US-only |
| `0QEP` | Maire Tecnimont SpA | London-only listing; the free Finnhub plan is US-only |
| `0REQ` | Per Aarsleff Holding A/S | London-only listing; the free Finnhub plan is US-only |
| `603558` | Zhejiang Jasan Holding Group C | Shanghai-listed; no free provider covers Chinese A-shares |
| `MIA` | Malta International Airport PL | Malta exchange; no provider covers it |

**Ran out of daily quota — 28.** Connected and would have been served; the free
Marketaux tier allows 100 lookups a day and the run reached them after it was
spent. They fill in on the next run. **A budget limit, not a fault.**

| Ticker | Company | Why |
| --- | --- | --- |
| `AIA` | Athens International Airport S | Marketaux daily quota reached before this company was tried |
| `ATZA.F` | Aritzia Inc | Marketaux daily quota reached before this company was tried |
| `AUTO` | Auto Trader Group Plc | Marketaux daily quota reached before this company was tried |
| `BMVCFLT` | Confluent, Inc. | Marketaux daily quota reached before this company was tried |
| `CCC` | Computacenter PLC | Marketaux daily quota reached before this company was tried |
| `ELFI.F` | E-L Financial Corporation Ltd | Marketaux daily quota reached before this company was tried |
| `EMMN` | Emmi AG | Marketaux daily quota reached before this company was tried |
| `EXMR.F` | Exmar NV | Marketaux daily quota reached before this company was tried |
| `FTRO.F` | First Resources Limited | Marketaux daily quota reached before this company was tried |
| `IBAD.F` | Inaba Denki Sangyo Co.,Ltd. | Marketaux daily quota reached before this company was tried |
| `IN` | Infield Minerals Corp | Marketaux daily quota reached before this company was tried |
| `IPOA.F` | Industrias Penoles SAB de CV | Marketaux daily quota reached before this company was tried |
| `JEN` | Jensen-Group | Marketaux daily quota reached before this company was tried |
| `KEDA` | Keda Industrial Group Co Ltd D | Marketaux daily quota reached before this company was tried |
| `KID` | Kid ASA | Marketaux daily quota reached before this company was tried |
| `KRI` | Kri-Kri Milk | Marketaux daily quota reached before this company was tried |
| `LICI` | Life Insurance Corporation Of  | Marketaux daily quota reached before this company was tried |
| `MGNS` | Morgan Sindall Group PLC | Marketaux daily quota reached before this company was tried |
| `MLHK.F` | H&K AG | Marketaux daily quota reached before this company was tried |
| `NTTM.F` | Nittetsu Mining Co., Ltd. | Marketaux daily quota reached before this company was tried |
| `PAF` | Pan African Resources PLC | Marketaux daily quota reached before this company was tried |
| `QQ.` | Qinetiq Group PLC | Marketaux daily quota reached before this company was tried |
| `SAFARI` | Safari Industries | Marketaux daily quota reached before this company was tried |
| `SCT` | Softcat PLC | Marketaux daily quota reached before this company was tried |
| `SKX` | Skechers USA Inc | Marketaux daily quota reached before this company was tried |
| `SUPA` | Super Bank Indonesia Tbk Pt | Marketaux daily quota reached before this company was tried |
| `SYNSAM` | Synsam AB | Marketaux daily quota reached before this company was tried |
| `YPSN` | Ypsomed Holding AG | Marketaux daily quota reached before this company was tried |

## Do we need to pay?

**Not for coverage** — 97.5% is already reachable free and ticker-native.

**Yes, for the reading experience.** Every headline leaves the platform, and
about 36% land somewhere that may demand a sign-up. No free tier fixes this,
because none of them license the article body.

**Recommendation: Benzinga's embeddable newsfeed.** It owns its newsroom, so its
paid tiers permit the **full body and image to be shown inside our own
interface** — no redirect, no third-party sign-in. Delivery is REST plus
WebSocket and webhooks, so freshness stops depending on how often we poll and
cost stops scaling with catalogue size. Its free tier is headline + teaser +
link, i.e. exactly the constraint we want to escape. The limitation, stated
plainly: ~130–160 articles a day from a US-focused newsroom — deep, not wide.

Keep **Marketaux** as the single fallback for what it does not reach: two
providers total. Pricing is quoted per customer via `licensing@benzinga.com`.

**Marketaux Basic ($29/mo)** is the cheaper, separate decision: it removes the
100-lookups-a-day ceiling that currently defers the 28 companies above.

## Design decisions worth knowing

- **Provider-agnostic.** Sources sit behind one interface, ordered by config.
  Adding one is a config change, not a rewrite.
- **Idempotent.** Articles are keyed on a cleaned-up URL; a daily re-run stores
  nothing new. Verified: zero duplicate URLs.
- **"No news" is not "provider refused."** Identical if you only count articles.
  The first is normal; the second means coverage is dying. Recorded separately,
  along with every provider tried per company.
- **One ingest at a time, across processes.** A Postgres advisory lock, because
  the API cannot see an ingest started from the command line — and two
  concurrent ingests interleave their writes.
- **No language model.** Article text is written by strangers; letting a model
  decide what gets stored would hand outsiders influence over the pipeline. The
  rules used instead are unit-tested against real failures.

## Known limits

- **9 companies unidentified** (0.6%) — listed above.
- **Name matching is the weakest component.** Some pairs are undecidable from
  names alone: "Adobe Systems" vs "Adobe" is indistinguishable in form from
  "Prudential" vs "Prudential Financial" — the first is one company, the second
  is two. Known equivalences are a small, explicit, tested alias table rather
  than a looser threshold, because loosening reopens real collisions.
- **Some publishers block automated clients.** Those articles carry no image. We
  do not disguise the service as a browser to get around it.
- **A few US companies are missing from both identifier sources.** AvalonBay,
  Equity Residential and others are absent from Finnhub's 30,995-row directory,
  and OpenFIGI returns their *bonds* for the same ticker. Where the supplier
  asserts a US listing and names a US venue, we use its ticker at the lowest
  confidence in the set, so consumers can filter those out.

Full detail: README.md · COMPARISON.md · API.md · OPERATIONS.md ·
`data/coverage-gaps.csv`
