import { createHash } from "node:crypto";
import type { RawArticle } from "../providers/types.js";

/** Article canonicalisation and the dedupe key.
 *
 *  Idempotent ingest is criterion 4: a daily re-run over an overlapping window
 *  must not create a second copy of a story. That requires a key that is
 *  stable across runs and across the tracking junk publishers append.
 *
 *  Two stories are the same when their canonical URL matches. URL alone is not
 *  quite enough - syndicated copies of one wire story appear under several
 *  URLs - so a secondary key over (normalised headline, publication day) is
 *  also recorded, and the ingest treats a hit on either as a duplicate. */

/** Query parameters that never change which article you get. */
const TRACKING_PARAMS = [
  /^utm_/i, /^ic[ni]d$/i, /^cmpid$/i, /^ref$/i, /^ref_?src$/i, /^src$/i,
  /^fbclid$/i, /^gclid$/i, /^msclkid$/i, /^mc_[ce]id$/i, /^_ga$/i,
  /^yptr$/i, /^guccounter$/i, /^guce_/i, /^spm$/i, /^share/i, /^__twitter/i,
  /^at_(medium|campaign)$/i, /^cid$/i, /^partner$/i, /^smid$/i, /^ito$/i,
];

const AMP_SUFFIX = /\/amp(\/|$)|\.amp(\/|$)/i;

export function canonicalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) url.searchParams.delete(key);
  }
  // Deterministic ordering: ?b=2&a=1 and ?a=1&b=2 are one article.
  url.searchParams.sort();

  url.pathname = url.pathname.replace(AMP_SUFFIX, "/").replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  const search = url.searchParams.toString();
  return `${url.protocol}//${url.hostname}${url.pathname}${search ? `?${search}` : ""}`;
}

export function normalizeHeadline(headline: string): string {
  return headline
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 40);

/** Primary key: the canonical URL. */
export function dedupeHash(canonicalUrl: string): string {
  return sha256(`url:${canonicalUrl}`);
}

/** Secondary key: same headline, same publication day. Catches wire copy
 *  syndicated to several outlets under different URLs. */
export function contentHash(headline: string, publishedAt: Date): string {
  const day = publishedAt.toISOString().slice(0, 10);
  return sha256(`content:${normalizeHeadline(headline)}:${day}`);
}

export interface CanonicalArticle {
  dedupeHash: string;
  contentHash: string;
  url: string;
  urlCanonical: string;
  headline: string;
  summary: string | null;
  source: string | null;
  publishedAt: Date;
  imageUrl: string | null;
  language: string | null;
}

/** Google News wraps every link in a redirect through its own domain. The
 *  real publisher is appended to the RSS title as " - Reuters". */
const GOOGLE_TITLE_SOURCE = /\s+-\s+([^-]{2,40})$/;

export function canonicalize(article: RawArticle, provider: string): CanonicalArticle | null {
  const url = (article.url ?? "").trim();
  const headline = (article.headline ?? "").trim();
  if (!url || !headline) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  const publishedAt =
    article.publishedAt instanceof Date && !Number.isNaN(article.publishedAt.getTime())
      ? article.publishedAt
      : new Date();

  let source = article.source ?? null;
  let cleanHeadline = headline;
  if (provider === "google_news_rss") {
    // Google appends " - Publisher" to every RSS title AND supplies <source>,
    // so gating this on a missing source meant the suffix was never stripped.
    // That polluted the headline shown to consumers and, worse, fed the
    // suffix into `contentHash` - so the syndication dedupe key could never
    // match the same story arriving from another provider.
    const match = GOOGLE_TITLE_SOURCE.exec(headline);
    if (match) {
      source = source ?? match[1] ?? null;
      cleanHeadline = headline.slice(0, match.index).trim();
    }
  }

  const urlCanonical = canonicalizeUrl(url);
  return {
    dedupeHash: dedupeHash(urlCanonical),
    contentHash: contentHash(cleanHeadline, publishedAt),
    url,
    urlCanonical,
    headline: cleanHeadline,
    summary: article.summary?.trim() || null,
    source: source?.trim() || null,
    publishedAt,
    imageUrl: article.imageUrl?.trim() || null,
    language: article.language ?? null,
  };
}
