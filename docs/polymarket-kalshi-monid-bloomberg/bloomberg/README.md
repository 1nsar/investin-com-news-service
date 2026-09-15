# Bloomberg

**Status: reviewed and rejected; not integrated.**

Bloomberg has the strongest data we reviewed. **The blocker is its contract, not its price.**

- The licence, read directly, forbids storing Bloomberg data in a database, sending it to anyone else, using it in an automated system, and connecting from a machine not logged into a Terminal. This service does all four.
- A Terminal seat costs about **$31,980 per year**, and buying one would not help: the restrictions come with it.
- Feeds that need no Terminal are licensed for trading desks, not for showing data to readers.
- The product that allows republishing is sold by topic ("Technology", "Energy"), not by company, so it cannot answer "news about this company".

Full reasoning: [data-sources review, Bloomberg section](../data-sources.md#bloomberg--no).

## Where Bloomberg still appears in the code

These uses do not require a Bloomberg licence:

| Use | Where |
| --- | --- |
| **OpenFIGI**, Bloomberg's free open symbology API, resolves catalogue tickers to exchange listings | [src/features/global-news/resolution/openfigi.ts](../../../src/features/global-news/resolution/openfigi.ts); optional `OPENFIGI_API_KEY` |
| Bloomberg exchange codes and LSE ticker forms (`AV/` for Aviva) are parsed when matching listings | [src/catalogue/exchanges.ts](../../../src/catalogue/exchanges.ts) |
| Articles whose source is Bloomberg, from any news feed, rank as tier-1 (primary wire) sources | [src/features/global-news/ingest/relevance.ts](../../../src/features/global-news/ingest/relevance.ts) |
