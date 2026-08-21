import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { config } from "../config/index.js";
import { request } from "../util/http.js";
import { logger } from "../util/logger.js";
import { normalizeName } from "../catalogue/names.js";

/** The full directory of US-listed symbols, downloaded once from Finnhub.
 *
 *  This is the single highest-value free artefact in the whole component. It
 *  is ~31,000 rows and carries `shareClassFIGI`, `mic`, `isin`, `type` and a
 *  description for every US line, which lets us answer two questions locally,
 *  with no per-company API calls at all:
 *
 *    - is this ticker genuinely US-listed, and on which venue?
 *    - does this foreign company have a US line, and what is its symbol?
 *
 *  The second question is the one that decides news coverage. A US ADR
 *  usually has news where the home-exchange symbol returns nothing, so
 *  discovering ADRs is what lifts international coverage without paying for a
 *  global news feed. */

export interface UsSymbol {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
  mic: string;
  figi: string;
  figiComposite: string;
  shareClassFIGI: string;
  isin: string;
  currency: string;
}

const CACHE_PATH = "data/catalogue/us-symbols.json";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Venues that count as a real listing, best first. OTC is included because a
 *  great many ADRs only trade there, but it ranks last. */
const VENUE_RANK: Record<string, number> = {
  XNYS: 0, XNAS: 1, ARCX: 2, BATS: 3, XASE: 4, OOTC: 9,
};

export interface UsDirectory {
  all: UsSymbol[];
  bySymbol: Map<string, UsSymbol[]>;
  byShareClass: Map<string, UsSymbol[]>;
  byNormalizedName: Map<string, UsSymbol[]>;
  fetchedAt: Date;
}

async function download(): Promise<UsSymbol[]> {
  if (!config.FINNHUB_API_KEY) {
    throw new Error(
      "FINNHUB_API_KEY is required to download the US symbol directory. See .env.example.",
    );
  }
  const url = `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${config.FINNHUB_API_KEY}`;
  logger.info("downloading US symbol directory");
  const text = await request(url, { label: "finnhub/stock/symbol", timeoutMs: 120_000, maxRetries: 3 });
  const parsed = JSON.parse(text) as UsSymbol[];
  if (!Array.isArray(parsed) || parsed.length < 1000) {
    throw new Error(`US symbol directory looked wrong: ${parsed.length ?? 0} rows`);
  }
  return parsed;
}

async function readCache(): Promise<UsSymbol[] | null> {
  try {
    const info = await stat(CACHE_PATH);
    if (Date.now() - info.mtimeMs > CACHE_MAX_AGE_MS) return null;
    return JSON.parse(await readFile(CACHE_PATH, "utf8")) as UsSymbol[];
  } catch {
    return null;
  }
}

function index(rows: UsSymbol[]): UsDirectory {
  const bySymbol = new Map<string, UsSymbol[]>();
  const byShareClass = new Map<string, UsSymbol[]>();
  const byNormalizedName = new Map<string, UsSymbol[]>();

  const push = <K,>(map: Map<K, UsSymbol[]>, key: K, row: UsSymbol) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  };

  for (const row of rows) {
    if (row.symbol) push(bySymbol, row.symbol.toUpperCase(), row);
    if (row.shareClassFIGI) push(byShareClass, row.shareClassFIGI, row);
    const normalized = normalizeName(row.description ?? "");
    if (normalized) push(byNormalizedName, normalized, row);
  }

  for (const bucket of [bySymbol, byShareClass, byNormalizedName]) {
    for (const rowsForKey of bucket.values()) rowsForKey.sort(rankVenues);
  }

  return { all: rows, bySymbol, byShareClass, byNormalizedName, fetchedAt: new Date() };
}

function rankVenues(left: UsSymbol, right: UsSymbol): number {
  const rank = (row: UsSymbol) => VENUE_RANK[row.mic] ?? 8;
  return rank(left) - rank(right) || left.symbol.localeCompare(right.symbol);
}

let cached: Promise<UsDirectory> | undefined;

/** Loaded once per process, cached on disk for a day. */
export function loadUsDirectory(forceRefresh = false): Promise<UsDirectory> {
  if (cached && !forceRefresh) return cached;
  cached = (async () => {
    const fromDisk = forceRefresh ? null : await readCache();
    if (fromDisk) {
      logger.info({ rows: fromDisk.length }, "US symbol directory loaded from cache");
      return index(fromDisk);
    }
    const rows = await download();
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(rows));
    logger.info({ rows: rows.length }, "US symbol directory downloaded");
    return index(rows);
  })();
  return cached;
}

export function isUsVenue(mic: string | null | undefined): boolean {
  return !!mic && mic in VENUE_RANK;
}

export function isExchangeListed(row: UsSymbol): boolean {
  return row.mic !== "OOTC" && isUsVenue(row.mic);
}

/** Depositary receipt, foreign ordinary, or a plain domestic line. Drives both
 *  `security_kind` and how much we trust news filed against it. */
export function classifySecurity(row: UsSymbol): "adr" | "gdr" | "ordinary" | "other" {
  const type = (row.type ?? "").toUpperCase();
  const description = (row.description ?? "").toUpperCase();
  if (type.includes("ADR") || /\bADR\b|\bADS\b/.test(description)) return "adr";
  if (type.includes("GDR") || /\bGDR\b/.test(description)) return "gdr";
  if (type.includes("COMMON") || type.includes("EQS")) return "ordinary";
  return "other";
}
