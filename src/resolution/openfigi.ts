import { config } from "../config/index.js";
import { requestJson } from "../util/http.js";
import { RateLimiter } from "../util/rateLimiter.js";
import { HttpError } from "../util/http.js";
import { logger } from "../util/logger.js";

/** OpenFIGI is the primary identity resolver: it maps a ticker (optionally
 *  narrowed to an exchange) onto Bloomberg's FIGI identifiers, which give us a
 *  stable company identity and, through the share-class FIGI, every other line
 *  of the same security.
 *
 *  Free and keyless. A free key only raises the limits:
 *    no key  -> 25 requests/min, 10 jobs per request
 *    free key-> 250 requests/min, 100 jobs per request
 *  which is the difference between ~25 minutes and ~2 minutes for this
 *  catalogue, so the key is worth requesting but never required. */

const MAPPING_URL = "https://api.openfigi.com/v3/mapping";
const SEARCH_URL = "https://api.openfigi.com/v3/search";

export interface FigiRecord {
  figi: string;
  name: string;
  ticker: string;
  exchCode: string;
  compositeFIGI: string | null;
  shareClassFIGI: string | null;
  securityType: string | null;
  securityType2: string | null;
  marketSector: string | null;
  securityDescription: string | null;
}

export interface MappingJob {
  idType: "TICKER" | "ID_BB_GLOBAL" | "ID_BB_GLOBAL_SHARE_CLASS_LEVEL" | "ID_ISIN";
  idValue: string;
  exchCode?: string;
  micCode?: string;
  currency?: string;
}

interface MappingResponseEntry {
  data?: FigiRecord[];
  warning?: string;
  error?: string;
}

const hasKey = Boolean(config.OPENFIGI_API_KEY);
export const OPENFIGI_BATCH_SIZE = hasKey ? 100 : 10;

// A little under the documented ceiling: this client is not the only thing
// that might be talking to the API, and a 429 here stalls the whole resolve.
const limiter = new RateLimiter("openfigi", hasKey ? 200 : 24);

// /v3/search is metered far more tightly than /v3/mapping and needs its own
// budget. Sharing the mapping limiter sent search requests at 200/min, which
// the endpoint answered with "Too many requests"; `searchByName` caught that
// and returned an empty list, so a throttled request was indistinguishable
// from "this company does not exist" - and 40+ companies were written off as
// unresolvable when the requests had simply been refused.
const searchLimiter = new RateLimiter("openfigi-search", hasKey ? 15 : 5);

function headers(): Record<string, string> {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (hasKey) base["X-OPENFIGI-APIKEY"] = config.OPENFIGI_API_KEY;
  return base;
}

/** Map a batch of jobs. Results line up positionally with `jobs`, and an entry
 *  that found nothing comes back as an empty array rather than throwing, so
 *  one unresolvable ticker never sinks the batch. */
export async function mapIdentifiers(jobs: MappingJob[]): Promise<FigiRecord[][]> {
  if (jobs.length === 0) return [];
  const results: FigiRecord[][] = [];

  for (let offset = 0; offset < jobs.length; offset += OPENFIGI_BATCH_SIZE) {
    const batch = jobs.slice(offset, offset + OPENFIGI_BATCH_SIZE);
    try {
      const response = await requestJson<MappingResponseEntry[]>(MAPPING_URL, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(batch),
        limiter,
        label: "openfigi/mapping",
        timeoutMs: 30_000,
        maxRetries: 3,
      });
      for (const entry of response) results.push(entry?.data ?? []);
    } catch (error) {
      logger.warn(
        { err: error, batchStart: offset, batchSize: batch.length },
        "openfigi batch failed; treating as unresolved",
      );
      for (let index = 0; index < batch.length; index++) results.push([]);
    }
  }

  return results;
}

/** Free-text search, used when a ticker will not map - a renamed line, an
 *  exchange we have no code for, or a symbol the supplier wrote differently
 *  from the venue. Returns fewer guarantees than mapping, so callers must
 *  still confirm the name. */
/** Instrument kinds that are a company's actual shares.
 *
 *  "Common Stock" alone is not enough. Dutch companies routinely issue
 *  depositary receipts instead of ordinary shares - Heijmans trades in
 *  Amsterdam as a CVA (certificaat van aandelen) - and filtering to common
 *  stock hid the company's only real listing behind an empty result. */
const EQUITY_KINDS = ["Common Stock", "Depositary Receipt"] as const;

export async function searchByName(
  companyName: string,
  exchCode?: string,
): Promise<FigiRecord[]> {
  try {
    // Filter to common stock SERVER-side. Search returns at most 100 rows with
    // no preference for equity, and for a large issuer those 100 are all
    // futures and dividend futures written on the name - the share itself never
    // appears. Airbus, Novozymes and LVMH all returned 100 derivatives
    // unfiltered and their real listings the moment this was added.
    // One request per instrument kind: the filter takes a single value, and an
    // unfiltered search returns 100 rows of futures for any large issuer.
    const found: FigiRecord[] = [];
    // Each kind is caught separately: a refusal on the second request must not
    // throw away rows the first already returned. Losing them would recreate
    // the exact confusion this function was changed to avoid - a throttled
    // request looking identical to "this company does not exist".
    for (const kind of EQUITY_KINDS) {
      try {
      const body: Record<string, string> = { query: companyName, securityType2: kind };
      if (exchCode) body.exchCode = exchCode;
      const response = await requestJson<{ data?: FigiRecord[] }>(SEARCH_URL, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        limiter: searchLimiter,
        label: `openfigi/search:${kind}`,
        timeoutMs: 30_000,
        maxRetries: 2,
      });
        found.push(...(response.data ?? []));
      } catch (error) {
        const rateLimited =
          error instanceof HttpError ? error.isRateLimited : /too many requests/i.test(String(error));
        logger.warn({ err: error, companyName, kind, rateLimited }, "openfigi search failed for one kind");
        if (found.length === 0 && kind === EQUITY_KINDS[EQUITY_KINDS.length - 1]) throw error;
      }
    }
    return found;
  } catch (error) {
    // Distinguish "refused" from "not found". An empty list is a real answer;
    // a rate-limited request is not, and silently returning [] for it marks a
    // resolvable company unresolvable.
    const rateLimited =
      error instanceof HttpError ? error.isRateLimited : /too many requests/i.test(String(error));
    logger.warn(
      { err: error, companyName, rateLimited },
      rateLimited ? "openfigi search was rate limited" : "openfigi search failed",
    );
    return [];
  }
}

/** Every listing sharing a share class - the mechanism behind Task 2. */
export async function listingsForShareClass(shareClassFigi: string): Promise<FigiRecord[]> {
  const [records] = await mapIdentifiers([
    { idType: "ID_BB_GLOBAL_SHARE_CLASS_LEVEL", idValue: shareClassFigi },
  ]);
  return records ?? [];
}

export const openFigiLimiter = limiter;
export const openFigiHasKey = hasKey;
