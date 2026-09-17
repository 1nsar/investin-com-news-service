# Polymarket, Kalshi, Monid and Bloomberg

Research, verification and evidence for the market-data sources. The cross-provider review also covers ForecastEx, a CFTC-regulated exchange that publishes daily prices and is recommended for evaluation alongside Polymarket US. The working integrations run in the [MVP website](https://github.com/1nsar/investing-com/tree/main/src/features/polymarket-kalshi-monid-bloomberg), under its **Market data** menu.

| Source | Decision and status | Guide |
| --- | --- | --- |
| Polymarket | Integrated (`/polymarket`). Prices verified on 15 September 2026; live streaming is implemented but Polymarket rejects the account's API keys. Company usage rights unresolved | [polymarket](polymarket/README.md) |
| Kalshi | Integrated as an internal preview (`/kalshi`), verified live on 15 September 2026. The developer agreement restricts display and storage of its data, so production use needs Kalshi's permission | [kalshi](kalshi/README.md) |
| Monid | Integrated (`/monid` and company **Signals** tab). All four data sets verified live on 15 September 2026 | [monid](monid/README.md) |
| Bloomberg | Rejected: the licence forbids storing, redistributing and automated use of its data | [bloomberg](bloomberg/README.md) |

## Cross-provider review

- [Data-sources review](data-sources.md) / [Russian version](data-sources.ru.md): Bloomberg, Polymarket, Kalshi and ForecastEx, with licence findings and the recommended pilot
- [PDF exports](reports): the same review as downloadable reports

The review's Polymarket section was last updated on 9 September 2026; its Bloomberg and Kalshi sections come from the earlier review. The Kalshi and Polymarket verification records are newer and describe the working integrations.

## Scripts

Report generators are in [scripts/polymarket-kalshi-monid-bloomberg](../../scripts/polymarket-kalshi-monid-bloomberg). They rebuild exports from saved evidence and make no network requests.
