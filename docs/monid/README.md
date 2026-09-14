# Monid

**Status: integrated and verified with live data (15 September 2026).**

The integration is built in the [MVP's Monid feature](https://github.com/1nsar/investing-com/tree/main/src/features/monid): the `/monid` page and the **Signals** tab on each company page. This folder holds the original provider evaluation and the verification record.

## What it does

| Data set | Monid tool | Verified for AAPL |
| --- | --- | --- |
| Insider trades | `marketbeat` `/get_insider_trades` | 69 transactions |
| Earnings | `nasdaq` `/get_stock_earnings` | 8 periods |
| Headlines | `marketbeat` `/get_stock_headlines` | 7 articles |
| SEC filings | `nasdaq` `/get_stock_sec_filings` | 14 filings |

Each call costs about $0.01. Data loads only when requested, is cached for 6 hours, and is limited by a daily call cap. The API key stays on the server. See [verification](verification.md).

## Research (9 September 2026)

Before integrating, the evaluation inspected 70 finance tools and 26 news listings, reconciled catalogue prices, and modelled costs for 10 and 100 users. The shortlist included Context.dev, Akta and DefiLlama, with Quartr and Fiscal.ai as direct alternatives. Coverage beyond the verified tickers and customer-display rights still need confirmation.

- [Integration assessment and shortlist](integration-assessment.md)
- [Finance-tool coverage and cost model](finance-tools.md)
- [CSV inventories](inventories)
- [Word, PDF and workbook exports](reports)
- [Catalogue and review evidence](evidence)
- [Screenshot](screenshots)
- [Report-generation scripts](../../scripts/monid)
