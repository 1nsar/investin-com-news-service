/** Company-name normalisation and comparison.
 *
 *  Two jobs depend on this:
 *    1. Confirming a resolved security really is the company we asked about.
 *       An exchange filter is not enough on its own - `ADM` on London resolves
 *       to Archer-Daniels-Midland, not Admiral Group - so every resolution is
 *       gated on the name agreeing.
 *    2. Finding a company's US line in the US symbol directory, where the same
 *       business is written "TOYOTA MOTOR CORP -SPON ADR" or "NESTLE SA-REG".
 */

/** Legal forms, share-class markers and depositary-receipt noise. Stripped
 *  before comparison so "Toyota Motor Corp" and "TOYOTA MOTOR CORP -SPON ADR"
 *  reduce to the same key. */
const NOISE_WORDS = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "cos",
  "ltd", "limited", "plc", "llc", "lp", "llp", "trust", "the", "companies",
  "sa", "sas", "sca", "se", "ag", "kgaa", "nv", "bv", "as", "asa", "ab", "oyj", "oy",
  "spa", "srl", "aps", "a", "s", "gmbh", "pcl", "tbk", "bhd", "pte", "pt",
  // Nordic and other national legal forms, same role as "plc" or "ag".
  // Only forms confirmed against this catalogue. "aksigorta" was here by
  // mistake - it is a Turkish insurer's NAME, and listing it normalised that
  // company to the empty string.
  "abp", "hf", "ehf",
  "holding", "holdings", "hldgs", "hldg", "group", "grp", "groupe",
  "adr", "adrs", "ads", "gdr", "gdrs", "spon", "spons", "sponsored",
  "unspon", "unsponsored", "repr", "reptg", "represented",
  "reg", "registered", "regd", "shs", "shares", "share", "stk", "stock",
  "cl", "class", "series", "ser", "ord", "ordinary", "npv", "new", "unitary",
  "b", "c",
  // Connectives: never distinguishing, and previously able to match alone.
  "and", "of", "the", "for",
]);

const ACCENTS = /[\u0300-\u036f]/g;

/** Abbreviations the reference sources use but the catalogue spells out.
 *  Bloomberg-style descriptions are heavily contracted ("BABCOCK INTL GROUP",
 *  "EXPEDITORS INTL WASH INC"), and without expanding them the name check
 *  rejects correct matches - which shows up as a company that cannot be
 *  resolved rather than as an obvious bug. */
const ABBREVIATIONS: Record<string, string> = {
  intl: "international", intn: "international", intnl: "international",
  natl: "national",
  amer: "american",
  wash: "washington",
  mfg: "manufacturing", mfrs: "manufacturers",
  inds: "industries", indus: "industries",
  svc: "services", svcs: "services", serv: "services",
  tech: "technologies", techs: "technologies", technol: "technologies",
  pharm: "pharmaceuticals", pharma: "pharmaceuticals",
  fin: "financial", finl: "financial",
  rlty: "realty", ppty: "property", prop: "properties",
  comms: "communications", comm: "communications",
  sys: "systems", labs: "laboratories",
  entmt: "entertainment", enterp: "enterprises",
  dev: "development", mgmt: "management",
  intl_: "international",
};

/** Aggressive key used for equality: accents folded, punctuation dropped,
 *  legal forms removed. "Moet Hennessy Louis Vuitton SE" -> "moet hennessy
 *  louis vuitton". */
/** Known equivalences the surface-form matcher cannot derive.
 *
 *  `nameSimilarity` compares normalised tokens, so it cannot know that a
 *  company's trading name is the same entity as its legal name, or that a
 *  supplier's English name and a directory's native-language name refer to one
 *  company. Both produce a *false rejection*: the identifier is right, the
 *  names simply do not look alike.
 *
 *  Deliberately a small, explicit, auditable list rather than fuzzy matching -
 *  each entry is a decision someone made and can check. Keys are normalised
 *  names, so add entries in whatever case is convenient. */
const NAME_ALIASES: Array<[string, string]> = [
  // Trading name vs legal name.
  ["wabtec", "westinghouse air brake technologies"],
  // Native-language directory name vs the supplier's English name.
  ["muenchener rueckver", "munich reinsurance"],
  ["muenchener rueckversicherungs", "munich reinsurance"],
  // Corporate renames. The directory carries the new name, the catalogue the
  // old one; no amount of string similarity can bridge a rename.
  ["novozymes", "novonesis"],
  // Shortened trade name vs the supplier's fuller form.
  ["adobe systems", "adobe"],
  // Spanish abbreviations the supplier uses for a very long legal name. The
  // directory abbreviates differently again ("cons y serv"), so both forms are
  // linked rather than trying to expand abbreviations generically.
  ["acs actividades constr y srvcs", "acs actividades de construccion y servicios"],
  ["acs actividades constr y srvcs", "acs actividades cons y services"],
  ["acs actividades constr y srvcs", "acs actividades cons y serv"],
  // A rename where the directory keeps BOTH names: "NOVONESIS (NOVOZYMES) B".
  ["novozymes", "novonesis novozymes"],
  // Holding company written under its short trading name.
  ["l e lundbergforetagen publ", "lundbergs"],
  ["l e lundbergforetagen", "lundbergs"],
  ["construcciones y auxiliar de ferrocarriles", "caf"],
];

const ALIAS_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    const key = normalizeName(a);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key)!.add(normalizeName(b));
  };
  for (const [a, b] of NAME_ALIASES) {
    link(a, b);
    link(b, a);
  }
  return index;
})();

/** True when two names are known to denote the same company. */
export function isKnownAlias(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  return Boolean(ALIAS_INDEX.get(a)?.has(b)) || Boolean(ALIAS_INDEX.get(b)?.has(a));
}

export function normalizeName(raw: string): string {
  if (!raw) return "";
  const folded = raw.normalize("NFD").replace(ACCENTS, "").toLowerCase();
  const tokens = folded
    // "&" is joined, NOT expanded to " and ". Expanding it made AT&T, PG&E,
    // M&G and S&P Global reduce to a token list containing "and", which then
    // matched any headline containing the word "and".
    .replace(/&/g, "")
    // Apostrophes and periods are dropped WITHOUT a space, so "BRINK'S"
    // becomes "brinks" and "(A.O.)" becomes "ao" rather than fragmenting into
    // single letters that the noise filter then eats.
    // Web TLDs are part of a brand's spelling, not its identity:
    // "TABOOLA.COM LTD" and "Taboola" are one company, but stripping the dot
    // without removing "com" produced "taboolacom" and scored 0.000.
    .replace(/\.(com|net|org|io|ai|co)\b/g, "")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => ABBREVIATIONS[token] ?? token)
    .filter((token) => token && !NOISE_WORDS.has(token));

  // A trailing single letter is a venue marker, not part of the name. The
  // supplier writes the London line of Safran as "Safran L", of Orkla as
  // "Orkla L". Against the directory's "SAFRAN SA" that scored 0.59 - one
  // hundredth below the 0.60 match threshold - so five large, actively traded
  // companies were reported unresolved because of a one-character suffix.
  //
  // Only dropped when something distinctive remains, so a genuine one-word
  // name is never emptied.
  if (tokens.length > 1 && tokens[tokens.length - 1]!.length === 1) tokens.pop();

  return tokens.join(" ");
}

/** 0..1 similarity. 1.0 means the normalised keys are identical; partial
 *  scores come from token containment, so "Novo Nordisk" vs "Novo Nordisk A/S
 *  B" still scores high while "Admiral" vs "Archer Daniels Midland" scores 0.
 *
 *  Containment rather than Jaccard on purpose: directory names are often a
 *  superset ("SIEMENS ENERGY AG SPON ADR"), and penalising the extra tokens
 *  would reject correct matches. */
export function nameSimilarity(left: string, right: string): number {
  // A curated equivalence outranks surface similarity: these are the pairs the
  // token comparison provably gets wrong.
  if (isKnownAlias(left, right)) return 1;
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  // Tokenisation differences alone should not fail a match: "Auto Trader" and
  // "AUTOTRADER" are the same company written two ways.
  if (a.replace(/ /g, "") === b.replace(/ /g, "")) return 1;

  const tokensA = a.split(" ");
  const tokensB = b.split(" ");
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  // Reference descriptions are often truncated to a fixed width
  // ("CONCENTRA GROUP HOLDINGS PAR"), so a token that is a prefix of its
  // counterpart counts, at a small discount.
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);

  // Two shapes of truncation, with different evidence.
  //
  //  1. Fixed-width cut: the LAST word is clipped and the rest are intact
  //     ("CONCENTRA GROUP HOLDINGS PAR"). Position carries the signal, so the
  //     clipped stem may be short.
  //  2. Word-by-word abbreviation: every word shortened
  //     ("CONSTRUCC Y AUX DE FERROCARR"). Position carries nothing, so BOTH
  //     sides must be substantial words - otherwise every word of a three-word
  //     name claims credit against a stray initial, which scored "Martin
  //     Marietta Materials" at 0.78 against "H & M Hennes & Mauritz".
  const prefixMatch = (token: string, minOther: number): boolean =>
    longer.some(
      (other) => other.length >= minOther && (other.startsWith(token) || token.startsWith(other)),
    );

  let shared = 0;
  for (const token of new Set(shorter)) {
    if (longerSet.has(token)) {
      shared += 1;
      continue;
    }
    if (token.length < 3 || shorter.length < 2) continue;

    const isLastToken = token === shorter[shorter.length - 1];
    const credited = isLastToken
      ? prefixMatch(token, 3)
      : shorter.length >= 3 && token.length >= 4 && prefixMatch(token, 4);

    if (credited) shared += 0.85;
  }

  if (shared === 0) return 0;

  const containment = shared / Math.min(setA.size, setB.size);
  const jaccard = shared / (setA.size + setB.size - shared);
  // Weighted towards containment, but a much longer name still costs a little.
  const score = containment * 0.75 + jaccard * 0.25;

  // One name being wholly contained in the other is strong evidence, even on a
  // single token: "AECOM" vs "AECOM Technology", "Travelers" vs "Travelers
  // Companies", "HCA" vs "HCA Healthcare" are all the same company written at
  // different lengths.
  //
  // But containment of a ONE-token name into a much longer one is not: "Apple"
  // sits inside "Apple Hospitality REIT" and they are unrelated. So a
  // single-token name only counts as contained when the other name is short
  // too - a genuine abbreviation, not a coincidental prefix.
  // Containment counts only when the contained name has at least TWO tokens.
  //
  // A one-token containment is structurally ambiguous and cannot be resolved
  // from the names alone: "AECOM" inside "AECOM Technology" is the same
  // company, "Prudential" inside "Prudential Financial" is a different one
  // (a UK insurer versus a US insurer, both real rows in this catalogue).
  // An earlier version allowed it whenever the longer name had <= 2 tokens,
  // which accepted Prudential, "Apple" vs "Apple Hospitality", "Sea Limited"
  // vs "Sea World" and "Nike" vs "Nike Securities".
  //
  // Those cases are not lost - they fall to the rename path in the resolver,
  // which additionally requires the ticker to have matched on the hinted
  // exchange and records the result at reduced confidence with a flag.
  const shorterSize = Math.min(setA.size, setB.size);
  const fullyContained = shared === shorterSize;
  if (fullyContained && shorterSize >= 2) {
    return Math.min(1, Math.max(score, 0.75));
  }

  // Otherwise a single shared token is weak evidence when either name has
  // several ("Shanghai Airport" vs "Shanghai Electric"), so cap it below the
  // acceptance threshold.
  if (shared <= 1 && (setA.size > 1 || setB.size > 1)) return Math.min(score, 0.59);
  return Math.min(1, score);
}

/** The bar a resolution must clear to be accepted automatically. Chosen from
 *  the catalogue: 0.6 accepts "Novo Nordisk A/S" vs "NOVO NORDISK A/S-B" and
 *  rejects the ticker collisions this catalogue is full of. */
export const NAME_MATCH_THRESHOLD = 0.6;

/** How many distinctive tokens two names share.
 *
 *  Used to separate a RENAME from a COLLISION. Both look like "the resolved
 *  name does not match the catalogue name", but they are opposites:
 *
 *    rename    Sterling Construction  vs STERLING INFRASTRUCTURE   -> 1 shared
 *    collision Admiral Group          vs ARCHER-DANIELS-MIDLAND    -> 0 shared
 *
 *  Measured across this catalogue, every one of the seven known ticker
 *  collisions shares zero tokens, while renames share at least one. */
export function sharedTokenCount(left: string, right: string): number {
  const a = new Set(normalizeName(left).split(" ").filter(Boolean));
  const b = new Set(normalizeName(right).split(" ").filter(Boolean));
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared;
}

/** Search-friendly form: legal suffixes gone, accents kept. Feeding "Muenchener
 *  Rueckversicherungs-Gesellschaft AG" to a news search returns nothing; the
 *  trimmed form returns the coverage we expect. */
export function searchableName(raw: string): string {
  if (!raw) return "";
  const withoutParens = raw.replace(/\([^)]*\)/g, " ");
  const tokens = withoutParens
    .replace(/[|]/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    const bare = token.replace(/[^A-Za-z0-9&.\-']/g, "");
    if (!bare) continue;
    if (NOISE_WORDS.has(bare.toLowerCase().replace(/\./g, ""))) continue;
    kept.push(bare);
  }
  const result = kept.join(" ").replace(/\s+/g, " ").trim();
  return result || raw.trim();
}

/** Supplier tickers occasionally use `_` where the rest of the catalogue uses
 *  `.` as the venue separator — `LVMH_F` beside `SAPG.F`, `RYAA_Y` beside
 *  `LVMU.Y`. The underscore form matches nothing in any identifier source, so
 *  the row resolves to nothing for a purely cosmetic reason.
 *
 *  Returns the ticker as given, plus any equivalent spellings worth trying,
 *  most-likely first and without duplicates. */
export function tickerVariants(raw: string): string[] {
  const ticker = raw.trim().toUpperCase();
  const variants = [ticker];
  if (ticker.includes("_")) variants.push(ticker.replace(/_/g, "."));
  if (ticker.includes(".")) variants.push(ticker.replace(/\./g, "_"));
  return [...new Set(variants.filter(Boolean))];
}

/** The country a company's legal form implies.
 *
 *  A European company's home exchange is where its news is written, but the
 *  catalogue's country column describes the LISTING we were given - every
 *  London line says "GB" regardless of the issuer. The legal suffix is a more
 *  honest signal: "Sweco AB" is Swedish, "Per Aarsleff Holding A/S" Danish,
 *  whatever venue the row happens to name.
 *
 *  Used only to PREFER a venue, never to reject one, so a wrong guess costs
 *  nothing beyond ordering. */
const LEGAL_FORM_COUNTRY: Array<[RegExp, string]> = [
  [/\bab\b|\bpubl\b/i, "SE"],
  [/\ba\/s\b|\baps\b/i, "DK"],
  [/\basa\b/i, "NO"],
  [/\boyj\b|\babp\b/i, "FI"],
  [/\bspa\b|\bs\.p\.a\b|\bsrl\b/i, "IT"],
  [/\bnv\b|\bn\.v\b|\bbv\b/i, "NL"],
  [/\bag\b|\bgmbh\b|\bkgaa\b/i, "DE"],
  [/\bplc\b/i, "GB"],
  [/\bnyrt\b|\brt\b/i, "HU"],
];

export function homeCountryFromName(companyName: string): string | null {
  for (const [pattern, country] of LEGAL_FORM_COUNTRY) {
    if (pattern.test(companyName)) return country;
  }
  return null;
}
