# Project report

A standalone backend that keeps a news feed for every company in a
1,515-company catalogue. Own process, own database, no UI.

**Every number here comes from one run and is reproducible with
`npm run metrics`.** Nothing is estimated.

---

## 1. Results

| | |
| --- | ---: |
| Companies in catalogue | **1,515** |
| Resolved to a real security | **1,463 (96.6%)** |
| Exchange listings found | **1,987** (140 depositary receipts) |
| Companies returning news | **1,163 (76.8%)** |
| Attribution certain (ticker-native) | **78.6%** of articles |
| Full run | **26 minutes** |
| Provider refusals / failures | **0 / 0** |
| Recurring cost | **$0** |

Average 10 articles per covered company.

---

## 2. The idea that makes it work

Free news APIs only cover companies listed in America. A third of this
catalogue isn't.

But most foreign companies **also** trade in America, under a different symbol —
Toyota is `7203` in Tokyo and `TM` in New York. So before fetching any news, the
service resolves every ticker to **all** the venues it trades on, including its
US depositary receipt.

That brings **94.6%** of the catalogue within reach of a free, ticker-native
provider, which is why no paid API is required.

| Segment | Companies | Share |
| --- | ---: | ---: |
| US exchange listing | 1,252 | 82.6% |
| US OTC line only | 182 | 12.0% |
| **Reachable with a US symbol** | **1,434** | **94.6%** |
| No US line at all | 29 | 1.9% |
| Unresolved | 52 | 3.4% |

---

## 3. A ticker is not an identifier

This is the single most important correctness problem in the data.

Seven tickers in the catalogue resolve to a **different company** than the one
named:

| Ticker | Catalogue says | A US exchange says |
| --- | --- | --- |
| `BBY` | Balfour Beatty | Best Buy |
| `ADM` | Admiral Group | Archer-Daniels-Midland |
| `NOV` | Novo Nordisk | NOV Inc |
| `ENR` | Siemens Energy | Energizer |
| `FTK` | flatexDEGIRO | Flotek |
| `CWK` | Cranswick | Cushman & Wakefield |
| `MOVE` | Medacta | Corvex |

Filtering by exchange does **not** fix it — `ADM` narrowed to London still
returns Archer-Daniels-Midland, because it trades there too. Only checking that
the company *name* agrees does.

Untreated, these seven produce a full, plausible, entirely wrong feed. All seven
now resolve correctly, and each gained a US symbol in the process.

**Renames are separated from collisions** by a simple measured rule: every one
of the seven collisions shares **zero** name tokens with its impostor, while a
rename shares at least one. So Sterling Construction → Sterling Infrastructure
is accepted at reduced confidence and flagged, while Admiral → Archer-Daniels is
rejected.

---

## 4. Why some companies have no news

Of the 352 companies with nothing, the causes differ and so do the fixes:

| Cause | Companies | Fixable? |
| --- | ---: | --- |
| Genuinely quiet that week | ~272 | No — and shouldn't be. A clean zero is a real answer |
| Delisted or acquired | 45 | No — `EA` and `EQR` no longer exist as securities |
| Renamed beyond recognition | 4 | Needs a manual alias (Munich Re is listed as `MUENCHENER RUECKVER`) |
| Thin OTC-only coverage | ~30 | Yes, with a paid provider |

**"All 1,515 fetched correctly" is already true** — zero refusals, zero
failures. Every company was asked the right source with the right symbol. What
varies is whether news existed.

---

## 5. Where the news comes from

| Provider | Serves | Articles | Publishers |
| --- | --- | ---: | ---: |
| Finnhub (free) | US-listed companies | 4,967 | 6 |
| Google News RSS (free) | Everything else, by name | 1,342 | 335 |
| Market feed (free) | Macro news, no company named | 152 | 6 |

**The honest limitation: 97% of company news comes from three aggregators**
(Yahoo, Benzinga, Seeking Alpha). Only 2.3% is primary wire.

The market feed shows what's possible — **66% Reuters, CNBC and Bloomberg** —
but that quality is only available on the general endpoint, not per company.

---

## 6. Quality controls

Fetching news is half the job; a feed for investors also has to be trustworthy.

- **Deduplication.** Articles are keyed on a canonical URL, so a daily re-run
  stores nothing new. Verified: zero duplicate URLs across 6,461 articles.
- **Relevance gate.** Name-based search filed a film review under Kid ASA and
  every *Jensen Huang* story under Jensen-Group. Articles that cannot be
  verified as being about the company are **rejected at ingest, not stored and
  hidden** — 3,041 were dropped in this run.
- **Round-ups demoted.** "Today's top movers" mentions 28 companies and is news
  about none of them.
- **Source tiering.** Every article records whether it came from a primary wire,
  established financial media, or an aggregator.
- **No language model anywhere.** Article text is written by strangers; letting
  a model read it and decide what gets stored would hand outsiders influence
  over the pipeline. The rules used instead are unit-tested against the real
  failures they were written for.

---

## 7. Operations

- **Outcomes are distinguished.** "No news today" and "the provider refused us"
  look identical if you only count articles. The first is normal; the second
  means coverage is dying. They are recorded separately, along with every
  provider tried per company — because a working fallback can hide a broken
  primary.
- **Failures are isolated.** One company failing never sinks a run.
- **Refresh is tiered.** News volume is extremely skewed: **108 companies (7%)
  produce 49% of all articles**, while 400 (26%) produced nothing in a week. So
  the busiest names refresh hourly (~70 seconds), the middle every six hours,
  and everything daily.

---

## 8. Do we need to pay?

**Not for coverage.** 94.6% of the catalogue is already served free and
ticker-native.

**Possibly for provenance.** 97% of company news comes from three aggregators.
If being early or citing a primary source matters, that is the upgrade worth
buying — not more companies.

**Marketaux was evaluated** (free tier, [pricing](https://www.marketaux.com/pricing):
$0 / $29 / $49 / $99 / $199 per month):

| Segment | Hit rate, 30-day window |
| --- | ---: |
| US exchange | 75% |
| US OTC only | 50% |
| No US line | 0% |

It **does** carry real depth for major international names — 4,960 articles for
Legal & General, 3,660 for Novo Nordisk — and its entity tagging would remove
name-matching errors entirely. But it does not cover Chinese A-shares at all,
and on a recent-window test it did not beat the free stack on raw coverage.

**Recommendation: stay free for now.** The adapter is built and activates on a
key, so the decision is reversible at any time.

---

## 9. Known limits

- **52 companies (3.4%) unresolved** — 45 are delisted, which is correct.
- **Name matching is the weakest component.** It serves exactly the companies
  with the least other coverage. Some pairs are genuinely undecidable from names
  alone: "Adobe Systems" vs "Adobe" is indistinguishable from "Prudential" vs
  "Prudential Financial", where the first is the same company and the second is
  not. Those route to a flagged, reduced-confidence path rather than a guess.
- **One ingest worker.** Running several in parallel needs shared rate limiting.
- **No retention policy** on stored articles.
- **A full run takes 26 minutes**, bounded by the free tier's 60 requests per
  minute — not by anything in the code.
- **First start takes ~9 minutes** with a free OpenFIGI key, ~38 without.

---

## 10. Reproducing this

```bash
cp .env.example .env          # add a free Finnhub key
docker compose up --build     # migrate, load catalogue, resolve listings

npm run ingest                # full run
npm run metrics               # regenerates every figure above
./scripts/smoke-test.sh       # 19 end-to-end API checks
```

| Document | Contents |
| --- | --- |
| [README.md](../README.md) | Install, run, configure, architecture |
| [COMPARISON.md](COMPARISON.md) | Provider options measured against this catalogue |
| [API.md](API.md) | HTTP reference (spec in [openapi.json](openapi.json)) |
| [OPERATIONS.md](OPERATIONS.md) | Failure modes and what was deliberately not built |
| `data/listings-mapping.csv` | The resolved exchange/listing mapping |
