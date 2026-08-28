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

## Which companies have no news, and why

The full list is exported as data — **[`data/coverage-gaps.csv`](../data/coverage-gaps.csv)**,
one row per company with a `gap_reason`, regenerated with `npm run export:gaps`.
**510 of 1,515** produced no news. They are not one problem:

| Gap reason | Companies | Whose problem is it? |
| --- | ---: | --- |
| `no_news_us_exchange` | 276 | **Nobody's.** Identified correctly, asked correctly, genuinely quiet that week |
| `no_news_otc_only` | 154 | Thin OTC coverage — a paid provider would help |
| `no_news_no_us_line` | 29 | Trades only abroad; no free US-centric source reaches it |
| `unresolved_london_secondary_line` | 16 | Ours — `0XXX` LSE codes are not in our identifier sources |
| `unresolved_frankfurt_line` | 13 | Ours — same, for `.F` Frankfurt lines |
| `unresolved_absent_from_directory` | 10 | Absent from Finnhub's US directory |
| `duplicate_listing_line` | 7 | **Nothing is missing** — same company already covered under another ticker |
| `unresolved_name_check_rejected` | 3 | Ours — the safety check fired, twice wrongly |
| `unresolved_malformed_ticker` | 2 | The catalogue's — `LVMH_F` uses `_` where every other row uses `.` |

**A correction worth stating plainly.** An earlier draft of this report said the
52 unresolved were "45 delisted, which is correct." That was overconfident. What
is actually true is narrower: **45 could not be matched to an identifier in the
sources we use.** Checking them individually shows most are not delisted at all:

- **16 are London `0XXX` lines** — `0FIN` Orkla, `0IU8` Safran, `0NQM` Vinci,
  `0R22` Barrick Gold. Large, actively traded companies. The `0XXX` code is an
  LSE convention our identifier sources do not index.
- **13 are Frankfurt `.F` lines** — `EADS.F` Airbus, `MAKS.F` Marks & Spencer,
  `CMXH.F` CSL. Same story.
- **7 are duplicates** — `EADS.F` Airbus is already covered as `0KVV`;
  `RYAA.Y` Ryanair as `0RYA`. Nothing is missing for these at all.
- **10 are plain US tickers absent from Finnhub's 30,995-symbol US directory** —
  `EA`, `SKX`, `EQR`, `JHG`. Some are genuine take-privates; others look like
  directory gaps. We do not claim to know which without checking each.

**Two of the three name-check rejections are our bug, not a bad match.** `WAB`
was rejected because the catalogue says "Westinghouse Air Brake Technologies"
and the directory says "WABTEC CORP" — the same company under its trading name.
`MUV2` was rejected because the directory carries Munich Re's German name,
"MUENCHENER RUECKVER AG-REG". The matcher compares surface forms and has no
notion of an abbreviation or a translation. The third rejection, `P` →
"EVERPURE INC-A" against a catalogue row for Pure Storage, is **correct** — those
really are different companies, and it is the same protection that caught the
seven ticker collisions.

**The catalogue also double-counts.** 1,515 rows are not 1,515 distinct
businesses: Novartis appears three times (`NOVN`, `NOVNEE`, `0QLR`), SAP three
times (`SAP`, `0NW4`, `SAPG.F`), Alphabet twice (`GOOGL`, `0HD6`). Coverage
percentages are therefore computed per *row*, and the true per-business figure
is somewhat better than the headline suggests.

### What is actually fixable

| Fix | Companies recovered | Effort |
| --- | ---: | --- |
| Treat `_` as `.` when parsing tickers | 2 | Trivial |
| Alias table for trade names and non-English names | 2 | Small, manual |
| Collapse duplicate listing rows onto one company | 7 | Small |
| Map `0XXX` / `.F` codes via an LSE/Deutsche Börse identifier source | 29 | Medium |
| Paid provider for OTC and non-US lines | up to 183 | Cost, not code |

The first three are ~11 companies for an afternoon's work. The last row is the
only one that requires spending money, and it is the largest by far.

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

## What happens when a reader clicks

Links now go straight to the publisher. That fixed the broken ones — but it
exposes a second problem that is worth stating plainly, because it is the
clearest argument for buying content.

**Every headline leaves our platform**, and where it lands is the publisher's
site, not ours:

| Publisher | Share of articles | What the reader sees |
| --- | ---: | --- |
| finance.yahoo.com | 32.3% | Opens normally |
| **benzinga.com** | **31.5%** | Often a bot check or a sign-up prompt |
| **seekingalpha.com** | **15.6%** | Often a registration wall |
| fool.com, cnbc.com, and 71 others | ~20% | Mostly opens normally |

**So roughly half of all clicks (47%) land on a site that may ask the reader to
register before showing the article.** Nothing is broken — these are the correct
publisher URLs, correctly resolved. The reader simply meets someone else's
paywall on a link we presented as ours, and a different site layout each time.

**We did not remove them.** Benzinga and Seeking Alpha serve real browsers
perfectly well; they only refuse automated clients, so we cannot reliably detect
a wall in advance. Dropping both would delete **47% of the catalogue's articles**
to avoid an inconvenience that many readers never hit.

**This is not fixable with the current providers.** Finnhub and Marketaux
license a headline, a teaser and a **link** — their terms require the link out.
Rendering the full text anyway, or scraping the publisher's page for it, is
republishing copyrighted work. The fix is to license content we are permitted to
display, which is what the recommendation below is about.

## The component in use

The service has no UI of its own — it is a backend. These are from the existing
research app consuming it over its HTTP API, which is how it would be integrated.

![The catalogue served over the API: per-company article counts, the exchange each ticker resolved to, and the US symbol that makes news fetchable.](screenshots/global-news.png)

*Every company in the catalogue, with the venues it resolved to. `LN:0A1U` is
the London line, `US:UBER` the US symbol news is actually fetched with. A `0`
with "no news" is a clean zero, not an error — the distinction the run reporting
is built around.*

![Search resolves a name to the catalogue row and its resolved listings.](screenshots/search-microsoft.png)

*Search by name or ticker. The result shows the resolved listing (`US:MSFT`) and
the stored article count.*

![A single company's feed: 117 stored articles, each with source, age, and how it was attributed.](screenshots/company-microsoft.png)

*One company's feed. "also mentions 1 other" is the shared-article model: a story
naming several companies is stored once and linked to each, never duplicated per
company.*

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

## Do we need to pay? — and what to buy

**Not for coverage.** 94.6% is already reachable free and ticker-native.

**Yes, for the reading experience.** Three problems are not solvable with any
free tier, and they are the ones a user actually feels:

1. **Every headline leaves our platform.** The reader lands on Yahoo, Benzinga,
   Seeking Alpha or Fool — a different site, a different layout, each time.
2. **Some of those sites demand a sign-up or a subscription** before showing the
   article. We cannot tell in advance which, so the reader plays paywall
   roulette on links we presented as ours.
3. **We cannot legally fix that ourselves.** Free and low-cost APIs — Finnhub,
   Marketaux, Alpha Vantage — license a **headline, a short teaser and a link**.
   Their terms require the link out. Displaying the full text we did not license,
   or scraping the publisher's page for it, is republishing someone else's
   copyrighted work. Financial publishers enforce this actively, and it is not a
   risk worth taking to save a click.

**So the requirement "show the article in our own UI" is a licensing decision,
not an engineering one.** The fix is to buy content we are permitted to display.

### Recommendation: Benzinga's licensed newsfeed as primary

Benzinga owns its newsroom, so it can license what an aggregator cannot. Its
paid tiers are **explicitly embeddable** — the full body and the image may be
published inside our own interface, with no redirect and no third-party
sign-in. Its free tier is headline + teaser + link, which is exactly the
constraint we are trying to escape.

| Requirement | How Benzinga meets it |
| --- | --- |
| Show the article without redirecting | Paid tiers license the **full body and image** for display on our platform |
| Always fresh, automatically | Pull REST with `updatedSince`, plus **WebSocket, TCP stream and webhooks** — push, not polling |
| No per-company rate ceiling | A firehose of the newsroom, not one request per company — the cost stops scaling with catalogue size |
| One consistent source | One publisher, one voice, one layout — no paywall roulette |

That last row also solves the scale problem in the section above: polling costs
one request per company per day, so 50,000 companies is 50,000 requests. A
stream costs the same regardless of how many companies we track.

**The honest limitation.** Benzinga publishes roughly 130–160 full articles a
day from a US-focused newsroom. That is deep, not wide — it will not cover
Chinese A-shares or thin European lines. It replaces the *quality* of our feed,
not all of its *breadth*.

### The two-provider architecture

Exactly two, which is the practical minimum that still covers the catalogue:

| Tier | Provider | Licence | Reader experience |
| --- | --- | --- | --- |
| **Primary** | **Benzinga (paid)** | Full body embeddable | Reads in our UI. No redirect, no sign-in |
| **Fallback** | **Marketaux** | Headline + link | Opens the publisher — only for companies Benzinga does not cover |

Everything needed to make this switch already exists: providers sit behind one
adapter interface and are ordered by `NEWS_PROVIDER_ORDER`, so adding Benzinga
is a new adapter plus a config change, and Finnhub can be dropped the day the
licensed feed proves out. The article schema already carries `image_url` and a
summary; a licensed body needs one nullable `body` column and a UI that renders
it instead of linking out.

**Pricing is not published** — content licensing is quoted per customer, via
`licensing@benzinga.com`. The brief offers to provision a paid key, so the ask
is a quote for the embeddable-body tier at ~1,500 companies, with room to grow.

## Known limits

- **52 companies (3.4%) unresolved** — see the table above; most are foreign
  secondary listings our identifier sources do not index, not delistings.
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
