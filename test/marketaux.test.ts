import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchableCompany, FetchableListing } from "../src/providers/types.js";

const listing = (over: Partial<FetchableListing>): FetchableListing => ({
  id: 1, exchangeCode: "US", mic: "XNYS", symbol: "ACME", symbolFormat: "us",
  securityKind: "ordinary", country: "US", isUs: true, isPrimary: true, confidence: 0.95, ...over,
});
const company = (over: Partial<FetchableCompany>): FetchableCompany => ({
  id: 1, ticker: "ACME", companyName: "Acme Corp", country: "US", listings: [], ...over,
});

/** The adapter reads its key from config at construction, so the module is
 *  re-imported per test with the environment already set. */
async function providerWithKey(key = "test-key") {
  vi.resetModules();
  process.env.MARKETAUX_API_KEY = key;
  const { MarketauxProvider } = await import("../src/providers/marketaux.js");
  return new MarketauxProvider();
}

describe("MarketauxProvider", () => {
  beforeEach(() => {
    delete process.env.MARKETAUX_API_KEY;
  });

  it("declines cleanly when no key is configured", async () => {
    const provider = await providerWithKey("");
    const result = provider.supports(company({ listings: [listing({})] }));
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/MARKETAUX_API_KEY/);
  });

  it("serves a company with NO US listing — the gap Finnhub cannot reach", async () => {
    const provider = await providerWithKey();
    const result = provider.supports(
      company({
        ticker: "MUV2", companyName: "Munich Reinsurance", country: "DE",
        listings: [listing({ exchangeCode: "GY", mic: "XETR", symbol: "MUV2", isUs: false })],
      }),
    );
    expect(result.supported).toBe(true);
    // Exchange-qualified: a bare "MUV2" sent to a global provider is ambiguous.
    expect(result.symbol).toBe("MUV2.DE");
    // Attribution comes from the provider's own entity tagging, not from our
    // name matching — that is the whole point of choosing it.
    expect(result.matchMethod).toBe("ticker");
  });

  it("prefers a real exchange listing over an OTC line", async () => {
    const provider = await providerWithKey();
    const result = provider.supports(
      company({
        listings: [
          listing({ id: 1, symbol: "AMIGF", mic: "OOTC", isPrimary: true }),
          listing({ id: 2, symbol: "ADM", exchangeCode: "LN", mic: "XLON", isUs: false, isPrimary: false }),
        ],
      }),
    );
    // London beats the OTC line, and is qualified so it cannot be read as
    // Archer-Daniels-Midland.
    expect(result.symbol).toBe("ADM.L");
  });

  it("declines a company with no resolved listing at all", async () => {
    const provider = await providerWithKey();
    const result = provider.supports(company({ listings: [] }));
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/no resolved listing/);
  });
});

describe("MarketauxProvider — the collision trap", () => {
  /** listings.symbol holds the venue's BARE symbol, which is ambiguous across
   *  exchanges. Sending it unqualified to a global provider asks about the
   *  wrong company, and the reply's entity tag would then confirm it. */
  it("exchange-qualifies non-US symbols so a global provider cannot confuse them", async () => {
    const provider = await providerWithKey();
    const cases: [string, string, string, string][] = [
      // catalogue ticker, company, non-US venue, expected query symbol
      ["BBY", "Balfour Beatty PLC", "LN", "BBY.L"],
      ["ADM", "Admiral Group PLC", "LN", "ADM.L"],
      ["NOV", "Novo Nordisk A/S", "GR", "NOV.DE"],
    ];
    for (const [ticker, name, exch, expected] of cases) {
      const result = provider.supports(
        company({
          ticker,
          companyName: name,
          listings: [
            listing({ id: 1, exchangeCode: exch, mic: exch === "LN" ? "XLON" : "XETR",
                      symbol: ticker, isUs: false, isPrimary: true }),
          ],
        }),
      );
      // Bare "BBY" would return Best Buy; "BBY.L" cannot.
      expect(result.symbol, `${ticker} on ${exch}`).toBe(expected);
      expect(result.symbol).not.toBe(ticker);
    }
  });

  it("leaves US symbols bare, since they are already unambiguous", async () => {
    const provider = await providerWithKey();
    const result = provider.supports(
      company({ listings: [listing({ symbol: "AAPL", mic: "XNAS", isUs: true })] }),
    );
    expect(result.symbol).toBe("AAPL");
  });

  it("reports the listing it actually queried, not merely the primary one", async () => {
    const provider = await providerWithKey();
    const result = provider.supports(
      company({
        listings: [
          listing({ id: 7, symbol: "ACMEF", mic: "OOTC", isPrimary: true }),
          listing({ id: 9, symbol: "ACME", mic: "XNYS", isPrimary: false }),
        ],
      }),
    );
    expect(result.symbol).toBe("ACME");
    expect(result.listingId).toBe(9);
  });
});

describe("MarketauxProvider — venues that cannot be qualified", () => {
  /** London International board codes (LO) and similar have no suffix mapping.
   *  A bare non-US symbol sent to a global provider asks about whichever
   *  company owns that ticker elsewhere, and a zero-result would then stop the
   *  provider chain as an "authoritative" no-news. */
  it("skips a non-US listing whose venue has no suffix mapping", async () => {
    const provider = await providerWithKey();
    const result = provider.supports(
      company({
        ticker: "0A0L",
        companyName: "Sectra AB",
        listings: [listing({ exchangeCode: "LO", mic: null, symbol: "0A0L", isUs: false, isPrimary: true })],
      }),
    );
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/no resolved listing/);
  });

  it("still uses a usable US listing when the non-US one cannot be qualified", async () => {
    const provider = await providerWithKey();
    const result = provider.supports(
      company({
        listings: [
          listing({ id: 1, exchangeCode: "LO", mic: null, symbol: "0A0L", isUs: false, isPrimary: true }),
          listing({ id: 2, exchangeCode: "US", mic: "OOTC", symbol: "STKTF", isUs: true, isPrimary: false }),
        ],
      }),
    );
    expect(result.supported).toBe(true);
    expect(result.symbol).toBe("STKTF");
    expect(result.listingId).toBe(2);
  });
});
