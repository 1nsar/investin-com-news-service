import { normalizeName } from "../catalogue/names.js";

/** Article relevance and source quality.
 *
 *  Fetching news is only half the job. A feed for investors has to answer a
 *  harder question than "does this article mention the company": is this story
 *  *about* the company, from a source worth trusting, and likely to matter?
 *
 *  Measured on this catalogue, the raw feed fails that test in three distinct
 *  ways, and each gets its own signal here:
 *
 *   1. Misattribution. Name-based search files a story about the "Club Kid"
 *      film under Kid ASA, and a BMW story under Jensen-Group. Only 63% of
 *      name-matched articles even contained the company's name.
 *   2. Round-ups. "Today's top movers in the S&P500" is filed against 28
 *      companies and is news about none of them. 10% of articles produce 38%
 *      of feed rows this way.
 *   3. Source quality. 87% of articles come from three aggregators rather
 *      than a primary wire.
 *
 *  Everything here is deterministic - no language model is involved. That is a
 *  deliberate security property, not a limitation: article text is written by
 *  third parties and is exactly the kind of attacker-influenceable input that
 *  should never steer a pipeline. Rules can be audited, tested and explained
 *  to a user; a model's judgement on untrusted text cannot.
 */

/* ------------------------------------------------------------------ sources */

/** 1 = primary wires and newspapers of record. 2 = established financial
 *  media. 3 = aggregators, screeners and syndicated commentary - real content,
 *  but rarely first and rarely exclusive. Unknown publishers default to 3. */
const SOURCE_TIERS: [RegExp, 1 | 2 | 3][] = [
  [/\b(reuters|bloomberg|associated press|^ap$|dow jones|wall street journal|wsj|financial times|\bft\b|nikkei|handelsblatt|les echos|el pais|the times|new york times|nytimes|washington post|guardian|bbc|cnbc|npr|axios|politico)\b/i, 1],
  [/\b(marketwatch|barron|investor's business daily|investors business daily|forbes|fortune|business insider|the economist|morningstar|investing\.com|reuters events|globe and mail|south china morning post|straits times|economic times|business standard|livemint|handelsbanken)\b/i, 2],
  [/\b(yahoo|seeking ?alpha|benzinga|zacks|motley fool|simply wall st|tipranks|insider monkey|gurufocus|chartmill|fintel|stocktwits|kalkine|scanx|marketscreener|tradingview|newsfile|globe ?newswire|business ?wire|pr ?newswire|accesswire)\b/i, 3],
];

export function sourceTier(source: string | null | undefined): 1 | 2 | 3 {
  if (!source) return 3;
  for (const [pattern, tier] of SOURCE_TIERS) if (pattern.test(source)) return tier;
  return 3;
}

/* ------------------------------------------------- company-name verification */

/** Company names that collapse to a single everyday English word. A name
 *  search for these matches almost anything, so a bare mention proves nothing
 *  and the article needs corroborating financial context. */
const AMBIGUOUS_TOKENS = new Set([
  "kid", "move", "auto", "safari", "admiral", "gap", "next", "shell", "orange",
  "apple", "amazon", "target", "sound", "future", "capital", "national", "general",
  "united", "american", "global", "first", "premier", "pioneer", "summit", "eagle",
  "phoenix", "atlas", "titan", "delta", "alpha", "omega", "vantage", "spark",
  "core", "edge", "peak", "bridge", "harbour", "harbor", "crown", "royal", "star",
  "sun", "moon", "river", "field", "stone", "iron", "steel", "gold", "silver",
  // Added after each of these matched ordinary English usage in a macro story:
  // "we're booking a five-fold profit", "Francisco Partners to buy Weave".
  "booking", "partners", "mosaic", "advance", "liberty", "heritage", "legacy",
  "frontier", "cardinal", "corning", "public", "middle", "graphic", "element",
]);

/** Words that indicate the article is actually about a business.
 *
 *  Deliberately does NOT include generic words like "partnership" or "new":
 *  the list is the sole discriminator for single-word company names, and it
 *  has to keep rejecting "Elon Musk and Jensen Huang's New Partnership" while
 *  accepting "Softcat Wins Major Contract". */
const FINANCE_CONTEXT =
  /\b(shares?|stock|stocks|equity|earnings|revenue|profit|loss|guidance|forecast|dividend|buyback|acquisition|acquires?|merger|takeover|ipo|listing|delisting|quarterly|q[1-4]|fiscal|results|outlook|analyst|rating|upgrade|downgrade|price target|market cap|ceo|cfo|chairman|board|nasdaq|nyse|lse|ftse|dax|nikkei|investors?|shareholders?|trading|valuation|bond|debt|financing|contract|contract award|regulator|antitrust|sec filing|customer|supplier|deal|stake|funding|invest(?:ment|or)?|sales|layoffs|factory|plant|expansion|rival|competitor|launch)\b/i;

export interface NameVerification {
  verified: boolean;
  reason: string;
}

/** Does this article plausibly concern this company?
 *
 *  Applied only to name-matched results; ticker-native results come from a
 *  provider that already knows which symbol it was asked about. */
export function verifyNameMatch(
  companyName: string,
  headline: string,
  summary?: string | null,
): NameVerification {
  const haystack = `${headline} ${summary ?? ""}`;
  // Accents are folded here exactly as `normalizeName` folds them in the
  // company name. Without this "Société Générale" could never match its own
  // correctly-accented headline, while the unaccented spelling did.
  // Folded and de-punctuated exactly as `normalizeName` treats the company
  // name, so "AT&T" in a headline matches the token "att", and "Société"
  // matches "societe".
  const lower = haystack
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "")
    .toLowerCase();

  // Two characters is the floor, not three: "3M", "HP", "3i", "Q2" and "VZ"
  // are whole company names, and a 3-character floor left them with no token
  // at all, silently rejecting every name-matched article for them.
  const tokens = normalizeName(companyName).split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) {
    return { verified: false, reason: "company name has no distinctive tokens" };
  }
  // Short tokens collide easily, so they are held to the ambiguous-name bar.
  const isShort = (t: string): boolean => t.length <= 2;

  const present = tokens.filter((token) =>
    new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower),
  );

  // A multi-word name needs at least two of its tokens present.
  //
  // One token is far too weak: "Bloom Energy" would otherwise match every
  // article containing the word "energy", and "Duke Energy", "Vistra Energy"
  // and thirty others would match the same story. That single rule produced
  // 1,262 spurious company links from 163 macro articles before it was fixed.
  if (tokens.length >= 2) {
    if (present.length >= 2) {
      return { verified: true, reason: `matched ${present.length}/${tokens.length} name tokens` };
    }
    return {
      verified: false,
      reason: `only ${present.length}/${tokens.length} name tokens present`,
    };
  }

  // Single-token name. Two different ways this goes wrong, and both happened:
  //
  //   * ordinary English words - "Club Kid" filed under Kid ASA;
  //   * surnames - every "Jensen Huang" story filed under Jensen-Group,
  //     because "Jensen-Group" reduces to the single token "jensen".
  const token = tokens[0] as string;
  if (present.length === 0) {
    return { verified: false, reason: `name "${token}" not mentioned` };
  }

  // A single-token company name is weak evidence on its own, whatever the
  // token is. Requiring the article to be recognisably about business is a
  // simpler and far more robust discriminator than trying to tell a surname
  // from a verb by capitalisation:
  //
  //   "Jensen Huang ... Redefine NVIDIA"        -> no financial context, rejected
  //   "Jensen Releases Wyoming Golf Schedule"   -> no financial context, rejected
  //   "Broadcom Announces Q3 Results"           -> "q3"/"results", accepted
  //   "Jensen Group reports record revenue"     -> "revenue", accepted
  //
  // An earlier version inspected the capitalisation of the following word.
  // That inference collapses in title-cased headlines, which are the dominant
  // real form, and it rejected genuine coverage for every single-token name.
  if (!FINANCE_CONTEXT.test(haystack)) {
    return {
      verified: false,
      reason: `single-word name "${token}" with no financial context in the article`,
    };
  }
  const kind = AMBIGUOUS_TOKENS.has(token) || isShort(token) ? "short or ambiguous" : "distinctive";
  return { verified: true, reason: `${kind} name "${token}" with financial context` };
}

/** Strict check used for market-wide stories.
 *
 *  A macro story is not *about* any company, so linking one to a company
 *  timeline needs much stronger evidence than an ordinary company-news match:
 *  the company's normalised name must appear as a contiguous phrase, not as
 *  scattered tokens. "US to announce steps to help refiners produce more fuel"
 *  should reach the market feed and nobody's company page. */
export function mentionsCompanyExactly(companyName: string, text: string): boolean {
  const phrase = normalizeName(companyName);
  if (!phrase || phrase.length < 4) return false;

  // Single-word company names get the ambiguity check rather than a blanket
  // rejection. "Broadcom" and "Copart" are distinctive enough that a mention
  // in a market story is real; "Booking", "Partners" and "Mosaic" are ordinary
  // English and matched usages like "we're booking a five-fold profit", so
  // they additionally require financial context.
  if (!phrase.includes(" ")) {
    if (!verifyNameMatch(companyName, text).verified) return false;
    // A macro story almost always contains financial words, so the ambiguity
    // check alone still let "we're booking a five-fold profit" through as
    // Booking Holdings. Requiring the word to appear capitalised, as a proper
    // noun would be, separates the company from the verb.
    if (AMBIGUOUS_TOKENS.has(phrase)) {
      const proper = new RegExp(
        `(^|[^A-Za-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")[0]!.toUpperCase()}${phrase.slice(1)}\\b`,
      );
      return proper.test(text);
    }
    return true;
  }
  const normalizedText = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalizedText);
}

/* -------------------------------------------------------------- relevance */

export interface RelevanceInput {
  matchMethod: "ticker" | "name_match";
  companyName: string;
  headline: string;
  summary?: string | null;
  source?: string | null;
}

export interface RelevanceResult {
  /** 0..1. Below `RELEVANCE_FLOOR` the link is not stored at all. */
  score: number;
  reason: string;
  verified: boolean;
}

/** Links below this are rejected at ingest rather than stored and hidden.
 *  Storing known-wrong attributions "just in case" is how a feed loses trust. */
export const RELEVANCE_FLOOR = 0.35;

/** An article filed against more than this many companies is a round-up. */
export const ROUNDUP_THRESHOLD = 8;

/** Round-up penalty, applied at READ time where the live company count is
 *  known. Kept next to the ingest scoring so the two cannot drift. */
export const roundupPenaltySql = (countExpr: string): string =>
  `(CASE WHEN ${countExpr} >= ${ROUNDUP_THRESHOLD} THEN 0.35
         WHEN ${countExpr} >= 4 THEN 0.15
         ELSE 0 END)`;

export function scoreRelevance(input: RelevanceInput): RelevanceResult {
  const reasons: string[] = [];
  let score: number;

  if (input.matchMethod === "ticker") {
    // The provider was asked about a specific resolved symbol.
    score = 0.9;
    reasons.push("ticker-native");
  } else {
    const check = verifyNameMatch(input.companyName, input.headline, input.summary);
    if (!check.verified) {
      return { score: 0, reason: check.reason, verified: false };
    }
    score = 0.6;
    reasons.push(check.reason);
  }

  // NOTE: the round-up penalty is deliberately NOT applied here.
  //
  // How many companies an article ends up filed against is not known while it
  // is being stored - later companies in the same run add more links. Applying
  // it here meant every article scored as "company-specific", including one
  // filed against 53 companies. The penalty is applied at read time instead,
  // where the live count is available (see `roundupPenaltySql`).

  const tier = sourceTier(input.source);
  if (tier === 1) {
    score += 0.1;
    reasons.push("primary source");
  } else if (tier === 3) {
    score -= 0.05;
    reasons.push("aggregator");
  }

  return {
    score: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
    reason: reasons.join("; "),
    verified: true,
  };
}
