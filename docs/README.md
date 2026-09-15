# News service documentation

Each folder starts with a short README, followed by detailed reports, screenshots and dated evidence.

## News (built in this service)

| Task | Start here | Contents |
| --- | --- | --- |
| Original Global News | [global-news](global-news/README.md) | API, provider comparison, source analysis and service report |
| Global News 2 | [global-news-v2](global-news-v2/README.md) | Architecture, providers, screenshots and verification evidence |

## Market data (built in the MVP website)

All four sources, and the cross-provider review, are in [polymarket-kalshi-monid-bloomberg](polymarket-kalshi-monid-bloomberg/README.md).

| Task | Start here | Status | Contents |
| --- | --- | --- | --- |
| Polymarket | [polymarket](polymarket-kalshi-monid-bloomberg/polymarket/README.md) | Prices verified; streaming blocked by Polymarket keys | Verification, data inventory, exports, screenshots, evidence |
| Kalshi | [kalshi](polymarket-kalshi-monid-bloomberg/kalshi/README.md) | Verified live; production use needs Kalshi's permission | Verification and catalogue evidence |
| Monid | [monid](polymarket-kalshi-monid-bloomberg/monid/README.md) | Verified live | Verification, integration assessment, cost model, inventories, exports |
| Bloomberg | [bloomberg](polymarket-kalshi-monid-bloomberg/bloomberg/README.md) | Rejected (licence) | Decision summary and where Bloomberg identifiers are used |
| Cross-provider review | [data-sources](polymarket-kalshi-monid-bloomberg/data-sources.md) | Research | Bloomberg, Polymarket, Kalshi and ForecastEx |

## Operations and reference

| Topic | Start here |
| --- | --- |
| Deployment | [deployment](deployment/README.md): persistent hosting, Vercel API, secrets and bootstrap |
| API contract | [OpenAPI snapshot](api/openapi.json) |
| Original assignment | [reference/assignment.md](reference/assignment.md) |

Dated research reports describe observations at the stated dates; current source and deployment guides may include later fixes. Commit hashes recorded in dated reports predate repository maintenance.
