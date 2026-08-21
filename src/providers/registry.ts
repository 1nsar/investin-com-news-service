import { config } from "../config/index.js";
import { logger } from "../util/logger.js";
import { FinnhubProvider } from "./finnhub.js";
import { GoogleNewsRssProvider } from "./googleNewsRss.js";
import type { NewsProvider } from "./types.js";

/** Provider registry.
 *
 *  Everything that knows a provider exists lives in this file. To add a source
 *  you implement NewsProvider, add one line to FACTORIES, and name it in
 *  NEWS_PROVIDER_ORDER. The ingest, the storage layer and the API stay
 *  untouched - that is the plug-in property the brief asks for.
 *
 *  Order is configuration, not code: NEWS_PROVIDER_ORDER decides preference,
 *  so swapping the primary source, or demoting one that starts degrading, is
 *  an environment change and a restart. */

type ProviderFactory = () => NewsProvider;

const FACTORIES: Record<string, ProviderFactory> = {
  finnhub: () => new FinnhubProvider(),
  google_news_rss: () => new GoogleNewsRssProvider(),
};

export function availableProviderNames(): string[] {
  return Object.keys(FACTORIES);
}

let cached: NewsProvider[] | undefined;

/** Providers in configured preference order, unconfigured ones dropped. */
export function getProviders(): NewsProvider[] {
  if (cached) return cached;

  const providers: NewsProvider[] = [];
  for (const name of config.providerOrder) {
    const factory = FACTORIES[name];
    if (!factory) {
      logger.warn(
        { provider: name, available: availableProviderNames() },
        "unknown provider in NEWS_PROVIDER_ORDER; ignoring",
      );
      continue;
    }
    const provider = factory();
    if (!provider.isConfigured()) {
      logger.warn({ provider: name }, "provider is not configured; skipping");
      continue;
    }
    providers.push(provider);
  }

  if (providers.length === 0) {
    logger.error(
      { order: config.providerOrder },
      "no usable news providers - every fetch will report 'unresolved'",
    );
  } else {
    logger.info({ providers: providers.map((entry) => entry.name) }, "providers active");
  }

  cached = providers;
  return providers;
}

