import { describe, expect, it } from "vitest";
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
