import { plainText } from "./text.js";

export interface OfficialImage { url: string; attribution: string }

const MAX_HTML_LENGTH = 2_000_000;
const MAX_TAGS = 20_000;
const MAX_FIGURES = 30;
const MAX_IMAGES = 20;

interface HtmlElement { opening: string; content: string; end: number }

function attribute(opening: string, name: string): string | null {
  // Attribute names are matched separately: data-src must never become src.
  const attributes = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of opening.matchAll(attributes)) {
    if (match[1]?.toLowerCase() === name) return match[2] ?? match[3] ?? match[4] ?? "";
  }
  return null;
}

function hasClass(opening: string, name: string): boolean {
  return attribute(opening, "class")?.split(/\s+/).includes(name) === true;
}

/** A bounded, balanced element selection, including nested divs and tables. */
function element(html: string, tag: string, accepts: (opening: string) => boolean): HtmlElement | null {
  const tags = /<\/?([a-z][a-z0-9:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  let start = -1, depth = 0, count = 0, opening = "";
  for (const match of html.matchAll(tags)) {
    if (++count > MAX_TAGS) return null;
    if (match[1]?.toLowerCase() !== tag) continue;
    const closing = match[0].startsWith("</");
    if (start < 0) {
      if (!closing && !/\/\s*>$/.test(match[0]) && accepts(match[0])) {
        start = match.index! + match[0].length; depth = 1; opening = match[0];
      }
    } else {
      depth += closing ? -1 : /\/\s*>$/.test(match[0]) ? 0 : 1;
      if (depth === 0) return { opening, content: html.slice(start, match.index), end: match.index! + match[0].length };
    }
  }
  return null;
}

function releaseIdentity(articleUrl: string): { url: URL; year: string; date: string } | null {
  try {
    const url = new URL(articleUrl);
    if (url.protocol !== "https:" || url.hostname !== "www.ecb.europa.eu" || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/press\/pr\/date\/(\d{4})\/html\/ecb\.pr(\d{6})~[a-f\d]+\.en\.html$/.exec(url.pathname);
    if (!match || match[1]!.slice(2) !== match[2]!.slice(0, 2)) return null;
    return { url, year: match[1]!, date: match[2]! };
  } catch { return null; }
}

function releaseImageUrl(raw: string, identity: NonNullable<ReturnType<typeof releaseIdentity>>): string | null {
  if (!raw || raw.length > 2000 || /[\s\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw, identity.url);
    if (url.protocol !== "https:" || url.hostname !== "www.ecb.europa.eu" || url.port || url.username || url.password || url.hash) return null;
    const prefix = `/press/pr/date/${identity.year}/html/pr${identity.date}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const filename = url.pathname.slice(prefix.length);
    if (!new RegExp(`^ecb\\.pr${identity.date}\\.en_img\\d{1,2}\\.(?:png|jpe?g|webp)$`, "i").test(filename)) return null;
    // Observed official assets use an optional bare MD5 revision, not redirects.
    if (url.search && !/^\?[a-f\d]{32}$/i.test(url.search)) return null;
    return url.toString();
  } catch { return null; }
}

function onlyEcbCopyright(caption: string): boolean {
  for (const credit of caption.matchAll(/(?:©|\bcopyright\b|\(c\))\s*([^©\n]*)/gi)) {
    // Check every explicit owner, including mixed credits on one line. A
    // recognized ECB owner must not authorize a later or joint external owner.
    if (!/^(?:\d{4}\s+)?(?:ECB|European Central Bank)(?:\s*[,.;]?\s*\d{4})?\s*[.;]?\s*$/i.test(credit[1]!.trim())) return false;
  }
  return true;
}

function sourceAttribution(caption: string): string {
  // Figure notes describe methodology; those remain in the article body.
  // Keep source/credit paragraphs in full, including named underlying sources.
  return caption.split(/\n{2,}/).map((paragraph) => paragraph.replace(/\bNotes?:\s[\s\S]*$/i, "").trim())
    .filter(Boolean).join("\n\n");
}

/**
 * Select a directly embedded, explicitly ECB-credited release figure.
 * Publisher social defaults, unrelated gallery pictures and third-party images
 * are not evidence of a licensed article image. No additional fetch is made.
 * Fed images remain excluded until a similarly verified source pattern exists.
 */
export function officialImage(provider: "fed" | "ecb", html: string, articleUrl: string): OfficialImage | null {
  if (provider !== "ecb" || typeof html !== "string" || html.length > MAX_HTML_LENGTH) return null;
  const identity = releaseIdentity(articleUrl);
  if (!identity) return null;
  const clean = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const main = element(clean, "main", () => true);
  if (!main) return null;
  const section = element(main.content, "div", (opening) => hasClass(opening, "section"));
  if (!section) return null;
  let remaining = section.content;
  for (let count = 0; count < MAX_FIGURES; count++) {
    const figure = element(remaining, "div", (opening) => hasClass(opening, "figure"));
    if (!figure) break;
    remaining = remaining.slice(figure.end);
    const captionElement = element(figure.content, "figcaption", () => true);
    const caption = captionElement ? plainText(captionElement.content) : "";
    const titleElement = element(figure.content, "p", (opening) => hasClass(opening, "title"));
    const title = titleElement ? plainText(titleElement.content) : "";
    if (!title || title.length > 500 || caption.length > 4000 || !/^Sources?:\s*(?:ECB|European Central Bank)(?:\s*\n|\s*$|[.;]|\s+calculations\b)/i.test(caption)) continue;
    // ECB calculations based on named data sources remain ECB figures. A
    // separate photographer/agency credit does not receive that permission.
    if (/\b(?:photo(?:graph)?\s+by|image\s+(?:by|credit)|getty|shutterstock|alamy|reuters)\b/i.test(caption)) continue;
    if (!onlyEcbCopyright(caption)) continue;
    let images = 0;
    for (const image of figure.content.matchAll(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
      if (++images > MAX_IMAGES) break;
      const raw = attribute(image[0], "src");
      if (!raw) continue;
      const url = releaseImageUrl(raw, identity);
      if (url) return { url, attribution: `${title} — ${sourceAttribution(caption)}` };
    }
  }
  return null;
}
