# Polymarket verification

> Copied from the MVP website repository. The `npm run` commands below belong to [that repository](https://github.com/1nsar/investing-com).

## 15 September 2026

Checked against the running local application. Credentials were read server-side and are not recorded here. No trading requests were made.

**Public market data works. Authenticated streaming is rejected by Polymarket.**

| Check | Result |
| --- | --- |
| `/polymarket` page | HTTP 200 |
| Event search (`q=Fed`) | 8 events |
| Market `cbpac-fed-gt25bps-2026-12-31` | Definition, quote, order book and history returned; no adapter errors |
| Related Fed news | 4 articles, not stale |
| Offline tests (`npm run test:polymarket`) | 24 passed |
| Streaming route | Connection attempted, then reported failure |
| Signed WebSocket handshake to `wss://api.polymarket.us/v1/ws/markets` | **HTTP 401 `API key not found`** |

The streaming failure was isolated from this application:

- Two separately created keys both returned `401 API key not found`.
- The official `polymarket-us` TypeScript SDK (0.1.1) returned the same error for `portfolio.positions` and `account.balances`, and its own market WebSocket also failed.
- The failure was identical on an office network and a personal hotspot; the TLS certificate was Polymarket's own (Google Trust Services).
- Local and server clocks agreed within one second. Each secret decoded to a valid 64-byte Ed25519 key whose embedded public key matched its seed.

Conclusion: the signing code matches the [official authentication guide](https://docs.polymarket.us/api-reference/authentication), but Polymarket does not recognize the account's keys. The account needs API access confirmed by Polymarket US support. The page keeps working through 10-second REST polling, and streaming needs no code change once the keys are accepted.
