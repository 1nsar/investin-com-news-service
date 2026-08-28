import {
  candidateExchCodes,
  exchangeForCode,
  exchangeForHint,
  isUsExchCode,
  symbolFormatFor,
} from "../catalogue/exchanges.js";
import { NAME_MATCH_THRESHOLD, nameSimilarity, normalizeName, sharedTokenCount, tickerVariants } from "../catalogue/names.js";
import { mapWithConcurrency } from "../util/async.js";
import { logger } from "../util/logger.js";
import {
  mapIdentifiers,
  OPENFIGI_BATCH_SIZE,
  searchByName,
  type FigiRecord,
  type MappingJob,
} from "./openfigi.js";
import {
  classifySecurity,
  isExchangeListed,
  loadUsDirectory,
  type UsDirectory,
  type UsSymbol,
} from "./usDirectory.js";
import type { CompanyResolution, CompanyToResolve, ResolvedListing } from "./types.js";

/** Listing resolution.
 *
 *  Task 1 asks which exchange a ticker trades on; Task 2 asks for every
 *  exchange it trades on. Both run here, because the second falls out of the
 *  first: once a ticker is pinned to a FIGI we can walk its share class.
 *
 *  The rule that shapes everything: a ticker plus an exchange is NOT enough to
 *  identify a company. `ADM` narrowed to London still returns
 *  Archer-Daniels-Midland rather than Admiral Group, because ADM cross-lists
 *  there. So every candidate is scored against the catalogue's company name
 *  and rejected if it does not agree. That check is what turns this catalogue's
 *  ticker collisions from silent misattribution into a reported correction. */

const CONFIDENCE = {
  /** Ticker + exchange hint mapped, and the name agrees. */
  hintConfirmed: 0.95,
  /** Ticker mapped without an exchange filter, name agrees. */
  tickerOnly: 0.8,
  /** Found by searching the company name. */
  nameSearch: 0.7,
  /** Same share class as the primary listing: a fact, not an inference. */
  shareClass: 0.9,
  /** US line found by matching the normalised name. This is how sponsored
   *  ADRs are discovered - they carry their own share class, so nothing links
   *  them structurally to the home line. */
  nameMatchedUs: 0.75,
  /** Ticker matched on the hinted exchange, but the name only partly agrees -
   *  almost always a company that has been renamed since the catalogue was
   *  compiled (Sterling Construction -> Sterling Infrastructure). Accepted at
   *  reduced confidence and flagged, rather than dropped. */
  renamed: 0.6,
} as const;

function bestByName(records: FigiRecord[], companyName: string): { record: FigiRecord; score: number } | null {
  let best: { record: FigiRecord; score: number } | null = null;
  for (const record of records) {
    if (!record?.name) continue;
    const score = nameSimilarity(companyName, record.name ?? "");
    if (!best || score > best.score) best = { record, score };
  }
  return best && best.score >= NAME_MATCH_THRESHOLD ? best : null;
}

function kindFromFigi(record: FigiRecord): ResolvedListing["securityKind"] {
  const text = `${record.securityType ?? ""} ${record.securityType2 ?? ""} ${record.name ?? ""}`.toUpperCase();
  if (/\bADR\b|AMERICAN DEPOSITARY/.test(text)) return "adr";
  if (/\bGDR\b|GLOBAL DEPOSITARY/.test(text)) return "gdr";
  if (/DEPOSITARY|DEPOSITORY/.test(text)) return "depositary";
  if (/COMMON STOCK|ORDINARY|EQUITY/.test(text)) return "ordinary";
  return "other";
}

/** OpenFIGI returns some records with no `exchCode` at all - composite-level
 *  entries that identify a security without naming a venue. They cannot become
 *  a listing (the whole point of the row is the exchange), so they are dropped
 *  rather than stored with a null venue. */
function hasVenue(record: FigiRecord): boolean {
  return Boolean(record.exchCode && record.exchCode.trim() && record.ticker && record.ticker.trim());
}

function listingFromFigi(
  record: FigiRecord,
  options: { isPrimary: boolean; confidence: number },
): ResolvedListing {
  const reference = exchangeForCode(record.exchCode);
  const isUs = isUsExchCode(record.exchCode);
  return {
    exchangeCode: record.exchCode,
    mic: reference?.mic ?? null,
    symbol: record.ticker,
    symbolFormat: symbolFormatFor(record.exchCode, record.ticker),
    securityKind: kindFromFigi(record),
    country: reference?.country ?? null,
    currency: reference?.currency ?? null,
    figi: record.figi ?? null,
    compositeFigi: record.compositeFIGI ?? null,
    shareClassFigi: record.shareClassFIGI ?? null,
    isin: null,
    isPrimary: options.isPrimary,
    isUs,
    confidence: options.confidence,
    source: "openfigi",
  };
}

function listingFromUsDirectory(
  row: UsSymbol,
  options: { isPrimary: boolean; confidence: number },
): ResolvedListing {
  return {
    exchangeCode: "US",
    mic: row.mic ?? null,
    symbol: row.symbol,
    symbolFormat: "us",
    securityKind: classifySecurity(row),
    country: "US",
    currency: row.currency || "USD",
    figi: row.figi || null,
    compositeFigi: row.figiComposite || null,
    shareClassFigi: row.shareClassFIGI || null,
    isin: row.isin || null,
    isPrimary: options.isPrimary,
    isUs: true,
    confidence: options.confidence,
    source: "finnhub_directory",
  };
}

/** Step 1: pin each company to one identified security.
 *
 *  Batched through OpenFIGI, one job per (ticker, candidate exchange). Only
 *  companies that fail every batched candidate fall through to the slower
 *  per-company name search. */
async function resolvePrimaries(
  companies: CompanyToResolve[],
  directory: UsDirectory,
): Promise<Map<number, { record: FigiRecord | null; usRow: UsSymbol | null; confidence: number; note: string | null }>> {
  const outcome = new Map<
    number,
    { record: FigiRecord | null; usRow: UsSymbol | null; confidence: number; note: string | null }
  >();

  // Pass 0: the local US directory, before any network call.
  //
  // Roughly two thirds of this catalogue is US-listed, and the directory
  // already carries a FIGI, share class, MIC and ISIN for every US line. A
  // symbol hit whose name agrees is therefore a complete answer that costs
  // nothing - and OpenFIGI without a key allows only 25 requests a minute, so
  // every company answered here is a meaningful saving on the slowest
  // resource in the whole resolve.
  const needsRemote: CompanyToResolve[] = [];
  for (const company of companies) {
    const reference = exchangeForHint(company.exchangeHint);
    // Only trust the local shortcut when the hint points at a US venue, or
    // there is no hint at all. A foreign hint must be checked properly: the
    // same ticker on a US exchange is usually a different company entirely.
    const localEligible = !company.exchangeHint || reference?.isUs === true;
    if (!localEligible) {
      needsRemote.push(company);
      continue;
    }

    // Try equivalent ticker spellings: some supplier rows use `_` where the
    // rest of the catalogue uses `.` as the venue separator, and the
    // underscore form matches nothing in any identifier source.
    const candidates = tickerVariants(company.ticker).flatMap(
      (symbol) => directory.bySymbol.get(symbol) ?? [],
    );
    const scored = candidates
      .map((row) => ({ row, score: nameSimilarity(company.companyName, row.description ?? "") }))
      .filter((entry) => entry.score >= NAME_MATCH_THRESHOLD)
      .sort((left, right) => right.score - left.score);
    const best = scored[0];

    if (best) {
      outcome.set(company.id, {
        record: null,
        usRow: best.row,
        confidence: CONFIDENCE.hintConfirmed,
        note:
          best.score < 0.99
            ? `US directory match ${best.score.toFixed(2)} against "${best.row.description}"`
            : null,
      });
    } else {
      needsRemote.push(company);
    }
  }

  logger.info(
    { resolvedLocally: companies.length - needsRemote.length, needingOpenFigi: needsRemote.length },
    "primary resolution: local US directory pass",
  );

  // Build one job per remaining company per candidate venue, remembering which
  // company each job belongs to so results can be scattered back.
  interface Slot { company: CompanyToResolve; exchCode: string | null }
  const slots: Slot[] = [];
  const jobs: MappingJob[] = [];

  for (const company of needsRemote) {
    const candidates = candidateExchCodes(company.exchangeHint);
    if (candidates.length === 0) {
      // No usable hint. Try the bare ticker; the name check guards it.
      slots.push({ company, exchCode: null });
      jobs.push({ idType: "TICKER", idValue: company.ticker });
      continue;
    }
    for (const exchCode of candidates) {
      slots.push({ company, exchCode });
      jobs.push({ idType: "TICKER", idValue: company.ticker, exchCode });
    }
  }

  logger.info(
    { companies: needsRemote.length, jobs: jobs.length, batchSize: OPENFIGI_BATCH_SIZE },
    "resolving primary listings via OpenFIGI",
  );

  const responses = await mapIdentifiers(jobs);

  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (!slot) continue;
    const existing = outcome.get(slot.company.id);
    // First candidate venue that produces a name-confirmed hit wins.
    if (existing?.record) continue;

    const records = responses[index] ?? [];
    const match = bestByName(records, slot.company.companyName);
    if (match) {
      outcome.set(slot.company.id, {
        record: match.record,
        usRow: null,
        confidence: slot.exchCode ? CONFIDENCE.hintConfirmed : CONFIDENCE.tickerOnly,
        note:
          records.length > 0 && match.score < 0.99
            ? `name match ${match.score.toFixed(2)} against "${match.record.name}"`
            : null,
      });
    } else if (slot.exchCode && records.length > 0) {
      // The ticker resolved on the venue the catalogue pointed at, but the
      // name only partly agrees. Distinguish a RENAME from a COLLISION:
      // every known collision in this catalogue shares zero tokens with the
      // impostor, while renames share at least one. Ticker + hinted exchange
      // + partial name is strong enough to accept at reduced confidence.
      const candidate = records[0] as FigiRecord;
      const shared = sharedTokenCount(slot.company.companyName, candidate.name ?? "");
      if (shared >= 1 && !existing?.record) {
        outcome.set(slot.company.id, {
          record: candidate,
          usRow: null,
          confidence: CONFIDENCE.renamed,
          note: `likely renamed: catalogue says "${slot.company.companyName}", venue says "${candidate.name}"`,
        });
      } else if (!existing) {
        outcome.set(slot.company.id, {
          record: null,
          usRow: null,
          confidence: 0,
          note: `rejected "${candidate.name}" on ${slot.exchCode}: name does not match`,
        });
      }
    } else if (!existing) {
      outcome.set(slot.company.id, { record: null, usRow: null, confidence: 0, note: null });
    }
  }

  // Fallback 1: the US directory, free and local. Catches US rows whose FIGI
  // mapping was ambiguous, and anything where the supplier's symbol is exactly
  // what the venue uses.
  for (const company of companies) {
    const current = outcome.get(company.id);
    if (current?.record) continue;
    // Try equivalent ticker spellings: some supplier rows use `_` where the
    // rest of the catalogue uses `.` as the venue separator, and the
    // underscore form matches nothing in any identifier source.
    const candidates = tickerVariants(company.ticker).flatMap(
      (symbol) => directory.bySymbol.get(symbol) ?? [],
    );
    const scored = candidates
      .map((row) => ({ row, score: nameSimilarity(company.companyName, row.description ?? "") }))
      .filter((entry) => entry.score >= NAME_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best) {
      outcome.set(company.id, {
        record: null,
        usRow: best.row,
        confidence: CONFIDENCE.hintConfirmed,
        note: `matched US directory as ${best.row.symbol}`,
      });
    }
  }

  // Fallback 2: map the bare ticker, with no exchange filter.
  //
  // Batched ten to a request, where the name search below costs one request
  // per company. Running this first converts most of the remainder into a
  // handful of batched calls, which matters a lot against a keyless OpenFIGI
  // budget of 25 requests a minute. The name check still guards every hit, so
  // dropping the exchange filter costs accuracy nothing.
  const unmatched = companies.filter((company) => {
    const current = outcome.get(company.id);
    return !current?.record && !current?.usRow;
  });

  if (unmatched.length > 0) {
    logger.info({ count: unmatched.length }, "retrying unresolved tickers without an exchange filter");
    const bareResponses = await mapIdentifiers(
      unmatched.map((company) => ({ idType: "TICKER" as const, idValue: company.ticker })),
    );
    for (let index = 0; index < unmatched.length; index++) {
      const company = unmatched[index];
      if (!company) continue;
      const match = bestByName(bareResponses[index] ?? [], company.companyName);
      if (match) {
        outcome.set(company.id, {
          record: match.record,
          usRow: null,
          confidence: CONFIDENCE.tickerOnly,
          note: `resolved without an exchange filter to ${match.record.exchCode}`,
        });
      }
    }
  }

  // Fallback 3: name search. One request per company, so it runs only for the
  // remainder - typically a few dozen rows out of the catalogue.
  const stillMissing = companies.filter((company) => {
    const current = outcome.get(company.id);
    return !current?.record && !current?.usRow;
  });

  if (stillMissing.length > 0) {
    logger.info({ count: stillMissing.length }, "falling back to OpenFIGI name search");
    // Search is one request per company, so it runs in parallel. The shared
    // rate limiter still caps the outbound rate; serialising here would only
    // add wall-clock time without reducing load on the API.
    await mapWithConcurrency(stillMissing, 8, async (company) => {
      const reference = exchangeForHint(company.exchangeHint);
      const records = await searchByName(company.companyName, reference?.exchCode);
      const match = bestByName(records, company.companyName);
      if (match) {
        outcome.set(company.id, {
          record: match.record,
          usRow: null,
          confidence: CONFIDENCE.nameSearch,
          note: `resolved by name search to ${match.record.ticker} on ${match.record.exchCode}`,
        });
      }
    });
  }

  return outcome;
}

/** Step 2: from one identified security to the full set of listings. */
async function expandListings(
  company: CompanyToResolve,
  primary: { record: FigiRecord | null; usRow: UsSymbol | null; confidence: number },
  directory: UsDirectory,
): Promise<ResolvedListing[]> {
  const listings = new Map<string, ResolvedListing>();

  // Confidence cannot exceed the weakest link in the chain that produced it.
  //
  // A share-class join is exact GIVEN the primary security is right. When the
  // primary was only established by a partial name match (a suspected rename),
  // every listing derived from it inherits that uncertainty. Without this cap,
  // the 0.90 "share class" row overwrote the 0.60 rename row on the same
  // exchange:symbol key and the flag was silently lost - 10 of 12 renamed
  // companies presented as high-confidence.
  const ceiling = primary.confidence;
  const capped = (value: number): number => Math.min(value, ceiling);

  const add = (listing: ResolvedListing) => {
    const key = `${listing.exchangeCode}:${listing.symbol}`;
    const existing = listings.get(key);
    // Keep the most trusted version of a duplicate, but never lose is_primary.
    if (!existing || listing.confidence > existing.confidence) {
      listings.set(key, { ...listing, isPrimary: listing.isPrimary || (existing?.isPrimary ?? false) });
    } else if (listing.isPrimary) {
      existing.isPrimary = true;
    }
  };

  let shareClassFigi: string | null = null;

  if (primary.record && hasVenue(primary.record)) {
    add(listingFromFigi(primary.record, { isPrimary: true, confidence: primary.confidence }));
    shareClassFigi = primary.record.shareClassFIGI ?? null;
  } else if (primary.record) {
    // Identified, but with no venue attached. Keep the share class so the US
    // directory join below can still find its tradeable lines.
    shareClassFigi = primary.record.shareClassFIGI ?? null;
  } else if (primary.usRow) {
    add(listingFromUsDirectory(primary.usRow, { isPrimary: true, confidence: primary.confidence }));
    shareClassFigi = primary.usRow.shareClassFIGI || null;
  }

  if (shareClassFigi) {
    // Every US line of the same share class, straight from the local
    // directory: no API call, and exact rather than inferred.
    for (const row of directory.byShareClass.get(shareClassFigi) ?? []) {
      add(listingFromUsDirectory(row, { isPrimary: false, confidence: capped(CONFIDENCE.shareClass) }));
    }
  }

  // Sponsored ADRs carry their own share class, so nothing structural links
  // them to the home line. The normalised company name does.
  const nameKey = (primary.record?.name ?? primary.usRow?.description ?? company.companyName);
  for (const candidateName of new Set([company.companyName, nameKey])) {
    for (const row of directory.byNormalizedName.get(normalizeName(candidateName)) ?? []) {
      if (nameSimilarity(company.companyName, row.description ?? "") < NAME_MATCH_THRESHOLD) continue;
      add(
        listingFromUsDirectory(row, {
          isPrimary: false,
          // An exact share-class hit is stronger evidence than a name hit -
          // but neither can exceed the confidence of the primary it derives from.
          confidence: capped(
            row.shareClassFIGI === shareClassFigi ? CONFIDENCE.shareClass : CONFIDENCE.nameMatchedUs,
          ),
        }),
      );
    }
  }

  const result = [...listings.values()];
  // Guarantee exactly one primary: prefer the hinted venue, then a real US
  // exchange listing, then anything.
  if (!result.some((listing) => listing.isPrimary) && result.length > 0) {
    const hint = exchangeForHint(company.exchangeHint);
    const preferred =
      result.find((listing) => hint && listing.exchangeCode === hint.exchCode) ??
      result.find((listing) => listing.isUs && listing.mic !== "OOTC") ??
      result[0];
    if (preferred) preferred.isPrimary = true;
  }
  return result;
}

export async function resolveCompany(
  company: CompanyToResolve,
  directory: UsDirectory,
): Promise<CompanyResolution> {
  const primaries = await resolvePrimaries([company], directory);
  return buildResolution(company, primaries.get(company.id), directory);
}

async function buildResolution(
  company: CompanyToResolve,
  primary: { record: FigiRecord | null; usRow: UsSymbol | null; confidence: number; note: string | null } | undefined,
  directory: UsDirectory,
): Promise<CompanyResolution> {
  if (!primary || (!primary.record && !primary.usRow)) {
    return {
      companyId: company.id,
      ticker: company.ticker,
      status: "unresolved",
      note: primary?.note ?? "no identifier matched this ticker and name",
      listings: [],
    };
  }
  const listings = await expandListings(company, primary, directory);
  return {
    companyId: company.id,
    ticker: company.ticker,
    status: listings.length > 0 ? "resolved" : "unresolved",
    note: primary.note,
    listings,
  };
}

/** Resolve a batch, sharing one directory load and one set of OpenFIGI calls. */
export async function resolveCompanies(
  companies: CompanyToResolve[],
): Promise<CompanyResolution[]> {
  const directory = await loadUsDirectory();
  const primaries = await resolvePrimaries(companies, directory);
  const results: CompanyResolution[] = [];
  for (const company of companies) {
    results.push(await buildResolution(company, primaries.get(company.id), directory));
  }
  return results;
}

export { isExchangeListed };
