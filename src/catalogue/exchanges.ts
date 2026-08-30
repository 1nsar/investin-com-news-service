/** Exchange reference.
 *
 *  The catalogue's `exchange_hint` is supplier shorthand ("LSE", "SWX", "DB").
 *  To resolve a ticker we need the venue in codes the resolvers speak:
 *    - OpenFIGI `exchCode` (Bloomberg composite, e.g. LN, GR, JT)
 *    - ISO 10383 MIC, for anything downstream that wants a standard identifier
 *    - the exchange suffix news/market APIs expect (VOD.L, 7203.T, SAP.DE)
 *
 *  Every exchCode below was verified against this catalogue by resolving real
 *  sample tickers through OpenFIGI - not copied from documentation. Where a
 *  hint had no working code (single-company venues in Malta and Bucharest) the
 *  entry is omitted on purpose and those companies fall through to the
 *  name-based resolver.
 *
 *  A hint is never trusted on its own: `ADM` filtered to London still returns
 *  Archer-Daniels-Midland rather than Admiral Group, because ADM cross-lists
 *  there. The resolver always confirms with a name check.
 */
export interface ExchangeRef {
  /** Catalogue hint this entry explains. */
  hint: string;
  /** OpenFIGI exchCode used to disambiguate a ticker. */
  exchCode: string;
  /** Alternate exchCodes to try if the first returns nothing. */
  altExchCodes?: string[];
  mic?: string;
  /** Suffix market-data APIs append, e.g. ".L" -> VOD.L. Empty for US. */
  suffix: string;
  country: string;
  currency?: string;
  isUs: boolean;
  label: string;
}

const REFERENCES: ExchangeRef[] = [
  // --- United States: no suffix, and the only tier the free news providers
  //     cover properly. `is_us` drives provider selection.
  { hint: "NYSE",     exchCode: "US", mic: "XNYS", suffix: "", country: "US", currency: "USD", isUs: true, label: "New York Stock Exchange" },
  { hint: "NASDAQGS", exchCode: "US", mic: "XNAS", suffix: "", country: "US", currency: "USD", isUs: true, label: "Nasdaq Global Select" },
  { hint: "NASDAQGM", exchCode: "US", mic: "XNAS", suffix: "", country: "US", currency: "USD", isUs: true, label: "Nasdaq Global Market" },
  { hint: "NASDAQCM", exchCode: "US", mic: "XNAS", suffix: "", country: "US", currency: "USD", isUs: true, label: "Nasdaq Capital Market" },
  { hint: "XNAS",     exchCode: "US", mic: "XNAS", suffix: "", country: "US", currency: "USD", isUs: true, label: "Nasdaq" },
  { hint: "NYSEAM",   exchCode: "US", mic: "XASE", suffix: "", country: "US", currency: "USD", isUs: true, label: "NYSE American" },
  // Over-the-counter. Tradeable in the US, but news coverage is much thinner
  // than a listed line, so it is marked US without being treated as primary.
  { hint: "OTCPK",    exchCode: "US", mic: "OOTC", suffix: "", country: "US", currency: "USD", isUs: true, label: "OTC Pink" },

  // --- Europe
  { hint: "LSE",    exchCode: "LN", mic: "XLON", suffix: ".L",  country: "GB", currency: "GBP", isUs: false, label: "London Stock Exchange" },
  { hint: "SWX",    exchCode: "SW", mic: "XSWX", suffix: ".SW", country: "CH", currency: "CHF", isUs: false, label: "SIX Swiss Exchange" },
  { hint: "DB",     exchCode: "GR", altExchCodes: ["GY"], mic: "XETR", suffix: ".DE", country: "DE", currency: "EUR", isUs: false, label: "Deutsche Boerse" },
  { hint: "XTRA",   exchCode: "GY", altExchCodes: ["GR"], mic: "XETR", suffix: ".DE", country: "DE", currency: "EUR", isUs: false, label: "Xetra" },
  { hint: "ENXTPA", exchCode: "FP", mic: "XPAR", suffix: ".PA", country: "FR", currency: "EUR", isUs: false, label: "Euronext Paris" },
  { hint: "ENXTBR", exchCode: "BB", mic: "XBRU", suffix: ".BR", country: "BE", currency: "EUR", isUs: false, label: "Euronext Brussels" },
  { hint: "BIT",    exchCode: "IM", mic: "MTAA", suffix: ".MI", country: "IT", currency: "EUR", isUs: false, label: "Borsa Italiana" },
  // Home venues reachable through the identifier sources we already use, added
  // because a company resolved only to an exchange's internal listing code was
  // unfetchable. DO & CO resolved to the LSE international-board code "0E64",
  // which no news provider recognises - while OpenFIGI already returned its
  // Vienna line, "DOC" on AV, for free. The gap was this table, not the data.
  { hint: "WBAG",   exchCode: "AV", mic: "XWBO", suffix: ".VI", country: "AT", currency: "EUR", isUs: false, label: "Wiener Borse" },
  { hint: "BME",    exchCode: "SM", mic: "XMAD", suffix: ".MC", country: "ES", currency: "EUR", isUs: false, label: "Bolsa de Madrid" },
  { hint: "ENXTAM", exchCode: "NA", mic: "XAMS", suffix: ".AS", country: "NL", currency: "EUR", isUs: false, label: "Euronext Amsterdam" },
  { hint: "ISE",    exchCode: "ID", mic: "XDUB", suffix: ".IR", country: "IE", currency: "EUR", isUs: false, label: "Euronext Dublin" },
  { hint: "ENXTLS", exchCode: "PL", mic: "XLIS", suffix: ".LS", country: "PT", currency: "EUR", isUs: false, label: "Euronext Lisbon" },
  { hint: "SHSE",   exchCode: "CH", mic: "XSHG", suffix: ".SS", country: "CN", currency: "CNY", isUs: false, label: "Shanghai Stock Exchange" },
  { hint: "SZSE",   exchCode: "CS", mic: "XSHE", suffix: ".SZ", country: "CN", currency: "CNY", isUs: false, label: "Shenzhen Stock Exchange" },
  { hint: "OM",     exchCode: "SS", mic: "XSTO", suffix: ".ST", country: "SE", currency: "SEK", isUs: false, label: "Nasdaq Stockholm" },
  { hint: "CPSE",   exchCode: "DC", mic: "XCSE", suffix: ".CO", country: "DK", currency: "DKK", isUs: false, label: "Nasdaq Copenhagen" },
  { hint: "OB",     exchCode: "NO", mic: "XOSL", suffix: ".OL", country: "NO", currency: "NOK", isUs: false, label: "Oslo Bors" },
  { hint: "HLSE",   exchCode: "FH", mic: "XHEL", suffix: ".HE", country: "FI", currency: "EUR", isUs: false, label: "Nasdaq Helsinki" },
  { hint: "ATSE",   exchCode: "GA", mic: "XATH", suffix: ".AT", country: "GR", currency: "EUR", isUs: false, label: "Athens Exchange" },
  // Pan-European MTF. Trades other venues' lines, so it is never primary.
  { hint: "BATS-CHIXE", exchCode: "EB", mic: "BATE", suffix: "", country: "GB", currency: "EUR", isUs: false, label: "Cboe Europe" },

  // --- Asia-Pacific
  { hint: "SEHK", exchCode: "HK", mic: "XHKG", suffix: ".HK", country: "HK", currency: "HKD", isUs: false, label: "Hong Kong Stock Exchange" },
  // Ambiguous in the catalogue between Tokyo and Toronto. Every row carrying
  // it resolved as Japanese, so Tokyo leads and Toronto is the alternate.
  { hint: "TSE",  exchCode: "JT", altExchCodes: ["CN"], mic: "XTKS", suffix: ".T",  country: "JP", currency: "JPY", isUs: false, label: "Tokyo Stock Exchange" },
  { hint: "SHSE", exchCode: "C1", mic: "XSHG", suffix: ".SS", country: "CN", currency: "CNY", isUs: false, label: "Shanghai Stock Exchange" },
  { hint: "SZSE", exchCode: "C2", mic: "XSHE", suffix: ".SZ", country: "CN", currency: "CNY", isUs: false, label: "Shenzhen Stock Exchange" },
  { hint: "NSEI", exchCode: "IS", altExchCodes: ["IN"], mic: "XNSE", suffix: ".NS", country: "IN", currency: "INR", isUs: false, label: "National Stock Exchange of India" },
  { hint: "IDX",  exchCode: "IJ", mic: "XIDX", suffix: ".JK", country: "ID", currency: "IDR", isUs: false, label: "Indonesia Stock Exchange" },

  // --- Americas ex-US
  { hint: "TSX",  exchCode: "CN", altExchCodes: ["CT"], mic: "XTSE", suffix: ".TO", country: "CA", currency: "CAD", isUs: false, label: "Toronto Stock Exchange" },
  { hint: "TSXV", exchCode: "CV", mic: "XTSX", suffix: ".V",  country: "CA", currency: "CAD", isUs: false, label: "TSX Venture Exchange" },
  { hint: "BMV",  exchCode: "MM", mic: "XMEX", suffix: ".MX", country: "MX", currency: "MXN", isUs: false, label: "Bolsa Mexicana de Valores" },
];

const BY_HINT = new Map(REFERENCES.map((ref) => [ref.hint.toUpperCase(), ref]));
const BY_EXCH_CODE = new Map<string, ExchangeRef>();
for (const ref of REFERENCES) {
  if (!BY_EXCH_CODE.has(ref.exchCode)) BY_EXCH_CODE.set(ref.exchCode, ref);
}

export function exchangeForHint(hint: string | null | undefined): ExchangeRef | undefined {
  if (!hint) return undefined;
  return BY_HINT.get(hint.trim().toUpperCase());
}

export function exchangeForCode(exchCode: string | null | undefined): ExchangeRef | undefined {
  if (!exchCode) return undefined;
  return BY_EXCH_CODE.get(exchCode.trim().toUpperCase());
}

/** Ordered exchCodes to try for a hint: primary first, then alternates. */
export function candidateExchCodes(hint: string | null | undefined): string[] {
  const ref = exchangeForHint(hint);
  if (!ref) return [];
  return [ref.exchCode, ...(ref.altExchCodes ?? [])];
}

/** OpenFIGI market-centre codes that all roll up to the US composite. Used to
 *  recognise a US venue when the resolver hands back a specific centre. */
const US_EXCH_CODES = new Set([
  "US", "UN", "UW", "UQ", "UR", "UA", "UB", "UC", "UD", "UF", "UM", "UP", "UT", "UV", "UX",
  "PQ", "VJ", "VK", "VY",
]);

export function isUsExchCode(exchCode: string | null | undefined): boolean {
  return !!exchCode && US_EXCH_CODES.has(exchCode.trim().toUpperCase());
}

/** How a venue writes its symbols - decides which providers can be asked. */
export type SymbolFormat = "us" | "suffixed" | "numeric_suffixed" | "unknown";

/** The symbol a global market-data API expects for a venue: VOD + LN -> VOD.L,
 *  7203 + JT -> 7203.T. Listings store the venue's own bare symbol, which is
 *  ambiguous across exchanges - "BBY" is Balfour Beatty in London and Best Buy
 *  in New York - so anything querying a GLOBAL provider must qualify it. */
/** London's international board lists foreign companies under a synthetic
 *  `0XXX` code - Heijmans is "0M6I", Magyar Telekom "0NUG". It is a valid
 *  identifier and a useless one: no news provider recognises it, and "0M6I.L"
 *  matches nothing. Because a suffix COULD be appended, these looked queryable
 *  and were fetched with a dead symbol, producing a clean zero indistinguishable
 *  from a quiet week. */
export function isLondonBoardCode(exchCode: string, symbol: string): boolean {
  const exch = exchCode.trim().toUpperCase();
  if (exch !== "LN" && exch !== "LO") return false;
  return /^0[A-Z0-9]{3}$/.test(symbol.trim().toUpperCase());
}

export function marketSymbol(exchCode: string, symbol: string): string | null {
  const ref = exchangeForCode(exchCode);
  // No suffix mapping for this venue - the bare symbol is ambiguous to a
  // global provider, so return null rather than a symbol that means a
  // different company somewhere else. Affects London International board
  // codes (LO), TRACE, and a handful of others: 97 listings here.
  if (!ref || !ref.suffix) return null;
  // A board code cannot produce a working symbol, so say so here rather than
  // handing back something that only looks usable.
  if (isLondonBoardCode(exchCode, symbol)) return null;

  // Bloomberg writes an LSE ticker's trailing dot as a slash - Aviva is "AV/",
  // BAE "BA/", Rolls-Royce "RR/", QinetiQ "QQ/" - and that is the form the
  // identifier sources return. Appending a suffix to it produces "QQ/.L",
  // which matches nothing: the provider holds 201 articles under "QQ.L" and
  // returned a clean zero for the mangled form. A false "no news" on four
  // major UK companies, indistinguishable from a genuinely quiet week.
  const base = symbol.replace(/\//g, "");
  if (!base) return null;
  return base.includes(".") ? base : `${base}${ref.suffix}`;
}

export function symbolFormatFor(exchCode: string, symbol: string): SymbolFormat {
  if (isUsExchCode(exchCode)) return "us";
  const ref = exchangeForCode(exchCode);
  if (!ref) return "unknown";
  return /^\d/.test(symbol) ? "numeric_suffixed" : "suffixed";
}

