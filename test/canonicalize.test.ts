import { describe, expect, it } from "vitest";
import { canonicalize, canonicalizeUrl, contentHash, dedupeHash } from "../src/ingest/canonicalize.js";

describe("canonicalizeUrl", () => {
  it("collapses the variations that would otherwise duplicate a story", () => {
    const expected = "https://reuters.com/business/acme-results";
    const variants = [
      "https://www.reuters.com/business/acme-results",
      "http://reuters.com/business/acme-results/",
      "https://reuters.com/business/acme-results?utm_source=twitter&utm_medium=social",
      "https://reuters.com/business/acme-results#section-2",
      "https://reuters.com/business/acme-results/amp/",
    ];
    for (const variant of variants) expect(canonicalizeUrl(variant)).toBe(expected);
  });

  it("orders query parameters so argument order does not matter", () => {
    expect(canonicalizeUrl("https://x.com/a?b=2&a=1")).toBe(canonicalizeUrl("https://x.com/a?a=1&b=2"));
  });

  it("keeps parameters that select the article", () => {
    expect(canonicalizeUrl("https://x.com/story?id=99&utm_source=rss")).toBe("https://x.com/story?id=99");
  });
});

describe("dedupe keys", () => {
  it("gives one hash per canonical url", () => {
    expect(dedupeHash(canonicalizeUrl("https://www.a.com/x?utm_source=q"))).toBe(
      dedupeHash(canonicalizeUrl("https://a.com/x")),
    );
  });

  it("matches syndicated copies on headline and day", () => {
    const when = new Date("2026-08-19T09:00:00Z");
    const later = new Date("2026-08-19T21:30:00Z");
    expect(contentHash("Acme Corp beats estimates", when)).toBe(
      contentHash("Acme Corp  beats  estimates!", later),
    );
  });
});

describe("canonicalize", () => {
  it("splits the publisher out of a Google News headline", () => {
    const result = canonicalize(
      {
        headline: "Acme wins contract - Financial Times",
        url: "https://www.ft.com/content/acme-wins-contract",
        publishedAt: new Date("2026-08-19T09:00:00Z"),
      },
      "google_news_rss",
    );
    expect(result?.headline).toBe("Acme wins contract");
    expect(result?.source).toBe("Financial Times");
  });

  /** A news.google.com token decodes to an opaque Google identifier, not the
   *  publisher's address, and the page returns nothing to a non-browser. The
   *  reader gets a dead link, so the article is not stored at all. */
  it("rejects Google News interstitial links, which cannot be opened", () => {
    const result = canonicalize(
      {
        headline: "Acme wins contract - Financial Times",
        url: "https://news.google.com/rss/articles/CBMikgFBVV95cUxOMFJoa0FVQkk0",
        publishedAt: new Date("2026-08-19T09:00:00Z"),
      },
      "google_news_rss",
    );
    expect(result).toBeNull();
  });

  it("rejects rows a provider cannot make usable", () => {
    const base = { publishedAt: new Date() };
    expect(canonicalize({ ...base, headline: "", url: "https://a.com" }, "finnhub")).toBeNull();
    expect(canonicalize({ ...base, headline: "x", url: "" }, "finnhub")).toBeNull();
    expect(canonicalize({ ...base, headline: "x", url: "javascript:alert(1)" }, "finnhub")).toBeNull();
  });
});
