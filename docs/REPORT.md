# Company news component — project report

A standalone backend that keeps a news feed for every company in a
**1,515-company catalogue**. Its own process, its own database, no UI.

Every figure below comes from one run and is reproducible with
`npm run metrics`. Nothing is estimated.

## Results

| | | | |
| --- | ---: | --- | ---: |
| Companies in catalogue | **1,515** | Companies returning news | **1,163 (76.8%)** |
| Resolved to a real security | **1,463 (96.6%)** | Attribution certain | **78.6%** of articles |
| Exchange listings found | **1,987** | Full run | **26 min** |
| Depositary receipts found | **140** | Refusals / failures | **0 / 0** |

**Recurring cost: $0.** No paid API is used anywhere, and no language model is
called at any point.

## The idea that makes it work

Free news APIs only cover companies listed in America, and a third of this
catalogue isn't. But most foreign companies **also** trade in America under a
different symbol — Toyota is `7203` in Tokyo and `TM` in New York.

So before fetching any news, the service resolves every ticker to **all** the
venues it trades on, including its US depositary receipt. That brings **94.6%**
of the catalogue within reach of a free, ticker-native provider — which is why
no paid API is required.

| Segment | Companies | Share |
| --- | ---: | ---: |
| US exchange listing | 1,252 | 82.6% |
| US OTC line only | 182 | 12.0% |
| **Reachable with a US symbol** | **1,434** | **94.6%** |
| No US line at all | 29 | 1.9% |
| Unresolved | 52 | 3.4% |

## A ticker is not an identifier

The most important correctness problem in the data. **Seven tickers resolve to a
different company than the one named:**

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| `BBY` | Balfour Beatty → **Best Buy** | `ADM` | Admiral → **Archer-Daniels** | `NOV` | Novo Nordisk → **NOV Inc** |
| `ENR` | Siemens Energy → **Energizer** | `FTK` | flatexDEGIRO → **Flotek** | `CWK` | Cranswick → **Cushman** |
| `MOVE` | Medacta → **Corvex** | | | | |

Filtering by exchange does **not** fix this — `ADM` narrowed to London still
returns Archer-Daniels-Midland, because it trades there too. Only checking that
the company *name* agrees does.

Untreated, these seven produce a full, plausible, entirely wrong feed. All seven
now resolve correctly, and each gained a US symbol in the process.

## Why some companies have no news

**"All 1,515 fetched correctly" is already true** — zero refusals, zero
failures. Every company was asked the right source with the right symbol. What
varies is whether news existed:

| Cause | Companies | Fixable? |
| --- | ---: | --- |
| Genuinely quiet that week | ~272 | **No — and shouldn't be.** A clean zero is a real answer |
| Delisted or acquired | 45 | No — `EA` and `EQR` no longer exist as securities |
| Thin OTC-only coverage | ~30 | Yes, with a paid provider |
| Renamed beyond recognition | 4 | Needs a manual alias |

## Design decisions worth knowing

- **Provider-agnostic.** Sources sit behind one interface, ordered by config.
  Adding one is a config change, not a rewrite.
- **Idempotent.** Articles are keyed on a canonical URL, so a daily re-run
  stores nothing new. Verified: zero duplicate URLs across 6,461 articles.
- **Wrong attributions are rejected, not hidden.** Name search filed a film
  review under Kid ASA and every *Jensen Huang* story under Jensen-Group.
  3,041 such articles were dropped at ingest in this run.
- **"No news" ≠ "provider refused."** They look identical if you only count
  articles. The first is normal; the second means coverage is dying. They are
  recorded separately, along with every provider tried per company — because a
  working fallback can hide a broken primary.
- **No language model.** Article text is written by strangers; letting a model
  read it and decide what gets stored would hand outsiders influence over the
  pipeline. The rules used instead are unit-tested against real failures.

## Do we need to pay?

**Not for coverage** — 94.6% is already served free and ticker-native.

**Possibly for provenance.** 97% of company news comes from three aggregators
(Yahoo, Benzinga, Seeking Alpha); only 2.3% is primary wire. If being early or
citing a primary source matters, that is the upgrade worth buying.

Marketaux was evaluated on its free tier: real depth for major international
names (4,960 articles for Legal & General), but it does not cover Chinese
A-shares and did not beat the free stack on recent-window coverage.
**Recommendation: stay free.** The adapter is built and activates on a key, so
the decision is reversible.

## Known limits

- **52 companies (3.4%) unresolved** — 45 are delisted, which is correct.
- **Name matching is the weakest component.** Some pairs are undecidable from
  names alone: "Adobe Systems" vs "Adobe" is indistinguishable from "Prudential"
  vs "Prudential Financial" — the first is one company, the second is two. Those
  route to a flagged, reduced-confidence path rather than a guess.
- **One ingest worker**; parallel workers need shared rate limiting.
- **A 26-minute run** bounded by the free tier's 60 requests/minute, not by the
  code. **First start** takes ~9 minutes with a free OpenFIGI key, ~38 without.

Full detail: [README.md](../README.md) · [COMPARISON.md](COMPARISON.md) ·
[API.md](API.md) · [OPERATIONS.md](OPERATIONS.md) ·
`data/listings-mapping.csv`
