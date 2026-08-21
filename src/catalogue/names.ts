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
  "ltd", "limited", "plc", "llc", "lp", "llp", "trust", "the",
  "sa", "sas", "sca", "se", "ag", "kgaa", "nv", "bv", "as", "asa", "ab", "oyj", "oy",
  "spa", "srl", "aps", "a", "s", "gmbh", "pcl", "tbk", "bhd", "pte", "pt",
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
  natl: "national", nat: "national",
  amer: "american", am: "american",
  wash: "washington",
  mfg: "manufacturing", mfrs: "manufacturers",
  ind: "industries", inds: "industries", indus: "industries",
  svc: "services", svcs: "services", serv: "services",
  tech: "technologies", techs: "technologies", technol: "technologies",
  pharm: "pharmaceuticals", pharma: "pharmaceuticals",
  fin: "financial", finl: "financial",
  res: "resources", rlty: "realty", ppty: "property", prop: "properties",
  comms: "communications", comm: "communications",
  sys: "systems", lab: "laboratories", labs: "laboratories",
  entmt: "entertainment", enterp: "enterprises",
  dev: "development", mgmt: "management",
  intl_: "international",
};

/** Aggressive key used for equality: accents folded, punctuation dropped,
 *  legal forms removed. "Moet Hennessy Louis Vuitton SE" -> "moet hennessy
 *  louis vuitton". */
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
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => ABBREVIATIONS[token] ?? token)
    .filter((token) => token && !NOISE_WORDS.has(token));
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

  let shared = 0;
  for (const token of new Set(shorter)) {
    if (longerSet.has(token)) shared += 1;
    else if (token.length >= 3 && longer.some((other) => other.startsWith(token) || token.startsWith(other))) {
      shared += 0.85;
    }
  }
  if (shared === 0) return 0;

  const containment = shared / Math.min(setA.size, setB.size);
  const jaccard = shared / (setA.size + setB.size - shared);
  // Weighted towards containment, but a much longer name still costs a little.
  const score = containment * 0.75 + jaccard * 0.25;

  // A single shared token is weak evidence when either name has several
  // ("Shanghai Airport" vs "Shanghai Electric"), so cap it.
  if (shared <= 1 && (setA.size > 1 || setB.size > 1)) return Math.min(score, 0.59);
  return Math.min(1, score);
}

/** The bar a resolution must clear to be accepted automatically. Chosen from
 *  the catalogue: 0.6 accepts "Novo Nordisk A/S" vs "NOVO NORDISK A/S-B" and
 *  rejects the ticker collisions this catalogue is full of. */
export const NAME_MATCH_THRESHOLD = 0.6;

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
