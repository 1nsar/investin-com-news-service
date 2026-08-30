import { backoffDelayMs, mapWithConcurrency, sleep, withTimeout } from "../util/async.js";
import { RateLimiter } from "../util/rateLimiter.js";
import { logger } from "../util/logger.js";

/** Turning a provider's redirect wrapper into the publisher's own address.
 *
 *  Finnhub does not hand back the article's URL. It hands back a link into its
 *  own domain - `https://finnhub.io/api/news?id=<sha>` - which 302s to the
 *  publisher. Storing that wrapper works, but it is the wrong thing to keep:
 *
 *  1. Every reader pays an extra network hop, and the link dies entirely if
 *     Finnhub is unreachable - a news archive should not depend on the
 *     liveness of the API we happened to fetch it from.
 *  2. The wrapper hides the destination, so a dead publisher (see
 *     `deadHosts.ts`) cannot be filtered out - the URL looks perfectly healthy
 *     right up until the reader clicks it.
 *  3. Dedupe degrades. Every wrapper carries a distinct `id`, so one wire
 *     story syndicated to three outlets is three different canonical URLs.
 *     Resolving first lets `canonicalizeUrl` collapse them.
 *
 *  Resolution is deliberately ONE hop: enough to read the `Location` header,
 *  without fetching article bodies we have no use for. Publisher chains beyond
 *  that first hop are the reader's browser's problem.
 *
 *  Best-effort by design. A failure keeps the wrapper, which still works - so
 *  a Finnhub hiccup degrades link quality rather than dropping the article.
 *
 *  Concurrency defaults to 3 because the redirect endpoint is rate-limited:
 *  measured over 40 links, 10-wide returned 429 for 30% of them and 6-wide for
 *  20%, while 3-wide resolved every one. Retries cover the rest.
 *
 *  It gets its OWN limiter rather than the provider's. The wrapper URL carries
 *  no API token - it is a separate, unauthenticated endpoint, limited by IP
 *  rather than by key - so it does not draw on the provider's quota. Sharing
 *  the provider's bucket made resolution queue behind the company fetches until
 *  the per-company timeout fired, and every timed-out article was then stored
 *  with the wrapper URL intact: 204 of them in one run. */
// 360/min, measured. A burst of 60 at concurrency 3 sustained 403/min with no
// 429s, so the earlier 120 was throttling to under a third of what the endpoint
// tolerates - and since link resolution dominates run time, that tripled the
// length of a full ingest. Concurrency 3 remains the real safety valve: the
// 429s we measured came from running 10 wide, not from the request rate.
const resolverLimiter = new RateLimiter("finnhub-redirect", 360);

/** Hosts whose links are redirect wrappers rather than articles. */
const WRAPPER_HOSTS = /(^|\.)finnhub\.io$/i;

export function isWrapperUrl(url: string): boolean {
  try {
    return WRAPPER_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Follow exactly one redirect and return the destination, or null.
 *
 *  GET, not HEAD, and that is not an oversight: Finnhub answers a HEAD with
 *  `Location: /` - its own homepage - and only reveals the publisher on a GET.
 *  A HEAD-based resolver silently "worked" while resolving nothing.
 *
 *  GET is still cheap here because `redirect: "manual"` stops at the 302: the
 *  body of a redirect is empty, and we never fetch the article itself. The
 *  body is cancelled explicitly so the socket is released rather than parked
 *  in the pool waiting to be read. */
export async function resolveOneHop(
  url: string,
  timeoutMs = 8_000,
  maxRetries = 3,
  limiter?: RateLimiter,
): Promise<string | null> {
  for (let attempt = 0; ; attempt += 1) {
    // The wrapper lives on the SAME host, and counts against the SAME key
    // quota, as the provider call that produced it. Resolving outside the
    // provider's budget would let link resolution starve the fetches - and the
    // provider's limiter would back off while this path kept hammering.
    if (limiter) await limiter.acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await withTimeout(
        fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { "user-agent": "company-news-component/1.0 (+link resolution)" },
        }),
        timeoutMs,
        "redirect resolution",
      );

      // We only ever want the header; drop the body without reading it.
      await response.body?.cancel().catch(() => undefined);

      // The resolver is rate-limited like any other endpoint. Treating a 429
      // as "unresolvable" would silently keep the wrapper for a link that is
      // perfectly resolvable a second later - measured at 30% loss when
      // running 10 wide.
      if (response.status === 429 || response.status >= 500) {
        if (attempt >= maxRetries) return null;
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 15_000)
            : backoffDelayMs(attempt, 400, 8_000),
        );
        continue;
      }

      const location = response.headers.get("location");
      if (!location) return null;

      // Resolve against the request URL so a relative Location still works.
      const target = new URL(location, url);
      if (!/^https?:$/.test(target.protocol)) return null;
      // A wrapper that points at itself is a loop, not a resolution.
      if (isWrapperUrl(target.toString())) return null;
      return target.toString();
    } catch {
      if (attempt >= maxRetries) return null;
      await sleep(backoffDelayMs(attempt, 400, 8_000));
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Resolve many wrappers at once. Returns a Map of wrapper URL -> real URL,
 *  containing only the ones that resolved. */
export async function resolveWrappers(
  urls: readonly string[],
  concurrency = 3,
  limiter: RateLimiter = resolverLimiter,
): Promise<Map<string, string>> {
  const unique = [...new Set(urls.filter(isWrapperUrl))];
  const resolved = new Map<string, string>();
  if (unique.length === 0) return resolved;

  const results = await mapWithConcurrency(unique, concurrency, (url) =>
    resolveOneHop(url, 8_000, 3, limiter),
  );
  unique.forEach((url, index) => {
    const target = results[index];
    if (target) resolved.set(url, target);
  });

  if (resolved.size < unique.length) {
    logger.debug(
      { attempted: unique.length, resolved: resolved.size },
      "some redirect wrappers did not resolve; keeping the wrapper URL",
    );
  }
  return resolved;
}
