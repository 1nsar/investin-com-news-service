import { afterEach, describe, expect, it } from "vitest";
import { isDeadHost } from "../src/ingest/deadHosts.js";
import { canonicalize } from "../src/ingest/canonicalize.js";
import { isWrapperUrl } from "../src/ingest/resolveRedirect.js";

const original = process.env["DEAD_ARTICLE_HOSTS"];
afterEach(() => {
  if (original === undefined) delete process.env["DEAD_ARTICLE_HOSTS"];
  else process.env["DEAD_ARTICLE_HOSTS"] = original;
});

const article = (over: Record<string, unknown> = {}) => ({
  url: "https://example.com/a",
  headline: "Acme Corp reports quarterly revenue growth",
  summary: null,
  source: "Example",
  publishedAt: new Date("2026-08-20T10:00:00Z"),
  imageUrl: null,
  language: "en",
  ...over,
});

describe("dead hosts", () => {
  it("matches the host and its subdomains", () => {
    expect(isDeadHost("https://chartmill.com/news/NKE/x")).toBe(true);
    expect(isDeadHost("https://www.chartmill.com/news/NKE/x")).toBe(true);
    expect(isDeadHost("https://cdn.chartmill.com/img.webp")).toBe(true);
  });

  it("does not match a host that merely blocks automated clients", () => {
    // Benzinga and Seeking Alpha 403 us but serve browsers fine.
    expect(isDeadHost("https://www.benzinga.com/news/1")).toBe(false);
    expect(isDeadHost("https://seekingalpha.com/article/1")).toBe(false);
    expect(isDeadHost("https://finance.yahoo.com/news/1")).toBe(false);
  });

  it("does not match a host that merely contains the name", () => {
    expect(isDeadHost("https://notchartmill.com/x")).toBe(false);
    expect(isDeadHost("https://chartmill.com.evil.example/x")).toBe(false);
  });

  it("tolerates junk input", () => {
    expect(isDeadHost(null)).toBe(false);
    expect(isDeadHost("not a url")).toBe(false);
  });

  it("is configurable, and an empty value disables it", () => {
    process.env["DEAD_ARTICLE_HOSTS"] = "broken.example";
    expect(isDeadHost("https://broken.example/x")).toBe(true);
    expect(isDeadHost("https://chartmill.com/x")).toBe(false);

    process.env["DEAD_ARTICLE_HOSTS"] = "";
    expect(isDeadHost("https://chartmill.com/x")).toBe(false);
  });

  it("drops an article on a dead host entirely", () => {
    expect(canonicalize(article({ url: "https://www.chartmill.com/news/NKE/x" }), "finnhub")).toBeNull();
  });

  it("keeps the article but drops an image on a dead host", () => {
    const result = canonicalize(
      article({ imageUrl: "https://www.chartmill.com/images/uploads/x.webp" }),
      "finnhub",
    );
    expect(result).not.toBeNull();
    expect(result?.imageUrl).toBeNull();
    expect(result?.url).toBe("https://example.com/a");
  });

  it("keeps a working image", () => {
    const result = canonicalize(
      article({ imageUrl: "https://s.yimg.com/x.jpg" }),
      "finnhub",
    );
    expect(result?.imageUrl).toBe("https://s.yimg.com/x.jpg");
  });
});

describe("redirect wrappers", () => {
  it("recognises a finnhub wrapper", () => {
    expect(isWrapperUrl("https://finnhub.io/api/news?id=abc")).toBe(true);
    expect(isWrapperUrl("https://www.finnhub.io/api/news?id=abc")).toBe(true);
  });

  it("does not treat a publisher URL as a wrapper", () => {
    expect(isWrapperUrl("https://finance.yahoo.com/news/1")).toBe(false);
    expect(isWrapperUrl("https://notfinnhub.io/x")).toBe(false);
    expect(isWrapperUrl("garbage")).toBe(false);
  });

  it("collapses syndicated copies once the wrapper is resolved", () => {
    // Two different wrapper ids pointing at one story must dedupe to one key
    // after resolution - which is exactly what the wrapper prevented.
    const a = canonicalize(article({ url: "https://finance.yahoo.com/news/x?utm_source=a" }), "finnhub");
    const b = canonicalize(article({ url: "https://finance.yahoo.com/news/x?utm_source=b" }), "finnhub");
    expect(a?.dedupeHash).toBe(b?.dedupeHash);
  });
});
