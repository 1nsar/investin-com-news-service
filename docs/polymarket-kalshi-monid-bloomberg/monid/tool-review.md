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

- **Speed:** median 4.4s, slowest 11.3s. No run needed a retry, and the three failures came back immediately.
- **Price:** 55 tools cost $0.01 a call. MarketBeat's financial statements and analyst ratings cost $0.02. Yahoo Finance's five cost $0.05. DefiLlama's eight cost **$0.0006**, by far the cheapest in the catalogue.
- **Shape:** 54 tools returned a list of records; 13 returned a single record (quotes, overviews, ratio sets), which the page shows as field/value pairs.
- **Accuracy spot-checks:** Apple's price agreed across MarketBeat, StockAnalysis and DefiLlama ($332.41). MarketBeat and SECForm4 independently reported the same Apple insider sale (Jennifer Newstead, SVP and General Counsel, 8 September).

## Which tools we should actually use

Ranked for this product: a company research workspace with company pages, a catalogue, news and portfolios. Row counts are what each returned for Apple in this test.

### Use now — company page (Signals tab)

| Tool | Why | Returned |
| --- | --- | --- |
| `marketbeat/get_insider_trades` | Who bought or sold, with dates, prices and amounts. Already wired in | 69 rows |
| `marketbeat/get_institutional_ownership` | Which funds hold the stock, position sizes and changes | 103 rows |
| `marketbeat/get_short_interest` | Short interest history and percentage of float | 121 rows |
| `marketbeat/get_analyst_ratings` + `get_stock_forecast` | Consensus rating and price targets, with how they moved over a year | 7 rows each |
| `nasdaq/get_stock_dividend_history` | Ex-dates, amounts, yield and payout ratio | 83 rows |
| `nasdaq/get_stock_sec_filings` | 10-K, 10-Q and 8-K filings with links. Already wired in | 14 rows |
| `marketbeat/get_profitability_metrics` | EPS, P/E, margins, return on equity in one record | 1 record |

All eight together cost about **$0.09** uncached (analyst ratings is $0.02), and nothing for the next six hours.

### Use now — market-wide pages (catalogue, news, dashboard)

These take no ticker: fetch once, cache, and filter locally for every company on screen. That is the cheap way to add data to list pages.

| Tool | Why | Returned |
| --- | --- | --- |
| `finviz/get_insider_trading` | Market-wide insider activity, newest first | 200 rows |
| `finviz/get_market_movers` / `get_screener_results` | Gainers, losers and screened lists | 20 rows each |
| `nasdaq/get_earnings_calendar` | Who reports when, with estimates and surprises | 15 rows |
| `stockanalysis/get_market_movers_premarket` | Pre-market movers before the open | 10 rows |
| `stockanalysis/get_ipo_calendar` | Upcoming and recent listings | 4 rows |
| `secform4/get_insider_sales` / `get_insider_buys` | Market-wide Form 4 activity | 100 and 46 rows |

One refresh of all eight costs about **$0.08**, regardless of how many companies are displayed.

### Use when the feature needs it

| Tool | Use for | Returned |
| --- | --- | --- |
| `yahoo-finance/get_historical_data` | The best daily price history here; $0.05 a call | 251 rows |
| `defillama/equities/v1/filings` | Deep filing history with document links, at $0.0006 a call | 400 rows |
| `nasdaq/get_stock_option_chain` | Option strikes, bids and volume | 60 rows |
| `marketbeat/get_financial_statements` | Quarterly statements as reported | 144 rows |
| `marketbeat/get_competitors` | Side-by-side peer comparison | 22 rows |
| `secform4/get_company_insider_trading` | Insider trades by SEC CIK, to cross-check MarketBeat | 15 rows |
| `finviz/get_stock_news_sentiment` | Headlines with sentiment for one company; needs a ticker despite the market-wide feel | 103 rows |
| `nasdaq/search_symbols`, `marketbeat/search_stocks`, `stockanalysis/search_stocks` | Ticker lookup and autocomplete | 11, 9, 50 rows |

### Skip

- `nasdaq/get_stock_quote` — marketing text, not a price. Our Finnhub quotes already cover this.
- `nasdaq/get_stock_financials` and `stockanalysis/get_stock_financials_income` — labels without figures. Use MarketBeat's statements instead.
- `nasdaq/get_stock_screener` — returns its own filter options. Use Finviz's screener.
- `defillama/equities/v1/statements` — unlabelled number arrays.
- `defillama/equities/v1/dimensions` — date and value pairs with no label saying what is measured.
- `defillama` price-history, ohlcv, companies-list — hand back a download link, so they need a second fetch.
- `secform4/search`, `secform4/get_hedge_fund_portfolio`, `stockanalysis/get_stock_list` — returned nothing for our inputs.
- Fund, ETF and crypto quote tools — untested here; only worth it if we add those asset types.

### Before shipping any of this to customers

Insider, ownership and filing data comes from SEC filings that are free on EDGAR, so for those tools we are paying for convenience. Monid's own terms could not be found, and StockAnalysis disclaims programmatic resale. Internal use is fine today; customer-facing display needs written confirmation.

## Every tool

Verdicts are explained [below the table](#verdicts).

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
