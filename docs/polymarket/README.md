# Polymarket

**Status: dashboard implemented; public prices verified; live streaming blocked by Polymarket (15 September 2026).**

The page is built in the [MVP's Polymarket feature](https://github.com/1nsar/investing-com/tree/main/src/features/polymarket) at `/polymarket`. This folder holds the research, verification and evidence.

## What it does

- Searches Polymarket US events and shows YES/NO prices, best bid and ask, order book and price history, refreshed every 10 seconds, with related reporting from our news providers.
- Uses the public REST API, which needs no key. No trading is performed.
- Live streaming over Polymarket's authenticated WebSocket is implemented. Polymarket currently answers the account's keys with `401 API key not found`, including through its official SDK, so the account needs API access confirmed by Polymarket US support. See [verification](verification.md).

Commercial use and customer display of the data are not established; see the data inventory.

## Contents

- [Verification](verification.md): live results for prices and streaming
- [Data inventory](data-inventory.md) / [Russian version](data-inventory.ru.md)
- [Word, PDF and workbook exports](reports)
- [Screenshots](screenshots)
- [Dated API and browser evidence](evidence)
- [Report-generation script](../../scripts/polymarket/build-polymarket-inventory.py)

Evidence timestamps identify observations, not current market prices.
