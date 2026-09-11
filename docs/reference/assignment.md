# Assignment — company news component (production extension)

## Context

This extends the first test assignment (the company news feed). That was a proof of concept on
~50 companies; this is the real thing. We are building the **news component** of our product —
the piece that, for every company we track, keeps a fresh feed of what's happened. Your MVP
(Finnhub for US-listed symbols + a Google News RSS fallback for the international ones) already
proved the shape works. Now we productionise it for the **full catalogue** and turn it into a
standalone backend component we can drop into our system later.

**This is backend only. No UI this time.** The feed already exists; what we need now is a solid,
schedulable, integrable news backend that works across the whole catalogue.

## What you get

A list of **~1,500–2,000 real companies** (CSV/JSON), one row per company, with:

- `ticker`
- `company_name`
- `country` (headquarters)
- `is_us_listed` (boolean — whether it trades on a US exchange)
- possibly a hint `exchange` / `sector` / `currency` where we have it — treat any exchange value
  as a hint to verify, not ground truth.

You work **entirely from this list**. You do **not** need access to our main codebase — build the
component self-contained, against the list, with its own storage. We will integrate it on our side.

## The tasks

### 1. Resolve each ticker to its exchange
For every ticker, determine the exchange it trades on. This matters because it decides which news
provider and which symbol format actually work (a US listing, an exchange-suffixed foreign listing,
and an ADR are three different fetch paths — your MVP already ran into exactly this).

### 2. Resolve *all* exchanges a company is listed on
Task 1 is the primary listing; here, go wider — a company can be listed on multiple exchanges, and
many foreign companies also trade in the US as ADRs. Capture the **set** of listings per company
(exchange + the symbol format used there), because a US ADR often has news where the home-exchange
symbol returns nothing. Store this mapping; it's a first-class input to the fetch, not a side note.

### 3. Compare the news options — for *our actual catalogue*
Extend the comparison from the first assignment, but grounded in this real set, not the sample.
Research the available options (dedicated financial-news APIs, general search/news APIs, LLM tools
such as Perplexity, or a hybrid) and compare them on:

- **Price** at our scale (~2k companies, daily) — free tiers, paid tiers, what a full run costs.
- **Coverage** — which exchanges / countries / companies each actually returns news for. Be
  concrete: run them against a real slice of the list and report hit rates, not marketing claims.
- **Quality** — structured vs free-text, dedupeability, ticker-native vs name-matched, latency.
- **Operational cost** — rate limits, reliability, what it takes to run unattended.

Then pick a primary + fallback stack and say why. **Priority: US-listed companies must work well
first.** International is a fallback tier — get the US path solid, then extend coverage outward.
We will read this write-up as carefully as the code.

### 4. Build the backend component
Implement a working news backend for the current catalogue. It fetches and stores news per company,
is designed to run daily on a schedule, and is built so we can plug it into a microservice
architecture. **Define the interfaces and boundaries yourself** — the design is part of what we're
evaluating — but it should satisfy the criteria below.

## Design criteria for the component

Build it as a component that could stand alone as its own service. Concretely:

1. **Self-contained process.** Runs on its own (one command / a Dockerfile), configured entirely by
   environment variables, with **its own storage** (its own database/schema for companies, listings,
   articles, and fetch-runs). It must not assume access to any other system's database.
2. **A clean, documented API** — the contract we integrate against. At minimum:
   - list tracked companies (and their resolved exchanges/listings),
   - get a company's news feed (paginated, filterable by date),
   - trigger a fetch on demand (we won't wait a day to test it),
   - a health/status endpoint and a way to see the last run's outcome.
   REST/HTTP is fine; document the shapes.
3. **Provider-agnostic source layer.** Each news source (Finnhub, Google News RSS, whatever you add)
   sits behind **one common adapter interface**, chosen and ordered by config. Adding or swapping a
   provider should be a plug-in, not a rewrite. This is the single most important design property —
   it's how we'll register news as one source among several later.
4. **A stable, dedupeable article schema.** A canonical per-article record (a stable id/hash,
   company reference, headline, url, source, published-at, …). Ingest is **idempotent** — a daily
   re-run must not create duplicates.
5. **Schedulable, incremental ingest.** Designed to run daily unattended, with an on-demand trigger,
   safe to re-run, using a lookback window / since-last-run so it doesn't refetch everything.
6. **Observability at scale.** Per-run, per-provider, per-company outcome — and keep the distinction
   your MVP already got right: **"no news" (a clean zero-result) is not the same as "provider
   refused" (a 403 / access denial).** We need to alert on those differently.
7. **Resilience.** Respect rate limits (backoff/retry), isolate partial failures (one company
   failing doesn't sink the run), and make a re-run after a crash safe.

## Think past the happy path

Same spirit as last time — imagine this running unattended on the full 2k catalogue for months.
Where does it break first? What silently goes wrong that nobody notices (a provider quietly
dropping coverage, a symbol format changing, a company delisting/renaming, duplicate or misattributed
articles)? What would you want to see when it misbehaves and no one is watching? You won't build all
of it — build what you can and **write down the rest: what you'd do next, and where you deliberately
stopped.** Telling us what you chose *not* to do is worth as much as the code.

## Deliverables

- A git repo with the backend component + a README we can follow literally (prerequisites, install,
  env/API-key template, how to start it, **how to trigger a fetch on demand**, roughly how long a
  full run takes and what it costs the first time).
- The comparison write-up (in the repo is fine) — one or two pages.
- The resolved exchange/listing mapping for the catalogue (as data + how you produced it).

## Notes

- **US-listed first.** Get the US path solid and well-covered before spending time on international
  coverage.
- If you want a paid API, tell us which one and we'll provision a key — don't pay for anything
  yourself.
- If anything is ambiguous, ask.
