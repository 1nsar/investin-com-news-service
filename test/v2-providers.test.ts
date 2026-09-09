import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderBatch, listProviderDefinitions } from "../src/v2/providers/index.js";
import { allowedUrl, sourceText, withRequestBudget } from "../src/v2/providers/http.js";
import { parseXml } from "../src/v2/providers/official.js";
import { officialBody, plainText } from "../src/v2/providers/text.js";
import type { ProviderFetchRequest, ProviderId } from "../src/v2/types.js";

const signal = (): AbortSignal => new AbortController().signal;
const request = (providerId: ProviderId, extra: Partial<ProviderFetchRequest> = {}): ProviderFetchRequest => ({
  providerId, credentials: {}, checkpoint: null, signal: signal(), limit: 10, fullTextEnabled: false, ...extra,
});
const response = (value: unknown, status = 200): Response => new Response(typeof value === "string" ? value : JSON.stringify(value), { status });
const fedUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260901a.htm";
const ecbUrl = "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260821~a044fdddd9.en.html";
const body = "This fixture is an official release body used to exercise the reader. It contains enough source text to pass extraction.";
const fedBody = `<div id="article"><div class="heading col-xs-12 col-sm-8 col-md-8"><h3>The heading must not replace the article body</h3><p>For release at noon. Share this article.</p></div><div class="col-xs-12 col-sm-8 col-md-8"><p>${body}</p><div><p>Second source paragraph.</p></div></div></div><footer>Not article text</footer>`;
const ecbBody = `<main><div class="title">Outside article section</div><div class="section"><p>${body}</p></div></main>`;
const feed = (entries: { url: string; title?: string }[]): string => `<rss><channel>${entries.map(({ url, title }) => `<item><title>${title ?? "Policy release"}</title><link>${url}</link><pubDate>Tue, 01 Sep 2026 12:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;
const key = "test-only-unique-provider-key";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("V2 source boundaries", () => {
  it("blocks arbitrary and authored-document URLs, and normalizes the official ECB feed's doubled slash", () => {
    for (const url of ["https://127.0.0.1/private", "https://www.federalreserve.gov.evil.test/newsevents/pressreleases/monetary20260901a.htm", "https://www.federalreserve.gov/newsevents/pressreleases/%2e%2e/private", "http://www.federalreserve.gov/newsevents/pressreleases/monetary20260901a.htm"]) {
      expect(() => allowedUrl("fed", url, "body")).toThrow();
    }
    expect(() => allowedUrl("ecb", "https://www.ecb.europa.eu/press/key/date/2026/html/ecb.sp260901~abc.en.html", "body")).toThrow();
    expect(allowedUrl("ecb", ecbUrl.replace("eu/press", "eu//press"), "body").toString()).toBe(ecbUrl);
  });
  it("extracts article paragraphs without navigation/scripts and rejects unrecognized layouts", () => {
    expect(officialBody("fed", fedBody)).toBe(`${body}\n\nSecond source paragraph.`);
    expect(officialBody("ecb", ecbBody)).toBe(body);
    expect(plainText("<script>alert('x')</script><p>A &amp; B</p><p>&#x20AC; 3</p>")).toBe("A & B\n\n€ 3");
    expect(() => officialBody("fed", "<html>Access denied</html>")).toThrow(/layout/);
    expect(() => parseXml('<!DOCTYPE rss [<!ENTITY x "boom">]><rss/>')).toThrow(/XML/);
  });
  it("does not follow redirects or repeat blocked requests", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }));
    vi.stubGlobal("fetch", fetch);
    const budget = vi.fn().mockResolvedValue(undefined);
    await expect(withRequestBudget(budget, () => sourceText("fed", "https://www.federalreserve.gov/feeds/press_all.xml", signal()))).rejects.toThrow(/302/);
    expect(fetch).toHaveBeenCalledTimes(1); expect(budget).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1].redirect).toBe("manual");
  });
  it("enforces streamed byte limits even without Content-Length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("a".repeat(100))));
    await expect(sourceText("fed", "https://www.federalreserve.gov/feeds/press_all.xml", signal(), { maxBytes: 30 })).rejects.toThrow(/byte limit/);
  });
  it("counts every actual HTTP call and leaves rate-limit errors free of credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(`api_token=${key}`, { status: 429, headers: { "retry-after": "90" } }));
    vi.stubGlobal("fetch", fetch);
    const acquireRequest = vi.fn().mockResolvedValue(undefined);
    try { await fetchProviderBatch(request("marketaux", { credentials: { apiKey: key }, acquireRequest })); expect.fail("must reject"); }
    catch (error) { expect(error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 90 }); expect(String(error)).not.toContain(key); }
    expect(fetch).toHaveBeenCalledTimes(1); expect(acquireRequest).toHaveBeenCalledTimes(1);
  });
  it("does not make an upstream call when the durable budget refuses it", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(fetchProviderBatch(request("fed", { acquireRequest: async () => { throw new Error("Budget exhausted"); } }))).rejects.toThrow("Budget exhausted");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("V2 official content", () => {
  it("returns actual body text with source dates and resumes a fixed pending feed without refetching it", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(feed([{ url: fedUrl }, { url: fedUrl.replace("01a", "02a") }])))
      .mockResolvedValueOnce(response(fedBody)).mockResolvedValueOnce(response(fedBody));
    vi.stubGlobal("fetch", fetch);
    const acquireRequest = vi.fn().mockResolvedValue(undefined);
    const first = await fetchProviderBatch(request("fed", { limit: 1, acquireRequest }));
    expect(first.complete).toBe(false); expect(first.items[0]?.body).toContain(body);
    expect(first.items[0]?.publishedAt).toBe("2026-09-01T12:00:00.000Z");
    expect(first.items[0]?.rights).toMatchObject({ bodyAllowed: true, imageAllowed: false, licenseStatus: "public_source" });
    const second = await fetchProviderBatch(request("fed", { limit: 1, checkpoint: first.nextCheckpoint, acquireRequest }));
    expect(second.complete).toBe(true); expect(fetch).toHaveBeenCalledTimes(3); expect(acquireRequest).toHaveBeenCalledTimes(3);
  });
  it("excludes authored ECB speeches while retaining institutional press releases and attribution conditions", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(feed([{ url: ecbUrl }, { url: "https://www.ecb.europa.eu/press/key/date/2026/html/ecb.sp260901~abc.en.html" }])))
      .mockResolvedValueOnce(response(ecbBody)); vi.stubGlobal("fetch", fetch);
    const result = await fetchProviderBatch(request("ecb"));
    expect(result.items).toHaveLength(1); expect(result.items[0]?.body).toBe(body);
    expect(result.items[0]?.rights.attribution).toContain("available free of charge");
    expect(result.notices?.join(" ")).toContain("excluded"); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("skips unchanged bodies, detects changed feed metadata, and persists the daily correction rescan", async () => {
    const xml = feed([{ url: fedUrl }]);
    const changedXml = feed([{ url: fedUrl, title: "Corrected policy release" }]);
    const fetch = vi.fn().mockResolvedValueOnce(response(xml)).mockResolvedValueOnce(response(fedBody))
      .mockResolvedValueOnce(response(xml))
      .mockResolvedValueOnce(response(changedXml)).mockResolvedValueOnce(response(fedBody))
      .mockResolvedValueOnce(response(changedXml)).mockResolvedValueOnce(response(fedBody));
    vi.stubGlobal("fetch", fetch);
    const first = await fetchProviderBatch(request("fed"));
    const unchanged = await fetchProviderBatch(request("fed", { checkpoint: first.nextCheckpoint }));
    expect(unchanged.complete).toBe(true); expect(unchanged.items).toHaveLength(0); expect(fetch).toHaveBeenCalledTimes(3);
    const changed = await fetchProviderBatch(request("fed", { checkpoint: unchanged.nextCheckpoint }));
    expect(changed.items[0]?.headline).toBe("Corrected policy release"); expect(fetch).toHaveBeenCalledTimes(5);
    const old = JSON.parse(changed.nextCheckpoint!); old.lastFullScanAt = "2020-01-01T00:00:00.000Z";
    const daily = await fetchProviderBatch(request("fed", { checkpoint: JSON.stringify(old) }));
    expect(daily.items).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(7);
    expect(JSON.parse(daily.nextCheckpoint!).lastFullScanAt).not.toBe(old.lastFullScanAt);
  });
  it("does not erase a stored full article when its daily correction check fails", async () => {
    const xml = feed([{ url: fedUrl }]);
    const fetch = vi.fn().mockResolvedValueOnce(response(xml)).mockResolvedValueOnce(response(fedBody))
      .mockResolvedValueOnce(response(xml)).mockResolvedValueOnce(response("Unavailable", 503));
    vi.stubGlobal("fetch", fetch);
    const first = await fetchProviderBatch(request("fed"));
    const old = JSON.parse(first.nextCheckpoint!); old.lastFullScanAt = "2020-01-01T00:00:00.000Z";
    const rescan = await fetchProviderBatch(request("fed", { checkpoint: JSON.stringify(old) }));
    expect(rescan.complete).toBe(true); expect(rescan.items).toHaveLength(0);
    expect(rescan.notices?.join(" ")).toContain("previous full article was preserved");
  });
  it("does not represent a blocked release body as full text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(feed([{ url: fedUrl }]))).mockResolvedValueOnce(response("Denied", 403)));
    const result = await fetchProviderBatch(request("fed"));
    expect(result.items[0]?.body).toBeNull(); expect(result.items[0]?.rights.bodyAllowed).toBe(false);
    expect(result.notices?.join(" ")).toMatch(/unavailable/);
  });
  it("reports SEC403 honestly and does not rotate identity or retry", async () => {
    const fetch = vi.fn().mockResolvedValue(response("Denied", 403)); vi.stubGlobal("fetch", fetch);
    await expect(fetchProviderBatch(request("sec"))).rejects.toMatchObject({ code: "auth" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1].headers["user-agent"]).toContain("github.com/1nsar/investin-com-news-service");
    expect(fetch.mock.calls[0]?.[1].headers["user-agent"]).not.toContain("example.com");
  });
  it("maps a targeted SEC disclosure through its exact CIK/accession/document", async () => {
    const data = { name: "Example Issuer", tickers: ["EXM"], exchanges: ["Nasdaq"], filings: { recent: {
      accessionNumber: ["0000320193-26-000001"], form: ["8-K"], acceptanceDateTime: ["2026-09-01T12:00:00Z"], primaryDocument: ["release.htm"],
    } } };
    const fetch = vi.fn().mockResolvedValueOnce(response(data)).mockResolvedValueOnce(response(`<body><p>${body}</p></body>`)); vi.stubGlobal("fetch", fetch);
    const result = await fetchProviderBatch(request("sec", { credentials: { ciks: "320193" } }));
    expect(result.complete).toBe(true); expect(result.items[0]?.sourceId).toBe("0000320193:0000320193-26-000001");
    expect(result.items[0]?.companies?.[0]).toMatchObject({ ticker: "EXM", exchange: "Nasdaq", externalId: "cik:0000320193" });
    expect(result.items[0]?.body).toBe(body);
    expect(String(fetch.mock.calls[1]?.[0])).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/release.htm");
  });
});

const marketauxRow = (id: number) => ({ uuid: `news-${id}`, title: "Example earnings", description: "Publisher snippet", body: "Never import this body", url: `https://publisher.test/story-${id}`, published_at: "2026-09-01T12:00:00Z", source: "Publisher", entities: [{ symbol: "BBY.L", name: "Balfour Beatty", exchange: "LON", country: "gb" }] });
describe("V2 paid API boundaries and continuation", () => {
  it("honours the actual Marketaux plan page size and never upgrades snippets into article bodies", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ meta: { found: 5, returned: 3, limit: 3, page: 1 }, data: [1, 2, 3].map(marketauxRow) }))
      .mockResolvedValueOnce(response({ meta: { found: 5, returned: 2, limit: 3, page: 2 }, data: [4, 5].map(marketauxRow) })); vi.stubGlobal("fetch", fetch);
    const first = await fetchProviderBatch(request("marketaux", { credentials: { apiKey: key }, fullTextEnabled: true }));
    expect(first.complete).toBe(false); expect(first.items[0]?.body).toBeNull();
    expect(first.items[0]?.companies?.[0]).toMatchObject({ ticker: "BBY.L", exchange: "LON", country: "GB" });
    const second = await fetchProviderBatch(request("marketaux", { credentials: { apiKey: key }, checkpoint: first.nextCheckpoint }));
    expect(second.complete).toBe(true); expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get("page")).toBe("2");
    expect(second.nextCheckpoint).not.toContain(key);
  });
  it("recognizes body-level quota errors and rejects malformed dated articles without a checkpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ error: { code: "usage_limit_reached", message: key } }))
      .mockResolvedValueOnce(response({ meta: { found: 1, limit: 3, page: 1 }, data: [{ ...marketauxRow(1), published_at: null }] })));
    await expect(fetchProviderBatch(request("marketaux", { credentials: { apiKey: key } }))).rejects.toMatchObject({ code: "rate_limited" });
    await expect(fetchProviderBatch(request("marketaux", { credentials: { apiKey: key } }))).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("redacts an API credential even when a valid source article echoes it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ meta: { found: 1, limit: 3, page: 1 }, data: [{ ...marketauxRow(1), description: `echo ${key}` }] })));
    const result = await fetchProviderBatch(request("marketaux", { credentials: { apiKey: ` ${key} ` } }));
    expect(JSON.stringify(result)).not.toContain(key); expect(result.items[0]?.summary).toContain("[redacted]");
  });
  it("finishes Benzinga news and tombstones before advancing the watermark, with explicit full-body rights", async () => {
    const article = { id: 1, title: "Earnings update", url: "https://www.benzinga.com/test", created: "2026-09-01T12:00:00Z", updated: "2026-09-01T12:01:00Z", body: `<p>${body}</p>`, teaser: "Short context", stocks: [{ name: "EXM", exchange: "NASDAQ", isin: "US1234567890" }] };
    const fetch = vi.fn().mockResolvedValueOnce(response([article])).mockResolvedValueOnce(response({ removed: [{ id: 2 }] })).mockResolvedValueOnce(response([article])); vi.stubGlobal("fetch", fetch);
    const first = await fetchProviderBatch(request("benzinga", { credentials: { apiKey: key }, fullTextEnabled: true }));
    expect(first.complete).toBe(false); expect(first.items[0]?.body).toBe(body); expect(first.items[0]?.rights.bodyAllowed).toBe(true);
    expect(JSON.parse(first.nextCheckpoint!).phase).toBe("removed");
    const second = await fetchProviderBatch(request("benzinga", { credentials: { apiKey: key }, checkpoint: first.nextCheckpoint }));
    expect(second.complete).toBe(true); expect(second.items[0]?.action).toBe("delete"); expect(second.items[0]?.sourceId).toBe("2");
    const noBody = await fetchProviderBatch(request("benzinga", { credentials: { apiKey: key }, fullTextEnabled: false }));
    expect(noBody.items[0]?.body).toBeNull(); expect(new URL(String(fetch.mock.calls[2]?.[0])).searchParams.get("displayOutput")).toBe("abstract");
  });
  it("continues Finnhub's bounded symbol set rather than repeatedly requesting the first company", async () => {
    const row = { id: 10, headline: "Source news", url: "https://publisher.test/a", datetime: 1788264000, summary: "A source summary" };
    const fetch = vi.fn().mockResolvedValueOnce(response([row])).mockResolvedValueOnce(response([{ ...row, id: 11 }])); vi.stubGlobal("fetch", fetch);
    const input = request("finnhub", { credentials: { apiKey: key, symbols: "AAA,BBB" } });
    const first = await fetchProviderBatch(input); expect(first.complete).toBe(false);
    const second = await fetchProviderBatch({ ...input, checkpoint: first.nextCheckpoint }); expect(second.complete).toBe(true);
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get("symbol")).toBe("BBB");
    expect(second.items[0]?.rights.bodyAllowed).toBe(false);
  });
  it("does not label routine Benzinga updates as editorial corrections", async () => {
    const row = { id: 1, title: "Updated financial report", url: "https://www.benzinga.com/test", created: "2026-09-01T12:00:00Z", updated: "2026-09-01T12:00:01Z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      row, { ...row, id: 2, correction: false }, { ...row, id: 3, correction: "true" }, { ...row, id: 4, correction: true },
    ])));
    const result = await fetchProviderBatch(request("benzinga", { credentials: { apiKey: key } }));
    expect(result.items.map((item) => item.correction)).toEqual([false, false, false, true]);
    expect(result.items.every((item) => item.updatedAt === "2026-09-01T12:00:01.000Z")).toBe(true);
  });
  it("does not claim paid aggregators support full reading", () => {
    const definitions = listProviderDefinitions();
    expect(definitions.filter((definition) => definition.free).map((definition) => definition.id)).toEqual(["fed", "ecb", "sec"]);
    expect(definitions.find((definition) => definition.id === "marketaux")?.supportsFullText).toBe(false);
    expect(definitions.find((definition) => definition.id === "finnhub")?.supportsFullText).toBe(false);
  });
});
