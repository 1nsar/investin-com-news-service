# Kalshi verification

> Copied from the MVP website repository. The `npm run` commands below belong to [that repository](https://github.com/1nsar/investing-com).

## 15 September 2026

Checked with `npm run verify:kalshi` and the running application. Kalshi market data needs no key. No trading requests were made.

**Live discovery, prices, order books and history work.**

| Check | Result |
| --- | --- |
| Full open-event index | 12,160 events across 61 pages, built in about 19 seconds |
| Economy topic | "Will OpenAI or Anthropic IPO first?" and others |
| Politics topic | "Which G7 leader will leave office next?" and others |
| Crypto topic | 12 events, including "Bitcoin price at the end of 2026" |
| Sports topic | "Who will host the 2038 FIFA World Cup?" and others |
| Search `fed` | Matches across topics, including "Kevin Warsh out as Fed chair?" |
| Market `KXBTCY-27JAN0100-B77500` | 14.2¢ bid / 14.3¢ ask, 156 order book levels, 167 one-week history points, no errors |
| Offline tests (`npm run test:kalshi`) | 10 passed |

## Findings that changed the implementation

- **Open catalogue size.** Kalshi had over 12,000 open events. The first version filtered only the first 600, so the Crypto topic (first appearing on page 12) was empty. Discovery now indexes every open event without markets (about 7 MB) and loads markets only for displayed matches. A full crawl with nested markets measured 243 MB and was rejected.
- **Response fields.** Current markets return only `*_dollars` prices and `*_fp` counts; legacy integer-cent fields are absent. Both forms are accepted.
- **Network blocks.** An office Fortinet firewall intercepted `kalshi.com` with its own certificate. The same checks passed on a personal hotspot.
