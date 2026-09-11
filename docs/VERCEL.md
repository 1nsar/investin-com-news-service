# News API on Vercel

The repository's `vercel.json` selects the Fastify framework and clears any static output directory override. `src/server.ts` is a Vercel-recognized entrypoint that imports Fastify and starts the HTTP listener. Vercel packages it as a Function. The existing `npm start` and Docker entrypoint remain the persistent API and worker service.

This deploys the news API. The website is in the separate `1nsar/investing-com` repository and retains its persistent SQLite deployment requirements.

## Fix the failed deployment

The deployment of `main` at `3d06ef3` compiles successfully, then fails with `No Output Directory named "public" found`. That commit has neither this configuration nor the recognized entrypoint. Redeploying that same commit will repeat the failure.

1. Merge the Vercel support changes into the branch deployed by the project, or select a preview branch containing them.
2. In Vercel Project Settings, use the news-service repository root as Root Directory (`.`). The sibling Next.js checkout is not part of this repository.
3. Set Framework Preset to **Fastify**, Build Command to `npm run build`, Install Command to `npm ci`, and disable the Output Directory override. The checked-in configuration supplies these settings and resets `outputDirectory` to `null`. Do not publish `dist` as static output: it contains server code and SQL migrations.
4. Add the environment below to the intended Vercel environment. Give preview deployments a separate database and matching worker if they will modify data.
5. Initialize that database using the release command below, then create a deployment from the updated branch. Verify the deployment's Source commit has changed from `3d06ef3`.

The `engines.node >=20` and npm `allow-scripts` warnings in the original log are separate from this output-directory failure.

## Environment and database release

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Reachable PostgreSQL connection URL with the database provider's verified TLS settings |
| `NEWS_V2_ADMIN_TOKEN` | At least 32 non-whitespace characters; match the application server's bearer token |
| `NEWS_V2_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as base64 or hex; match the persistent worker and retain across deployments |
| `NEWS_V2_WORKER_ENABLED` | `false` on Vercel |
| `SCHEDULER_ENABLED` | `false` on Vercel |
| `NEWS_V2_ALLOW_PAID_PROVIDERS` | `false` initially; match the worker's policy |
| `NEWS_V2_ONLY` | `false` to retain V1 reads alongside V2 |
| `DATABASE_POOL_MAX` | Size per function instance; budget connections across Vercel instances and the worker |

Set provider credentials through the existing authenticated provider settings. Keep database credentials, bearer tokens, and encryption keys server-side. Vercel supplies `VERCEL=1`; this automatically prevents local worker execution even if the worker flag was copied from another host.

On a release machine with this repository, production environment configured, and access to the target database, run:

```sh
npm ci
npm run build
npm run bootstrap:production
```

The bootstrap applies migrations and loads the reviewed catalogue/listing snapshot without provider calls. It uses the catalogue as the complete active company list; follow [DEPLOYMENT.md](DEPLOYMENT.md) before changing bootstrap inputs on an existing database. The Vercel entrypoint deliberately does not run database migrations during a build or cold start.

## Persistent ingestion

Run the existing Docker service or `npm start` on a persistent host connected to the same database, with `NEWS_V2_WORKER_ENABLED=true`, `SCHEDULER_ENABLED=false`, and the same encryption key and provider policy. Do not set `VERCEL=1` on that host. See [DEPLOYMENT.md](DEPLOYMENT.md) for its full production configuration.

`POST /v2/sync` on Vercel persists jobs for that worker and returns `202`. `workerEnabled:false` describes the Vercel instance, not the availability of another worker. Without an external worker, jobs remain queued and feeds do not automatically refresh.

`POST /v1/fetch` returns `503` with `worker_required` on Vercel, including requests with `wait:true`. Legacy ingestion can outlive a function invocation; run it through the persistent host or the existing ingestion CLI. V1 reads, V2 reads and provider administration remain available with the existing bearer authentication.

## Verify the deployed API

- `/health` returns `200` without credentials and does not require a database query.
- `/ready` returns `200` when PostgreSQL is reachable. This probe does not establish that the application schema or catalogue was initialized; verify an authenticated data route too.
- `/v1/companies`, `/v2/news`, and `/docs` return `401` without the server bearer.
- Authenticated data reads return results after bootstrap. An authenticated `/v2/sync` request creates a job that the external worker subsequently completes.
- If Vercel Deployment Protection restricts requests, configure the application's access through that protection as well as the API bearer.

The API has no website at `/`; use `/health` for the initial check. Hosting the entire Next.js application still follows the parent project's deployment instructions.

References: [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify), [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json).
