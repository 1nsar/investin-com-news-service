import { describe, expect, it } from "vitest";
import { HttpError } from "../src/util/http.js";
import { marketSymbol } from "../src/catalogue/exchanges.js";
import { homeCountryFromName } from "../src/catalogue/names.js";
import { FinnhubProvider } from "../src/providers/finnhub.js";
import { GoogleNewsRssProvider } from "../src/providers/googleNewsRss.js";
import type { FetchableCompany, FetchableListing } from "../src/providers/types.js";

const listing = (over: Partial<FetchableListing>): FetchableListing => ({
  id: 1,
  exchangeCode: "US",
  mic: "XNYS",
  symbol: "ACME",
  symbolFormat: "us",
  securityKind: "ordinary",
  country: "US",
  isUs: true,
  isPrimary: true,
  confidence: 0.95,
  ...over,
});

const company = (over: Partial<FetchableCompany>): FetchableCompany => ({
  id: 1,
  ticker: "ACME",
  companyName: "Acme Corp",
  country: "US",
  listings: [],
  ...over,
});

describe("FinnhubProvider.supports", () => {
  const provider = new FinnhubProvider();

  it("declines a company with no US listing rather than burning a call on a 403", () => {
    const result = provider.supports(
      company({
        companyName: "Munich Reinsurance",
        country: "DE",
        listings: [listing({ exchangeCode: "GY", mic: "XETR", symbol: "MUV2", isUs: false, isPrimary: true })],
      }),
    );
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/no US listing/i);
  });

  it("serves a foreign company through its US ADR", () => {
    const result = provider.supports(
      company({
        ticker: "ADM",
        companyName: "Admiral Group PLC",
        country: "GB",
        listings: [
          listing({ id: 1, exchangeCode: "LN", mic: "XLON", symbol: "ADM", isUs: false, isPrimary: true }),
          listing({ id: 2, exchangeCode: "US", mic: "OOTC", symbol: "AMIGY", securityKind: "adr", isUs: true, isPrimary: false }),
        ],
      }),
    );
    expect(result.supported).toBe(true);
    expect(result.symbol).toBe("AMIGY");
    expect(result.matchMethod).toBe("ticker");
  });

  it("prefers a real exchange listing over an OTC line", () => {
    const result = provider.supports(
      company({
        listings: [
          listing({ id: 1, symbol: "ACMEF", mic: "OOTC", isPrimary: true }),
          listing({ id: 2, symbol: "ACME", mic: "XNYS", isPrimary: false }),
        ],
      }),
    );
    expect(result.symbol).toBe("ACME");
  });
});

describe("GoogleNewsRssProvider.supports", () => {
  const provider = new GoogleNewsRssProvider();

  it("serves a company with no US line at all, by name", () => {
    const result = provider.supports(
      company({
        companyName: "Munich Reinsurance Company AG",
        country: "DE",
        listings: [listing({ exchangeCode: "GY", symbol: "MUV2", isUs: false })],
      }),
    );
    expect(result.supported).toBe(true);
    // Legal suffixes are stripped: they suppress news-search results.
    expect(result.symbol).toBe("Munich Reinsurance");
    // Name-matched articles carry more misattribution risk, and say so.
    expect(result.matchMethod).toBe("name_match");
  });
});

describe("no_news authority", () => {
  const provider = new FinnhubProvider();

  // 224 companies were never offered to the fallback because a zero from a
  // thin OTC line was treated as a final answer.
  it("marks a zero from a real US exchange listing as authoritative", () => {
    const result = provider.supports(
      company({ listings: [listing({ symbol: "ACME", mic: "XNYS", isPrimary: true })] }),
    );
    expect(result.supported).toBe(true);
    expect(result.symbol).toBe("ACME");
  });

  it("chooses the exchange listing over an OTC one when both exist", () => {
    const result = provider.supports(
      company({
        listings: [
          listing({ id: 1, symbol: "ACMEF", mic: "OOTC", isPrimary: true }),
          listing({ id: 2, symbol: "ACME", mic: "XNAS", isPrimary: false }),
        ],
      }),
    );
    expect(result.symbol).toBe("ACME");
  });

  it("still serves an OTC-only company, so it can be tried before falling through", () => {
    const result = provider.supports(
      company({ listings: [listing({ symbol: "AMIGY", mic: "OOTC", securityKind: "adr" })] }),
    );
    expect(result.supported).toBe(true);
    expect(result.symbol).toBe("AMIGY");
  });
});

describe("quota exhaustion", () => {
  it("treats 402 as rate limiting, not a generic error", () => {
    // Metered APIs return 402 when the plan's allowance is spent. Reporting
    // that as `error` would say a company failed when the truth is we ran out
    // of budget - and the two alert differently.
    expect(new HttpError(402, "https://x", "").isRateLimited).toBe(true);
    expect(new HttpError(429, "https://x", "").isRateLimited).toBe(true);
    expect(new HttpError(500, "https://x", "").isRateLimited).toBe(false);
  });

  it("does not retry a 402 inside a run", () => {
    // The allowance does not return within a run; retrying only burns time.
    expect(new HttpError(402, "https://x", "").isRetryable).toBe(false);
    expect(new HttpError(429, "https://x", "").isRetryable).toBe(true);
  });
});

describe("LSE symbols in Bloomberg form", () => {
  it("converts a trailing slash into the venue suffix", () => {
    // Identifier sources return Aviva as "AV/", not "AV." - appending ".L"
    // naively gives "AV/.L", which matches nothing at a global provider.
    expect(marketSymbol("LN", "QQ/")).toBe("QQ.L");
    expect(marketSymbol("LN", "AV/")).toBe("AV.L");
    expect(marketSymbol("LN", "BA/")).toBe("BA.L");
    expect(marketSymbol("LN", "RR/")).toBe("RR.L");
  });

  it("leaves ordinary symbols alone", () => {
    expect(marketSymbol("LN", "VOD")).toBe("VOD.L");
    expect(marketSymbol("LN", "SCT")).toBe("SCT.L");
  });

  it("still refuses a venue with no suffix mapping", () => {
    expect(marketSymbol("LO", "0E64")).toBeNull();
  });
});

describe("home venues added for previously unfetchable companies", () => {
  it("qualifies symbols on the venues that were missing", () => {
    // Each of these was a company resolvable by OpenFIGI but unfetchable,
    // because the venue had no suffix mapping here.
    expect(marketSymbol("AV", "DOC")).toBe("DOC.VI");   // DO & CO, Vienna
    expect(marketSymbol("SM", "ACS")).toBe("ACS.MC");   // Madrid
    expect(marketSymbol("NA", "HEIA")).toBe("HEIA.AS"); // Amsterdam
    expect(marketSymbol("CH", "603558")).toBe("603558.SS");
    expect(marketSymbol("CS", "000333")).toBe("000333.SZ");
  });
});

describe("London international-board codes", () => {
  it("refuses to build a symbol from a board code", () => {
    // "0M6I.L" looks like a symbol and matches nothing. Returning it made
    // Heijmans and Magyar Telekom report a clean zero they never earned.
    expect(marketSymbol("LN", "0M6I")).toBeNull();  // Heijmans
    expect(marketSymbol("LN", "0NUG")).toBeNull();  // Magyar Telekom
    expect(marketSymbol("LO", "0E64")).toBeNull();
  });

  it("does not mistake a zero-padded Hong Kong ticker for a board code", () => {
    expect(marketSymbol("HK", "0700")).toBe("0700.HK");
  });

  it("strips a slash anywhere, not just at the end", () => {
    expect(marketSymbol("LN", "QQ/")).toBe("QQ.L");
    expect(marketSymbol("LN", "BT/A")).toBe("BTA.L");
    expect(marketSymbol("LN", "/")).toBeNull();
  });
});

describe("home country inferred from the legal form", () => {
  it("reads the suffix, not the catalogue's listing country", () => {
    // Every London line in the catalogue says "GB" regardless of the issuer,
    // so the legal form is the more honest signal for a home venue.
    expect(homeCountryFromName("Sweco AB")).toBe("SE");
    expect(homeCountryFromName("Per Aarsleff Holding A/S")).toBe("DK");
    expect(homeCountryFromName("Clas Ohlson AB")).toBe("SE");
    expect(homeCountryFromName("Maire Tecnimont SpA")).toBe("IT");
    expect(homeCountryFromName("Heijmans NV")).toBe("NL");
    expect(homeCountryFromName("DO & CO AG")).toBe("DE");
  });

  it("returns null when the name carries no legal form", () => {
    expect(homeCountryFromName("Apple")).toBeNull();
  });
});

describe("Nordic share-class symbols", () => {
  it("hyphenates a trailing share class on Nordic venues", () => {
    // Identifier sources return "CLASB"; the provider knows it as "CLAS-B".
    // Measured on the same company: CLAS-B.ST → 5 articles, CLASB.ST → 0.
    expect(marketSymbol("SS", "CLASB")).toBe("CLAS-B.ST");
    expect(marketSymbol("SS", "SWECB")).toBe("SWEC-B.ST");
    expect(marketSymbol("DC", "PAALB")).toBe("PAAL-B.CO");
  });

  it("leaves ordinary tickers alone", () => {
    expect(marketSymbol("SS", "VOLV")).toBe("VOLV.ST");
    expect(marketSymbol("LN", "VODB")).toBe("VODB.L");  // not a Nordic venue
  });
});
