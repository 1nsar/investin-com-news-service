import { ProviderFetchError } from "./http.js";

export function plainText(html: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•", euro: "€", pound: "£", copy: "©" };
  return html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*$/gi, " ")
    .replace(/<\/?(?:p|div|h[1-6]|li|tr|br|section|article|blockquote)\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
      }
      return entities[entity.toLowerCase()] ?? match;
    })
    .replace(/[\t\r ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Select one balanced element; nested divs do not truncate release text. */
function element(html: string, tag: string, attributes: RegExp): string | null {
  const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  let start = -1, depth = 0;
  for (const match of html.matchAll(tags)) {
    const closing = match[0].startsWith("</");
    if (start < 0) {
      if (!closing && attributes.test(match[0])) { start = (match.index ?? 0) + match[0].length; depth = 1; }
    } else {
      depth += closing ? -1 : 1;
      if (depth === 0) return html.slice(start, match.index);
    }
  }
  return null;
}

export function officialBody(provider: "fed" | "ecb" | "sec", html: string): string {
  let content: string | null = null;
  if (provider === "fed") {
    const article = element(html, "div", /\bid=["']article["']/i);
    // The heading uses the same grid width as the article. Select the content
    // column explicitly so a release is never reduced to its title/share tools.
    if (article) content = element(article, "div", /class=["'](?![^"']*\bheading\b)[^"']*col-sm-8\s+col-md-8[^"']*["']/i);
  } else if (provider === "ecb") {
    const main = element(html, "main", /.*/);
    if (main) content = element(main, "div", /class=["']section["']/i);
  } else {
    content = element(html, "body", /.*/) ?? html;
  }
  if (!content) throw new ProviderFetchError("invalid_response", "Official article layout was not recognized; no body imported");
  const text = plainText(content);
  if (text.length < 50 || text.length > 160_000) throw new ProviderFetchError("invalid_response", "Official article text is empty or exceeds the reader limit");
  return text;
}
