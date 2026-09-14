# Monid verification

> Copied from the MVP website repository. The `npm run` commands below belong to [that repository](https://github.com/1nsar/investing-com).

## 15 September 2026

Checked with the workspace API key through `npm run verify:monid -- AAPL` and the running application. The key is not recorded here.

**All four data sets return real data.**

| Data set | Monid tool | Result for AAPL | Cost |
| --- | --- | --- | --- |
| Insider trades | `marketbeat` `/get_insider_trades` | 69 transactions (date, insider, buy/sell, price, value, shares) | $0.01 |
| Earnings | `nasdaq` `/get_stock_earnings` | 8 rows (period, consensus, earnings) | $0.01 |
| Headlines | `marketbeat` `/get_stock_headlines` | 7 articles (title, link, date, source) | $0.01 |
| SEC filings | `nasdaq` `/get_stock_sec_filings` | 14 filings (form type, filed date, period, owner) | $0.01 |

- The key authenticated with HTTP 200. The wallet started at $1.00.
- The first insider-trades tool tried, `secform4` `/get_company_insider_trading`, requires an SEC CIK rather than a ticker. It was replaced by MarketBeat's ticker-based tool before any paid run of it succeeded.
- Through the application, `/api/companies/AAPL/monid?tool=insiders` returned HTTP 200 in about 6.7 seconds, uncached, with 69 source rows (25 displayed). A run-status check confirmed `COMPLETED` with provider HTTP 200.
- Offline tests (`npm run test:monid`): 8 passed.

The wallet held about $0.95 after verification. This establishes delivery for these four tools and AAPL. It does not establish coverage for every ticker or hosted deployment.
