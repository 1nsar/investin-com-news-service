# Investment News Service

The backend for the [Investment Research MVP](https://github.com/1nsar/investing-com). It serves company news and official releases from PostgreSQL. The website lives in the separate MVP repository.

## Find a task

| Area | Task | Implementation | Reports and evidence |
| --- | --- | --- | --- |
| News | Global News (original) | [src/features/global-news](src/features/global-news) | [Global News](docs/global-news/README.md) |
| News | Global News 2 | [src/features/global-news-v2](src/features/global-news-v2) | [Global News 2](docs/global-news-v2/README.md) |
| Market data | Polymarket | [MVP `/polymarket`](https://github.com/1nsar/investing-com/tree/main/src/features/polymarket) | [Polymarket](docs/polymarket/README.md) |
| Market data | Kalshi | [MVP `/kalshi`](https://github.com/1nsar/investing-com/tree/main/src/features/kalshi) | [Kalshi](docs/kalshi/README.md) |
| Market data | Monid | [MVP `/monid`](https://github.com/1nsar/investing-com/tree/main/src/features/monid) | [Monid](docs/monid/README.md) |
| Operations | Hosting and database setup | [src/deployment](src/deployment) | [Deployment](docs/deployment/README.md) |
| Operations | API contract | [src/api](src/api), feature routes | [V1 API reference](docs/global-news/api.md), [OpenAPI snapshot](docs/api/openapi.json) |

Each task folder starts with a short README. Detailed documents, downloadable reports, screenshots and dated evidence are kept with that task. Polymarket, Kalshi and Monid run in the MVP website; this repository keeps their research and verification records.

## Local development

Use Node.js 22, npm and PostgreSQL. On a fresh checkout install dependencies and create your local configuration:

```sh
npm ci
cp -n .env.example .env
```

Set `DATABASE_URL` to your local database. For Global News 2, configure `NEWS_V2_ADMIN_TOKEN` and `NEWS_V2_ENCRYPTION_KEY`; the MVP server must use the same token. Keep existing encryption keys when reusing a database.

To initialize a new database, run `npm run migrate` and `npm run catalogue:load`. Listing resolution is a separate operation; [production bootstrap](docs/deployment/persistent.md) can import the reviewed snapshot without provider calls.

```sh
npm run dev
```

The API defaults to port 8080. `/health` checks the process; `/ready` checks database connectivity; `/docs` serves interactive API documentation. When the checkout is nested inside the MVP, its `npm run dev:news-v2` command starts the V2-only service and worker on port 8081.

## Layout

```text
src/features/global-news/     Original feeds, matching and ingestion
src/features/global-news-v2/ Official-source and optional-provider news
src/api/                     Shared server and health endpoints
src/catalogue/               Company identity and listing imports
src/db/                      PostgreSQL access and SQL migrations
src/config/                  Environment and runtime settings
src/deployment/              Offline production bootstrap
scripts/global-news/         Collection and analysis commands
scripts/monid/               Monid report generation
scripts/polymarket/           Polymarket report generation
test/                        Tests grouped by feature
docs/                        Guides, research, reports and evidence by task
                             (global-news, global-news-v2, polymarket, kalshi, monid, deployment)
data/                        Tracked catalogue and listing snapshots
```

## Build and test

```sh
npm run build
npm test
```

Database integration tests are opt-in; see the relevant tests and deployment guide for the isolated test-database requirements.

## Deploy

- [Persistent service](docs/deployment/persistent.md): API, PostgreSQL and a continuously running ingestion worker.
- [Vercel API](docs/deployment/vercel.md): request handling and durable job enqueueing; ingestion runs on a separate persistent worker.

Production requires a database, an admin token and a persistent encryption key. The Vercel API is not a static site and does not serve the MVP website.
