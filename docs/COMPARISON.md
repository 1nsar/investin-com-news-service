# News provider comparison — measured on this catalogue

**Conclusion up front:** Finnhub as primary, Marketaux as fallback, both on free
tiers, with listing resolution doing the work that would otherwise require a
paid global feed. **Recurring cost: $0.** The paid upgrade worth buying is a
*quality* upgrade, not a coverage one — see §7.

Measurement commands are in the repo: `npm run coverage:probe`,
`npm run evaluate`, `npm run metrics`.

---

## 1. The finding that changed the answer

Free news APIs are US-centric, and a third of this catalogue is not American.
The obvious conclusion — "we must buy a global feed" — turned out to be wrong.

Most foreign companies also trade in America under a different code: Toyota is
`7203` in Tokyo and `TM` in New York. So the component resolves every ticker to
**all** the venues it trades on, including its US depositary receipt, before
fetching anything.

| Segment | Companies | Share |
| --- | ---: | ---: |
| Has a US exchange listing | 1,313 | 86.7% |
| Has a US OTC line only | 170 | 11.2% |
| **Total reachable with a US symbol** | **1,483** | **97.9%** |
| No US line at all | 29 | 1.9% |
| Could not be identified | 3 | 0.2% |

**97.9% is the whole argument.** Because the listing work was done first, almost
everything became reachable with free, ticker-native sources.

---

## 2. Measured coverage

Stratified sample, 25 companies per segment, 7-day window. **hit%** = returned
at least one article, as a share of companies the provider said it could serve.

| Provider | Segment | n | hit% | no news | refused | declined | articles/hit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Finnhub | US exchange | 25 | **76%** | 6 | 0 | 0 | 10.1 |
| Finnhub | US OTC only | 25 | 20% | 20 | 0 | 0 | 2.0 |
| Finnhub | Foreign w/ US line | 25 | **44%** | 14 | 0 | 0 | 6.2 |
| Finnhub | Foreign, no US line | 25 | — | 0 | 0 | **25** | — |
| Google News RSS | US exchange | 25 | 100% | 0 | 0 | 0 | 46.6 |
| Google News RSS | Foreign, no US line | 25 | **88%** | 3 | 0 | 0 | 18.4 |

**Reading this honestly:**

- **Zero refusals.** Finnhub never 403s because the adapter *declines* companies
  with no US listing rather than burning a call on a refusal it can predict.
- **Google News wins on volume and loses on trust.** It hits more often and
  returns 4× the articles, but searches by *company name*, so some of what it
  returns is about a different business. Finnhub is ticker-native. That
  distinction is stored per article (`match_method`), not averaged away.
- **Finnhub's 76% is not a failure.** Every miss was a clean `no_news` — a quiet
  company in a 7-day window. **The window was the real limit:** widening the
  first fetch to 90 days took AvalonBay from 0 articles to 89.
- **OTC coverage is genuinely thin** (20%, 2 articles each).

---

## 3. The options considered

| Option | Coverage here | Quality | Cost at ~1,500/day | Verdict |
| --- | --- | --- | --- | --- |
| **Finnhub free** | 97.8% reachable | Ticker-native, structured | $0, 60 req/min | **Primary** |
| **Marketaux free** | Non-US and OTC lines | Ticker-native, real publisher links **and images** | $0 at 100 req/day; $29–199/mo paid | **Fallback** |
| Google News RSS | ~90% every segment | Name-matched, **links cannot be opened** | $0 | **Retired** — see §4 |
| Alpha Vantage | US-centric | Structured, sentiment-scored | $49.99–249.99/mo | Alternative to a Finnhub upgrade |
| Polygon.io | US-centric | Structured | $29–199/mo, *individual use only* | **Rejected** — licence |
| Search API + LLM extraction | Broad, unbounded | Free-text; needs an LLM to structure | LLM cost per company per day | **Rejected** — see §6 |

---

## 4. Why Google News RSS was retired

It was the original fallback and still hits more often than anything else free.
It was dropped anyway: its links are `news.google.com` redirects that **cannot
be opened**. The token decodes to an opaque Google identifier rather than the
article's address, the page returns nothing to a non-browser client, and
browsers frequently refuse the redirect. Those articles can never carry an image
either.

**Hit rate is not the metric that matters if the reader cannot open the result.**
The adapter remains in the tree and can be re-enabled via `NEWS_PROVIDER_ORDER`.

---

## 5. The recommended stack

```
NEWS_PROVIDER_ORDER=finnhub,marketaux
```

1. **Finnhub** if the company has any US listing — 97.8% of the catalogue.
   Ticker-native, so attribution is certain.
2. **Marketaux** otherwise, queried by **exchange-qualified** symbol — `BBY.L`,
   never bare `BBY`, because a bare symbol silently returns the wrong company.
   Its entity confirmation is mandatory: an article is accepted only when
   Marketaux itself reports the qualified symbol as an entity of the story.

**A clean `no_news` no longer stops the chain** when another *ticker-native*
provider remains. It still stops if only a name-matched source is left — trading
a confident "quiet week" for a guess would make the data worse.

**Operating cost:** $0. Finnhub free is 60 req/min; a full run is one request
per company. Marketaux free is 100 lookups/day, and companies without news are
served first so that budget reaches the companies it can actually change.

---

## 6. LLM-native search: Perplexity and Grok

The brief lists "LLM tools such as Perplexity", so this is a considered
rejection rather than an omission.

**Not in the ingest path.** Two properties are disqualifying:

| Property | Why it breaks this component |
| --- | --- |
| Returns prose, not records | The schema keys on a canonical URL. An LLM answer has no stable URL, no `published_at`, no dedupe key |
| Non-deterministic | The same query twice gives different text; a paraphrase cannot be deduped, so daily re-runs stop being idempotent |

Two more that matter: it would read **attacker-controlled text** (article bodies
are written by strangers), and it summarises rather than attributes — and
misattributed financial news is exactly what the relevance layer exists to
prevent.

**Where one would earn its place: offline identity resolution.** *"Which company
does LSE code `0IU8` refer to?"* is bounded (a few dozen rows, not 1,500 a day),
offline, verifiable against OpenFIGI before anything is written, and cheap.
**Perplexity over Grok** there, because it cites sources and a citation is what
makes the answer checkable.

---

## 7. What to actually buy

The stack above is the best *free* answer. It is not the best answer if articles
must open inside our own interface.

Free and low-cost APIs license a headline, a teaser and a **link**, and their
terms require the link out. Rendering the full text anyway is republishing
copyrighted work. So "read it without leaving our site" is a **licensing**
question, not an engineering one.

**Buy Benzinga's embeddable newsfeed as primary.** It owns its newsroom, so its
paid tiers permit the full body and image to be displayed on our platform, with
no redirect and no third-party sign-in. Delivery is REST with `updatedSince`
plus WebSocket and webhooks — push, so cost stops scaling with catalogue size.
Its free tier is headline + teaser + link, i.e. the constraint we want to escape.

Limitation, stated plainly: ~130–160 articles a day from a US-focused newsroom.
Deep, not wide. Keep **Marketaux** as the single fallback — two providers total.
Pricing is quoted per customer via `licensing@benzinga.com`.

**Marketaux Basic ($29/mo)** is a separate, cheaper decision: it removes the
100-lookups-a-day ceiling.

---

## 8. What is still weak

- **3 companies (0.2%) could not be identified.** One cause: only
  currency-hedged side quotes come back for them — `UNIGBX`, `UNICHF` and the
  like — never the ordinary home listing that news is written against.
  Abbreviated directory names, previously the second cause, are now matched.
- **Name matching is the weakest component.** It is the fallback for exactly the
  companies with the least other coverage. Mitigated by storing `match_method`
  and `confidence` on every link so consumers can filter, not by pretending the
  risk is absent.
- **OTC-only companies get thin coverage.** A property of the securities, not
  the provider.
- **The rate limiter is in-process**, so ingest is a single worker by design.
  Scaling horizontally needs a shared token bucket first.
- **A full run takes ~26 minutes**, set by Finnhub's 60 requests/minute — not by
  anything in this component. It is the one number a paid tier improves
  immediately.
