# Running this unattended

The brief asks where this breaks first if it runs on the full catalogue for
months with nobody watching. This is that answer: the failure modes in the
order I expect them, what the component already does about each, and what it
deliberately does not.

The organising principle throughout: **the dangerous failures are the silent
ones.** A run that crashes gets noticed. A run that succeeds while quietly
returning nothing for 300 companies does not.

---

## 1. The catalogue is wrong, and stays wrong

**This already happened.** The supplied file contradicts itself in ways that
would corrupt the feed rather than break it:

| Problem | Count | What it would do untreated |
| --- | --- | --- |
| `is_us_listed` disagrees with the exchange hint | 128 | wrong provider chosen, wrong symbol format |
| `country` disagrees with the exchange | 46 | wrong locale for name-based search |
| Exchange hint missing | 62 | no way to disambiguate the ticker |
| Exchange hint unrecognised | 3 | same |
| One normalised name under several tickers | 176 | duplicate feeds, or a merged one |
| Ticker resolves to a different company than named | see below | **one company's news filed under another** |

The last row is the one that matters. `BBY` in this catalogue is Balfour
Beatty, but `BBY` on a US exchange is Best Buy. `ADM` is Admiral Group here and
Archer-Daniels-Midland in New York. Six more behave the same way. Nothing about
these fails: you get a full, plausible, completely wrong feed.

**What the component does.** Resolution never trusts a ticker, and never trusts
an exchange hint either — narrowing `ADM` to London *still* returns
Archer-Daniels-Midland, because it cross-lists there. Every candidate is scored
against the catalogue's company name and rejected below a threshold. Raw
supplier values are stored untouched in `*_raw` columns beside the resolved
truth, so the mapping is also the evidence of what was wrong.

**What it does not do.** It does not correct the source file, and it does not
attempt automated reconciliation of the 176 duplicate names — some are genuine
cross-listings that Task 2 merges, others are separate share classes that must
stay separate. That needs a human decision per case.

---

## 2. A provider quietly drops coverage

The classic silent failure. A plan changes, an exchange is dropped, a symbol
format changes — and the response is still `200 OK` with `[]`.

**What the component does.** It refuses to collapse "nothing happened" into
"nothing returned". Provider outcomes are a taxonomy, not a count:

- `no_news` — the provider answered cleanly with zero results. Normal.
- `refused` — 401/403. The provider will not serve us. **Not normal.**
- `rate_limited`, `error`, `unresolved`, `skipped` — each distinct.

These travel from the adapter into `fetch_run_companies` and out through
`GET /v1/runs/:id/companies?outcome=refused`. An alert on `refused` fires the
day a plan changes; an alert on raw article counts would not fire for weeks.

**The alert I would actually set**: `refused > 0`, `degradedProviders`
non-empty, and `no_news` share moving more than ~15 points week over week.

The middle one was added after this component caught itself. A full run
reported `succeeded`, 0 refused, 0 failed — and 156 companies with perfectly
good US listings had quietly been served by name-based search instead of
Finnhub, because a too-tight per-company timeout was firing while requests sat
in the local rate-limiter queue. The run summary looked healthy the entire
time. Every provider attempted for a company is now recorded, so that class of
failure is a query rather than a coincidence:

```sql
SELECT attempt->>'provider' AS failed, f.provider AS then_served_by, count(*)
  FROM fetch_run_companies f, LATERAL jsonb_array_elements(f.provider_attempts) attempt
 WHERE f.run_id = $1 AND attempt->>'outcome' NOT IN ('ok','no_news')
 GROUP BY 1, 2;
```

The lesson generalises: **a fallback that works is indistinguishable from a
primary that works, unless you record the difference.**

**What it does not do.** There is no automatic provider failover on degradation
— only per-company fallthrough. Demoting a failing provider is a config change
(`NEWS_PROVIDER_ORDER`) and a restart, deliberately: automatic failover between
sources with different quality characteristics silently changes what the data
means.

---

## 3. The job stops running

A scheduler is removed, a container never restarts, a lock is never released.
No errors, because nothing is running to produce them.

**What the component does.** `GET /v1/status` reports `hoursSinceFinished` and
a `stale` flag (>36h). This is the cheapest high-value monitor in the whole
system and the first one I would wire to a pager.

The ingest is a standalone process, not an in-process timer, so a crashed API
does not stop the daily fetch and a wedged fetch does not take the API down.
The in-process scheduler exists (`SCHEDULER_ENABLED`) but is off by default,
and takes a Postgres advisory lock so replicas cannot double-fetch.

**A caution specific to tiered schedules.** Running `--tier hot` hourly and a
full sweep daily means a failure of the *daily* job is much less visible: the
hourly job keeps succeeding, `stale` never trips, and the quiet 800 companies
silently stop updating. If you adopt tiering, alert on the full sweep
specifically — `GET /v1/runs?limit=50` and check that a run with
`notes->>'tier' = 'all'` completed in the last 36 hours. A partial schedule
that keeps working is exactly the kind of failure this document is about.

---

## 4. Duplicate and misattributed articles

Two distinct problems that look alike in a feed.

**Duplicates.** Handled structurally. The canonical URL (tracking parameters
stripped, host and scheme normalised, AMP suffixes collapsed) is the unique
key, so a re-run over an overlapping window inserts nothing. A second key over
(normalised headline, publication day) catches wire copy syndicated to several
outlets under different URLs. Verified: re-running an identical window over ten
companies saw 396 articles and inserted 0.

**Misattribution** cannot be solved structurally, so it is made visible instead.
Ticker-native results carry `match_method = 'ticker'`; name-searched results
carry `name_match` and a lower confidence. A consumer that cannot tolerate a
name collision filters on `match_method=ticker`. Hiding the difference would be
the actual failure.

**What it does not do.** No entity resolution on article *bodies* — a story
about "Apple" the record label would still be filed under Apple Inc. if a name
search returned it. Ticker-native providers avoid this; the name-based fallback
does not, which is why it is the fallback.

---

## 5. Companies change underneath you

Delistings, renames, re-tickerings, acquisitions. Every one of these turns a
working symbol into a permanently dead one.

**What the component does.** A company absent from a reloaded catalogue is
deactivated, never deleted, so its article history survives a supplier
revision. A company whose name or exchange hint changes is automatically marked
`pending` and re-resolved. After five consecutive failures a company is
suppressed for 24 hours so the run stops paying for calls that cannot succeed —
and the suppression always expires, because a permanent silent drop is exactly
the failure being avoided.

**What it does not do.** There is no corporate-actions feed. A merger is
noticed only as a rising failure count, which is late.

---

## 6. Scale and rate limits

At ~1,500 companies daily this is comfortable — a run is minutes, and the
free-tier budgets hold. Two things break before the others as it grows:

- **The rate limiter is in-process.** Two ingest replicas against one provider
  key would each think they had the full budget. Horizontal scaling of the
  ingest requires a shared token bucket; the single-worker design is a
  deliberate limit, not an oversight.
- **`articles` grows without bound.** ~1,500 companies producing a handful of
  stories a day is single-digit millions of rows a year — fine for Postgres
  with the indexes present, but there is no retention policy. Monthly
  partitioning on `published_at` is the obvious next step.

---

## What I would build next, in order

1. **Shared rate limiting** (Redis token bucket), which is the precondition for
   running more than one ingest worker.
2. **Alerting on the signals that already exist** — `stale`, `refused`, and
   week-over-week `no_news` drift. The data is all recorded; nothing consumes
   it yet.
3. **A paid ticker-native provider for the international tier**, replacing
   name-based search where budget allows. This is a coverage *quality* upgrade,
   not a coverage *quantity* one — see the comparison write-up.
4. **Retention and partitioning** on `articles`.
5. **Human review queue** for the 176 duplicate-name groups, the 41 companies
   that still do not resolve, and any company resolved below a confidence
   floor.

## Where I deliberately stopped

- **No authentication.** The component is designed to sit behind a gateway.
  `POST /v1/fetch` does real outbound work and is unauthenticated; that is a
  deployment assumption, and it is stated rather than hidden.
- **No article body extraction.** Headlines, URLs and provider summaries only.
  Fetching and parsing publisher pages is a different problem with its own
  failure modes, and the brief did not ask for it.
- **No sentiment, classification, or summarisation.** No language model is
  involved anywhere in this component. Article text is untrusted third-party
  input; feeding it to a model would introduce a prompt-injection surface for
  no requirement.
- **No UI.** The brief said backend only.
