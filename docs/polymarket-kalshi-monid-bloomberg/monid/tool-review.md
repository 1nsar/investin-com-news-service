# Monid finance tools: full test review

> Copied from the MVP website repository, where the tools were run. The `/monid` page and its catalogue live in [that repository](https://github.com/1nsar/investing-com/tree/main/src/features/polymarket-kalshi-monid-bloomberg/monid).

**Every tool in Monid's finance catalogue was run once against Apple (AAPL) on 17 September 2026.** Cost: **$0.81** for 70 runs, leaving $0.085 on the workspace wallet. Each run used the tool's own input schema; nothing was retried.

| Result | Tools |
| --- | --- |
| Good | 55 |
| Weak | 4 |
| Untested | 3 |
| Empty | 3 |
| Extra step | 3 |
| Avoid | 1 |
| Fair | 1 |

- **Speed:** median 4.4s, slowest 11.3s. Every run completed on the first attempt.
- **Price:** $0.01 per call for 65 tools; Yahoo Finance's five cost $0.05.
- **Shape:** 54 tools returned a list of records; 13 returned a single record (quotes, overviews, ratio sets), which the page shows as field/value pairs.
- **Accuracy spot-checks:** Apple's price agreed across MarketBeat, StockAnalysis and DefiLlama ($332.41). MarketBeat and SECForm4 independently reported the same Apple insider sale (Jennifer Newstead, SVP and General Counsel, 8 September).

Read the [verdict guide](#verdicts) below the table.

## Every tool

| Tool | Verdict | Rows | Time | Input used | Notes |
| --- | --- | --- | --- | --- | --- |
| `nasdaq/get_stock_earnings` | Good | 8 | 5.2s | symbol=AAPL | Returned 8 rows: type, period, consensus, earnings. |
| `nasdaq/get_stock_screener` | Weak | 60 | 4.4s | none | With no filters it returns the screener's own filter options (country list), not stocks. |
| `nasdaq/get_earnings_calendar` | Good | 15 | 4.2s | none | Returned 15 rows: lastYearRptDt, lastYearEPS, time, symbol. |
| `nasdaq/get_stock_sec_filings` | Good | 14 | 4.2s | symbol=AAPL | Returned 14 rows: companyName, reportingOwner, formType, filed. |
| `nasdaq/get_mutual_fund_quote` | Untested | — | 5s | symbol=AAPL | Failed because a stock ticker was sent; retest with a fund symbol such as VFIAX. |
| `nasdaq/get_stock_dividend_history` | Good | 83 | 4.2s | symbol=AAPL | Returned 83 rows: exOrEffDate, type, amount, declarationDate. |
| `nasdaq/get_stock_quote` | Avoid | 1 | 4.6s | symbol=AAPL | Returns Nasdaq marketing "attributes" (headline, eventTypes), not a price quote. |
| `nasdaq/search_symbols` | Good | 11 | 4.4s | query=Apple | Returned 11 rows: metadata, score, suggestedWord, relevancy_score. |
| `nasdaq/get_market_indices` | Good | 1 | 4.4s | none | Returned 1 rows: symbol, companyName, lastSalePrice, previousClose. |
| `nasdaq/get_stock_historical_quotes` | Good | 10 | 4.3s | symbol=AAPL | Returned 10 rows: date, close, volume, open. |
| `nasdaq/get_stock_institutional_holdings` | Good | 10 | 4.6s | symbol=AAPL | Returned 10 rows: ownerName, date, sharesHeld, sharesChange. |
| `nasdaq/get_market_movers` | Good | object | 4.4s | none | Returns nested tables per mover category; shown as field/value pairs. |
| `nasdaq/get_etf_quote` | Untested | — | 4.3s | symbol=AAPL | Failed because a stock ticker was sent; retest with an ETF such as SPY. |
| `nasdaq/get_cryptocurrency_quote` | Untested | — | 4.5s | symbol=AAPL | Failed because a stock ticker was sent; retest with a pair such as BTC. |
| `nasdaq/get_stock_news` | Good | 10 | 4.6s | symbol=AAPL | Returned 10 rows: ago, created, description, id. |
| `nasdaq/get_stock_financials` | Weak | 34 | 4.2s | symbol=AAPL | Row labels with empty value columns; the figures did not come through. |
| `nasdaq/get_index_detail` | Good | 1 | 4.4s | none | Returned 1 rows: symbol, companyName, lastSalePrice, previousClose. |
| `nasdaq/get_stock_short_interest` | Good | 24 | 4.4s | symbol=AAPL | Returned 24 rows: settlementDate, interest, avgDailyShareVolume, daysToCover. |
| `nasdaq/get_stock_option_chain` | Good | 60 | 8.1s | symbol=AAPL | Returned 60 rows: expirygroup, expiryDate, c_Last, c_Change. |
| `nasdaq/get_retail_trading_activity` | Good | 5 | 4.3s | none | Returned 5 rows: ticker, activity, sentiment, url. |
| `yahoo-finance/get_historical_data` | Good | 251 | 4.2s | symbol=AAPL | Returned 251 rows: timestamp, open, high, low. |
| `yahoo-finance/get_company_profile` | Good | 10 | 8s | symbol=AAPL | Returned 10 rows: maxAge, name, age, title. |
| `yahoo-finance/get_stock_news` | Good | 20 | 8.4s | symbol=AAPL | Returned 20 rows: uuid, title, publisher, link. |
| `yahoo-finance/get_quote` | Good | 1 | 4.4s | symbols=AAPL | Returned 1 rows: language, region, quoteType, typeDisp. |
| `yahoo-finance/search_tickers` | Good | 7 | 7.9s | query=Apple | Returned 7 rows: exchange, shortname, quoteType, symbol. |
| `finviz/get_screener_results` | Good | 20 | 4.3s | none | Market-wide screener; takes no ticker. |
| `finviz/get_insider_trading` | Good | 200 | 8.1s | none | Market-wide feed: takes no ticker, so filter locally. |
| `finviz/get_ticker_sectors_with_performance` | Good | 1 | 7.9s | tickers=AAPL | Returned 1 rows: ticker, finviz_ticker, company_name, sector. |
| `finviz/get_stock_news_sentiment` | Good | 103 | 4.4s | ticker=AAPL | Returned 103 rows: ticker, date, time, headline. |
| `finviz/get_market_movers` | Good | 20 | 4.5s | none | Market-wide list; takes no ticker. |
| `marketbeat/get_financial_statements` | Good | 144 | 8.2s | ticker=AAPL | Returned 144 rows: Metric, col_1, Q1 2024, Q2 2024. |
| `marketbeat/get_institutional_ownership` | Good | 103 | 4.3s | ticker=AAPL | Returned 103 rows: Reporting Date, Major Shareholder Name, Shares Held, Market Value. |
| `marketbeat/get_analyst_ratings` | Good | 7 | 7.9s | ticker=AAPL | Returned 7 rows: Type, Current Forecast9/17/25 to 9/17/26, 1 Month Ago8/18/25 to 8/18/26, 3 Months Ago6/19/25 to 6/19/26. |
| `marketbeat/get_insider_trades` | Good | 69 | 4.4s | ticker=AAPL | Returned 69 rows: Transaction Date, Insider, Buy/Sell, Number of Shares. |
| `marketbeat/search_stocks` | Good | 9 | 4.4s | query=Apple | Returned 9 rows: ticker, exchange, name, url. |
| `marketbeat/get_options_chain` | Good | 51 | 7.9s | ticker=AAPL | Returned 51 rows: Expires, Strike Price, Close Price, Put/Call. |
| `marketbeat/get_stock_overview` | Good | object | 7.7s | ticker=AAPL | One record: price, ranges, volume, market cap. |
| `marketbeat/get_earnings` | Good | 9 | 11.3s | ticker=AAPL | Returned 9 rows: Quarter, Number of Estimates, Low Estimate, High Estimate. |
| `marketbeat/get_competitors` | Good | 22 | 7.9s | ticker=AAPL | Returned 22 rows: category, data. |
| `marketbeat/get_marketrank` | Good | object | 4.6s | ticker=AAPL | One record of scored components. |
| `marketbeat/get_stock_headlines` | Good | 7 | 7.8s | ticker=AAPL | Returned 7 rows: title, url, date, source. |
| `marketbeat/get_short_interest` | Good | 121 | 4.3s | ticker=AAPL | Returned 121 rows: Report Date, Total Shares Sold Short, Dollar Volume Sold Short, Change from Previous Report. |
| `marketbeat/get_profitability_metrics` | Good | object | 6.6s | ticker=AAPL | One record: EPS, P/E, margins, returns. |
| `marketbeat/get_stock_forecast` | Good | 7 | 4.8s | ticker=AAPL | Returned 7 rows: Type, Current Forecast9/17/25 to 9/17/26, 1 Month Ago8/18/25 to 8/18/26, 3 Months Ago6/19/25 to 6/19/26. |
| `stockanalysis/get_stock_list` | Empty | object | 4.3s | slug=sp500 | The "sp500" slug returned an empty list; the accepted slugs are undocumented here. |
| `stockanalysis/search_stocks` | Good | 50 | 4.4s | query=Apple | Returned 50 rows: symbol, name, type, price. |
| `stockanalysis/get_stock_financials_income` | Weak | 53 | 5s | symbol=AAPL | Returns field ids and titles, not the reported values. |
| `stockanalysis/get_market_movers_premarket` | Good | 10 | 4.4s | none | Returned 10 rows: no, s, n, premarketChangePercent. |
| `stockanalysis/get_stock_statistics` | Good | 10 | 4.4s | symbol=AAPL | Returned 10 rows: id, title, value, hover. |
| `stockanalysis/get_ipo_calendar` | Good | 4 | 6.7s | none | Returned 4 rows: s, n, ipoDate, exchange. |
| `stockanalysis/get_stock_overview` | Good | object | 4.2s | symbol=AAPL | One record of abbreviated quote fields (p, h52, l52); needs a field map. |
| `defillama/equities/v1/statements` | Weak | 18 | 3.1s | ticker=AAPL country=US | Bare numeric arrays with no field names. |
| `defillama/equities/v1/filings` | Good | 400 | 3.2s | ticker=AAPL country=US | Returned 400 rows: filingDate, reportDate, form, primaryDocumentUrl. |
| `defillama/equities/v1/summary` | Good | object | 2.3s | ticker=AAPL country=US | One record: price, market cap, valuation ratios. |
| `defillama/equities/v1/price-history` | Extra step | object | 3.3s | ticker=AAPL country=US | Returns a download link rather than inline rows. |
| `defillama/equities/v1/companies-list` | Extra step | object | 2.7s | none | Returns a download link rather than inline rows. |
| `defillama/equities/v1/ohlcv` | Extra step | object | 3.1s | ticker=AAPL country=US | Returns a download link rather than inline rows. |
| `defillama/equities/v1/onchain` | Good | 23 | 2.2s | ticker=AAPL country=US | Returned 23 rows: pair, price, volume24h, openInterest. |
| `defillama/equities/v1/dimensions` | Fair | 170 | 2.2s | ticker=AAPL country=US | Date/value pairs without a label for the measure. |
| `secform4/search` | Empty | object | 4.3s | query=Apple | A plain-language query ("Apple") returned nothing. |
| `secform4/get_13d_filings` | Good | 21 | 4.3s | none | Returned 21 rows: reported_datetime, transaction_date, type, company_symbol. |
| `secform4/get_insider_sales` | Good | 100 | 4.4s | none | Returned 100 rows: transaction_date, reported_datetime, company, company_url. |
| `secform4/get_significant_insider_buys` | Good | 8 | 4.5s | none | Returned 8 rows: transaction_date, reported_datetime, company, company_url. |
| `secform4/get_institution_holders` | Good | 200 | 4.8s | cik=320193 | Returned 200 rows: #, history, holder, moneyFlow. |
| `secform4/get_insider_buy_sell_ratios` | Good | object | 4.8s | none | Market-wide ratio series keyed by index, not per company. |
| `secform4/get_stock_options` | Good | 100 | 7.9s | none | Returned 100 rows: transaction_date, transaction_date_url, reported_datetime, exercisable_expiration. |
| `secform4/get_insider_buys` | Good | 46 | 4.4s | none | Returned 46 rows: transaction_date, transaction_date_url, reported_datetime, company. |
| `secform4/get_company_insider_trading` | Good | 15 | 8.4s | cik=320193 | Returned 15 rows: transaction_date, reported_datetime, company, symbol. |
| `secform4/get_hedge_fund_portfolio` | Empty | object | 9.5s | cik=320193 | Apple's CIK returned an empty table; it likely expects a fund's CIK. |
| `secform4/get_13g_filings` | Good | 14 | 4.6s | none | Returned 14 rows: reported_datetime, transaction_date, type, company_symbol. |

## Verdicts

- **Good** — returned usable, correctly shaped data for the input given.
- **Fair** — usable, but the output needs interpretation before display.
- **Weak** — completed, yet returned labels, options or scaffolding instead of the figures implied by its name.
- **Extra step** — returns a download link instead of inline rows, so it needs a second fetch.
- **Empty** — completed with no content for this input; may work with a different one.
- **Untested** — the run failed because a stock ticker was sent to a fund, ETF or crypto endpoint. Retest with the right symbol type.

## What this does not establish

One call per tool, one company, one day. It does not measure coverage across many tickers, freshness against the source, or reliability over time. It also does not establish the right to show this data to customers: Monid's own terms could not be located, and some upstream providers (StockAnalysis) disclaim programmatic resale. Insider and filing data ultimately originates in free SEC EDGAR filings.
