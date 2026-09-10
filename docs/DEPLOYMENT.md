# Persistent news-service deployment

This service runs as a persistent Node process with PostgreSQL and an in-process, bounded V2 worker. Run it behind the authenticated MVP server or a private network. The browser must never receive the backend bearer, encryption key or provider credentials. This deployment is one shared team workspace, not tenant isolation for separate customers.

## Required production environment

| Variable | Required setting |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL URL containing a host, user and database; use the managed provider's verified TLS configuration for remote connections, normally `sslmode=verify-full` |
| `NEWS_V2_ADMIN_TOKEN` | New random secret of at least 32 non-whitespace characters; the MVP server sends it as `Authorization: Bearer …` |
| `NEWS_V2_ENCRYPTION_KEY` | Exactly 32 random bytes, encoded as canonical base64 or hexadecimal; preserve securely with database backups |
| `HOST` | `0.0.0.0` inside the container |
| `PORT` | Hosting platform's assigned port; default `8080` |
| `NEWS_V2_ONLY` | `false` for the original global-news/catalogue features plus V2; `true` intentionally omits all V1 routes |
| `NEWS_V2_WORKER_ENABLED` | `true` to keep official feeds refreshing |
| `SCHEDULER_ENABLED` | `false`; the legacy provider scheduler is separate from the V2 worker |
| `NEWS_V2_ALLOW_PAID_PROVIDERS` | `false` initially; production defaults to disabled when omitted |
| `DATABASE_POOL_MAX` | Default `10`; budget total connections across all replicas and release commands |

Missing or malformed production database, token and encryption settings stop startup. Boolean deployment settings must use `true` or `false`. The same validation applies to the offline bootstrap. An internal, isolated PostgreSQL service can use its private network URL; a publicly reachable managed database should require certificate-verified TLS. Do not disable certificate verification to repair a connection.

The production guard covers V1, V2, administration, API docs and future routes. Only GET/HEAD `/health` and `/ready` are public. The old `API_AUTH_TOKEN` is used solely by local V1 collection; hosted clients use `NEWS_V2_ADMIN_TOKEN` consistently. Error responses omit internal database details. Keep all these variables server-side, without a `NEXT_PUBLIC_` prefix.

## Build and initialize

Build the existing Dockerfile, or run `npm ci` followed by `npm run build`. The runtime image includes the compiled migrations, catalogue CSV and listing snapshot. Do not upload `.env`, database dumps, user data or the developer's local database.

Before first API startup, run a one-off release command with the production environment:

```sh
node dist/scripts/bootstrap-production.js
```

For a compiled checkout, `npm run bootstrap:production` runs that entry with `NODE_ENV=production`. The bootstrap:

1. Applies the existing migrations under their PostgreSQL advisory lock.
2. Upserts `data/catalogue/companies-production.csv` and deactivates identities absent from the selected catalogue, preserving their history.
3. Imports `data/listings-mapping.json` only for exact matching pending catalogue identities with no existing listings. Company name, country, exchange hint and US-listing flag must agree. Existing resolutions are preserved.
4. Seeds the reviewed ASML and GOOGL aliases after the data they reference exists. Repeated seeds preserve disabled reviews and their original expiry dates; conflicts do not become ticker overrides.

This operation makes no provider requests and starts no worker. The included snapshot has 2,026 rows covering 1,515 catalogue identities; not every row is a resolved listing. Its source and confidence remain visible. Imported companies are explicitly marked as snapshot imports, with no new live verification claimed. Broad company-news coverage is not established by loading identifiers.

Use `CATALOGUE_FILE` and `LISTINGS_SNAPSHOT_FILE` only for reviewed replacements. The catalogue is an authoritative complete list, so supplying a partial CSV deactivates other companies. Back up an existing cloud database before changing those inputs. Further listing resolution is a separate explicit `resolve` operation and may contact external providers; production provider access must be enabled deliberately for that operation.

Then start the persistent service:

```sh
node dist/src/api/server.js
```

`npm start` is equivalent. Do not replace this process with an invocation that ends after responding: its worker checks queued/due work on a timer. PostgreSQL stores jobs, leases, budgets and checkpoints across restarts. Default free-provider refresh is 15 minutes with 600 requests per provider per UTC day; quotas, upstream access failures and batch continuation can delay individual updates.

The repository's `docker-compose.yml` is the local-development workflow, explicitly bound to loopback with development mode. It is not a production deployment file. Use the top-level MVP deployment configuration or a host-specific private service definition for production.

## Provider controls

Official Fed, ECB and SEC definitions default to enabled; some upstream networks may still refuse access. Paid V2 definitions default to disabled and unconfigured. On a production host, `NEWS_V2_ALLOW_PAID_PROVIDERS=false` also makes imported paid configurations inactive and rejects enabling them through the API. The same switch blocks legacy aggregator collection and provider-directory downloads. Stored content and encrypted settings are preserved.

Changing the host flag to `true` only permits configuration. A paid source still needs its API credentials, an enabled connection and the provider's applicable display permission; full text has its own setting. A website subscription alone is not proof of API or redistribution rights. Keep connectors disabled until their actual agreement covers this shared workspace.

## Verification and recovery

Use `/health` for liveness and `/ready` for database readiness. Both should return 200 on a ready host; a database failure returns a generic readiness 503 while liveness remains 200. An unauthenticated `/v1/companies`, `/v2/news`, `/v2/providers`, `/v1/fetch` or `/docs` must return 401. With the server bearer, verify both company directories, official-feed timestamps and internal article reads through the authenticated MVP proxy.

Enable managed PostgreSQL backups and point-in-time recovery where available. Keep an encrypted backup of `NEWS_V2_ENCRYPTION_KEY` separately; restoring PostgreSQL without the matching key makes stored provider credentials unreadable. Rehearse restore into a new private database, run the release command there only after checking the input catalogue, and point a protected preview at it. Verify stored article/job counts, identities and provider-disabled status before changing the production connection. Do not reset or repoint the local MVP database as part of a deployment test.

The opt-in `test/deployment-bootstrap-db.test.ts` suite requires a fresh database named `news_deploy_test_*` on a Unix socket under `/private/tmp/news-deploy-pg.*`; it refuses ordinary workspace databases. It verifies migration-before-catalogue ordering, fresh alias matches, repeated bootstrap, preserved disabled aliases and conflict rejection. Ordinary tests use mocked database access and synthetic credentials.
