# Global News: original company-news service

Implementation: [src/features/global-news](../../src/features/global-news).

This feature resolves catalogue listings, collects company/general news, filters duplicates and relevance, and serves the original `/v1` API. The tracked catalogue has 1,515 entries; identity import and stored articles do not establish complete fresh coverage.

- [API reference](api.md)
- [Provider comparison](provider-comparison.md)
- [Data sources](data-sources.md) / [Russian version](data-sources.ru.md)
- [Service report](report.md) and [operations](operations.md)
- [Downloadable reports](reports)
- [Screenshots](screenshots)
- [Historical setup guide](legacy-service-guide.md)

Related code: [collection scripts](../../scripts/global-news), [tests](../../test/global-news), [shared catalogue](../../src/catalogue), [database migrations](../../src/db/migrations).
