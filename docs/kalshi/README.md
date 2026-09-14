# Kalshi

**Status: implemented and verified with live data (15 September 2026).**

The page is built in the [MVP's Kalshi feature](https://github.com/1nsar/investing-com/tree/main/src/features/kalshi) at `/kalshi`. This folder holds the verification record and evidence.

## What it does

- Lists open Kalshi events by topic (economy, politics, crypto, sports) and by search.
- Shows each contract's YES/NO prices, best bid and ask, order book, and one-day or one-week price history, refreshed every 10 seconds.
- Uses Kalshi's public Trade API v2 (`api.elections.kalshi.com`). Market data needs no key; no trading is performed.

## How discovery works

Kalshi has no public search and keeps over 12,000 events open. The server indexes every open event without markets (about 7 MB, about 20 seconds), refreshes it every 15 minutes, and loads markets only for the matches it shows. Loading every event with its markets measured 243 MB and was rejected.

## Contents

- [Verification](verification.md): live results and the findings that changed the implementation
- [Evidence](evidence/2026-09-15): measured catalogue size and category counts

Some corporate firewalls block `kalshi.com`; the live checks passed from a personal hotspot.
