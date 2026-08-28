/** Publishers that do not serve the article, or the image, to anyone.
 *
 *  This is NOT a list of sites that block automated clients. Benzinga and
 *  Seeking Alpha both answer us with 403 while serving a browser perfectly
 *  well; filtering on our own access would throw away links that work fine for
 *  the reader. We do not disguise the service as a browser to check, either.
 *
 *  A host earns a place here only when it fails for a *real browser* too:
 *  chartmill.com refuses the connection outright (curl reports no HTTP status
 *  at all, in ~0.35s, with a browser user-agent and from a normal network),
 *  which is what a reader sees as ERR_CONNECTION / 504.
 *
 *  Keep this list short and evidence-based. It is configurable via
 *  DEAD_ARTICLE_HOSTS precisely so a host recovering does not need a release -
 *  and so operators can add one without editing code. */
const DEFAULT_DEAD_HOSTS = ["chartmill.com"];

function parseHosts(configured: string | undefined): string[] {
  if (configured === undefined) return DEFAULT_DEAD_HOSTS;
  // An explicitly empty value disables the filter entirely.
  return configured
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

let cache: { raw: string | undefined; hosts: string[] } | null = null;

function deadHosts(): string[] {
  const raw = process.env["DEAD_ARTICLE_HOSTS"];
  if (!cache || cache.raw !== raw) cache = { raw, hosts: parseHosts(raw) };
  return cache.hosts;
}

/** True when the URL points at a host that serves nobody. Matches the host and
 *  its subdomains, so `chartmill.com` also covers `www.chartmill.com`. */
export function isDeadHost(url: string | null | undefined): boolean {
  if (!url) return false;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return deadHosts().some((dead) => hostname === dead || hostname.endsWith(`.${dead}`));
}
