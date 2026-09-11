# Global News 2

Implementation: [src/features/global-news-v2](../../src/features/global-news-v2). The website's `/global-v2` page is in the separate MVP repository.

Implemented work includes official-source ingestion, a full-text reader where source access permits it, provider configuration, company matching, revision handling and durable PostgreSQL jobs.

The recorded local check on 9 September 2026 had 20 Fed releases and 6 ECB releases with readable text. SEC requests were blocked; commercial-feed delivery was not verified, and the sample did not establish fresh V2 company-news coverage.

- [Architecture and measured results](architecture.md) / [Russian version](architecture.ru.md)
- [Provider implementation and limits](providers.md)
- [Downloadable reports](reports)
- [Screenshots](screenshots)
- [Dated evidence](evidence)
- [Tests](../../test/global-news-v2)

The reports preserve the review status at their dates. Later hosting and security work has its own [deployment guide](../deployment/README.md). Vercel handles requests; continuous ingestion needs a persistent worker.
