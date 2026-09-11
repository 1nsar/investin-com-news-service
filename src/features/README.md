# News features

- [global-news](global-news): original company/general news ingestion, providers, listing resolution, run tracking and V1 routes.
- [global-news-v2](global-news-v2): official/optional-provider adapters, article access, provider settings and the PostgreSQL job worker.

Both features use shared configuration, catalogue identities and database access under `src/`. The HTTP server lives in `src/api/server.ts`; the Vercel entrypoint is `src/server.ts`.

[Documentation](../../docs/README.md) also contains the Polymarket and Monid research. Their runtime code is respectively in the MVP repository and not implemented.
