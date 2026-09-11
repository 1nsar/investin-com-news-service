# Deployment

Choose the runtime you are deploying:

- [Persistent service](persistent.md): PostgreSQL, API, database bootstrap and continuous ingestion in Node/Docker.
- [Vercel API](vercel.md): a Fastify function for requests and queued refresh jobs, connected to a separate persistent worker.

The website is in the [MVP repository](https://github.com/1nsar/investing-com), with separate persistent SQLite requirements. This repository alone does not deploy the website.

Production requires a reachable PostgreSQL database, the shared admin bearer and the persistent encryption key. Build success does not verify database/provider connectivity or ingestion freshness.
