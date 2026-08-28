# Company news component — project report

A standalone backend that keeps a news feed for every company in a
**1,515-company catalogue**. Its own process, its own database, no UI.

Every figure comes from one run and is reproducible with `npm run metrics`.

## Results

| | | | |
| --- | ---: | --- | ---: |
| Companies in catalogue | **1,515** | Companies returning news | **1,005 (66.3%)** |
| Resolved to a real security | **1,463 (96.6%)** | Attribution certain | **99.8%** of links |
| Exchange listings found | **1,987** | Articles carrying an image | **82.0%** |
| Depositary receipts found | **140** | Refusals / failures | **0 / 0** |

**Recurring cost: $0.** No paid API, and no language model is called anywhere.

**What each row means**

- **Resolved to a real security** — for 96.6% of tickers we worked out exactly
  which real, tradeable share it refers to.
- **Attribution certain** — 99.8% of stored articles came from a provider that
  *knew the ticker*. Only 0.2% rest on matching a company name.
- **Exchange listings** — those 1,463 companies trade in 1,987 places in total;
  many trade on more than one exchange.
- **Depositary receipts** — 140 of those listings are a foreign share wrapped
  for trading elsewhere: 139 American (ADR) and 1 global (GDR).
- **Refusals / failures** — no provider refused us, and nothing crashed.

## The idea that makes it work

**The problem:** free news APIs only cover companies listed in America. A third
of this list isn't American.

**The trick:** most foreign companies *also* trade in America under a different
code. Toyota is `7203` in Tokyo, but also `TM` in New York. That American
version is a **depositary receipt** — the same company, wrapped so Americans
can buy it.

So before fetching any news, we find every place each company trades. If any of
them is American, a free US news API can cover it.

| Segment | Companies | What it means |
| --- | ---: | --- |
| US exchange listing | 1,252 | Trades on NYSE or Nasdaq — well covered |
| US OTC line only | 182 | An American presence, but on the quieter over-the-counter market, where coverage is thinner |
| **Reachable with a US symbol** | **1,434 (94.6%)** | The two above: we have *some* American code to ask about |
| No US line at all | 29 | Trades only abroad — must fall back to name search |
| Unresolved | 52 | Could not identify the company (mostly delisted) |

**94.6% is the whole argument.** Because the listing work was done first, almost
everything became reachable with free tools. Without it, we would have had to
buy a global news service.

## A ticker is not an identifier

A ticker is just a short code **on one particular exchange**. The same code
means different companies on different exchanges:

- `BBY` in **London** = Balfour Beatty, a construction firm
- `BBY` in **New York** = Best Buy, an electronics retailer

Ask for "news for BBY" and you get **Best Buy's news filed under Balfour
Beatty**. The feed looks completely normal — full of real articles — and is
about the wrong company entirely. That is what makes it dangerous: nothing
looks broken.

**We found seven of these:**

| | | | |
| --- | --- | --- | --- |
| `BBY` Balfour Beatty → **Best Buy** | `ADM` Admiral → **Archer-Daniels** | `NOV` Novo Nordisk → **NOV Inc** | `ENR` Siemens Energy → **Energizer** |
| `FTK` flatexDEGIRO → **Flotek** | `CWK` Cranswick → **Cushman** | `MOVE` Medacta → **Corvex** | |

**Filtering by exchange does not fix it.** The obvious fix is to ask for "BBY,
*in London*". That fails too, because Archer-Daniels-Midland (`ADM` in New
York) **also trades in London** — so "ADM in London" still returns the wrong
company.

**The only reliable check is the name.** We ask the provider what company it
thinks the ticker is, then compare that to the name in our list. If they
disagree, we reject it.

All seven now resolve correctly — and each **gained a US symbol in the
process**. While correctly identifying Balfour Beatty we also found its American
code, `BAFBF`, so its news can now come from a free US provider.

## Wrong articles are thrown away, not hidden

For companies we can look up **by ticker**, the provider tells us exactly which
company a story is about — no guessing. But for companies with no US listing
there is no ticker to ask with, so we fall back to **searching by company
name** — and a name search cannot tell a company called Jensen from a person
called Jensen.

**Jensen-Group** is a Belgian maker of industrial laundry machines; its name
shortens to "Jensen". **Jensen Huang** is the CEO of Nvidia, one of the most
written-about people in business. Searching for "Jensen" returned hundreds of
Nvidia stories, filed under a small Belgian laundry-equipment maker.

Same pattern with **Kid ASA**, a Norwegian home-textiles retailer. Its name
shortens to "Kid"; searching returned a review of a film called *Club Kid*.

**What we do about it.** Before saving any article found by name search, we
check it is genuinely about that company:

1. **Reduce the name to its distinctive words** — `Jensen-Group` → `jensen`.
2. **Multi-word names need two words present.** "Munich Reinsurance lifts
   profit guidance" keeps; "Munich hosts Oktoberfest" is rejected.
3. **Single-word names need the word *and* business vocabulary** — shares,
   earnings, revenue, results, acquisition, dividend. "Jensen Huang could
   redefine NVIDIA" is rejected; "Jensen Group reports record revenue" keeps.

Articles that fail are **never stored** — not saved and quietly marked
"low quality". **3,041 were thrown away in the last run.** A wrong article never
reaches the feed at all.

## Why some companies have no news

**"All 1,515 fetched correctly" is already true** — zero refusals, zero
failures. Every company was asked the right source with the right symbol. What
varies is whether news existed, and whether we could show it:

| Cause | Companies | Fixable? |
| --- | ---: | --- |
| Genuinely quiet that week | ~270 | **No — and shouldn't be.** A clean zero is a real answer |
| **Link could not be opened** (see below) | ~140 | Yes, with a paid provider |
| Delisted or acquired | 45 | No — the company no longer exists |
| Thin OTC-only coverage | ~30 | Yes, with a paid provider |
| Renamed beyond recognition | 4 | Needs a manual alias |

**On "45 delisted, which is correct":** *resolving* means taking a ticker and
working out which real, tradeable share it refers to. That failed for 52
companies — but for 45 of them the company **no longer exists**: acquired,
merged, or taken private. `EA` (Electronic Arts) and `EQR` are two examples,
neither a listed security today. You cannot find news for a company that no
longer trades, so the system is right to report failure rather than invent a
match. The catalogue is simply a little older than reality.

## Every link now points at the publisher

Two separate faults made stored links fail when clicked. Both are fixed.

**1. Google News redirects (~1,400 articles).** These arrived as
`news.google.com` links rather than publisher addresses, and cannot be
repaired: the token decodes to an opaque Google identifier rather than the
article's address, the page returns nothing to a non-browser client, and
browsers frequently refuse the redirect. Such a story can never show a picture
either. We stopped storing them.

**2. Finnhub redirect wrappers (4,975 articles — 98% of the feed).** Finnhub
does not return the article's URL. It returns a link into *its own* domain,
`finnhub.io/api/news?id=…`, which 302s onward to the publisher. Storing that
was a mistake on three counts:

- every reader paid an extra hop, and the link dies entirely if Finnhub is down
   — a news archive should not depend on the liveness of the API it came from;
- the wrapper **hid the destination**, so a dead publisher could not be
   filtered: the URL looked healthy right up until the click;
- **dedupe degraded**, because every wrapper carries a distinct `id`, so one
   wire story syndicated to three outlets was three separate articles.

Ingest now resolves the wrapper to the publisher's own address before storing,
and a backfill rewrote all 4,975 existing rows. **0 wrappers remain**, across
**76 distinct publishers**.

**What the wrapper was hiding: `chartmill.com`.** With destinations visible, one
host turned out to be dead — it refuses the connection outright, returning no
HTTP status at all in ~0.35s, with a browser user-agent, which a reader sees as
a 504. It accounted for 189 articles and 188 broken images. It is now filtered,
via a configurable `DEAD_ARTICLE_HOSTS` list.

That list is deliberately tiny and evidence-based. It is **not** a list of sites
that block automated clients: Benzinga and Seeking Alpha both refuse our
requests while serving browsers perfectly well, and dropping them would discard
2,298 working articles. A host qualifies only when it fails for a real browser
too.

| | Before | After |
| --- | ---: | ---: |
| Links via a redirect wrapper | 4,975 (98%) | **0** |
| Links on dead hosts | 189 | **0** |
| Broken Google links | ~1,400 | **0** |
| Articles carrying an image | 65% | **82.0%** |
| Companies returning news | 1,163 | 1,005 |

The lost coverage is real, and it is the clearest argument for a paid provider:
one returns genuine publisher links and images for exactly these companies.

## The two timing numbers

They measure different things.

**A 26-minute run** — fetching news for every company, day to day. Finnhub's
free plan allows 60 requests per minute, and we ask about one company per
request. 1,434 companies ÷ 55 per minute ≈ 26 minutes. **The code is not slow —
it is deliberately waiting** to stay inside the free limit. A paid tier would
cut this to a few minutes and change nothing else.

**A ~9-minute first start** — this happens **once**. On first boot we look up
all 1,515 tickers to find their exchanges, via OpenFIGI. Without a key that
allows 25 lookups a minute; with a **free** key, 250 a minute and larger
batches — hence 9 minutes rather than 38. After the first time it never happens
again.

## Design decisions worth knowing

- **Provider-agnostic.** Sources sit behind one interface, ordered by config.
  Adding one is a config change, not a rewrite.
- **Idempotent.** Articles are keyed on a cleaned-up URL, so a daily re-run
  stores nothing new. Verified: zero duplicate URLs.
- **"No news" is not "provider refused."** They look identical if you only
  count articles. The first is normal; the second means coverage is dying. They
  are recorded separately, along with every provider tried per company —
  because a working fallback can hide a broken primary.
- **No language model.** Article text is written by strangers; letting a model
  read it and decide what gets stored would hand outsiders influence over the
  pipeline. The rules used instead are unit-tested against real failures.

## Do we need to pay?

**Not for coverage** — 94.6% is already reachable free and ticker-native.

**Yes, if two things matter.** First, the ~170 companies whose only links were
unopenable or whose OTC coverage is thin. Second, **provenance**: most company
news comes from a handful of aggregators rather than primary wires.

Marketaux was evaluated on its free tier. It returns genuine publisher links
and images and has real depth for major international names (4,960 articles for
Legal & General), but it does not cover Chinese A-shares. Its adapter is built
and activates on an API key, so the decision is reversible at any time.

## Known limits

- **52 companies (3.4%) unresolved** — 45 are delisted, which is correct.
- **Name matching is the weakest component.** Some pairs are undecidable from
  names alone: "Adobe Systems" vs "Adobe" is indistinguishable from
  "Prudential" vs "Prudential Financial" — the first is one company, the second
  is two. Those route to a flagged, reduced-confidence path rather than a guess.
- **Some publishers block us.** Bloomberg returns an error to automated
  requests, so those stories carry no image. We do not disguise the service as
  a browser to get around it.
- **One ingest worker**; parallel workers need shared rate limiting.

Full detail: [README.md](../README.md) · [COMPARISON.md](COMPARISON.md) ·
[API.md](API.md) · [OPERATIONS.md](OPERATIONS.md) · `data/listings-mapping.csv`
