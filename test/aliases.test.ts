import { describe, expect, it } from "vitest";
import { isKnownAlias, nameSimilarity, NAME_MATCH_THRESHOLD } from "../src/catalogue/names.js";

/** The surface-form matcher compares normalised tokens, so it cannot know that
 *  a trading name and a legal name are one company, nor that a directory's
 *  native-language name matches a supplier's English one. Both rejected a
 *  *correct* identifier. These are the real cases from the catalogue. */
describe("name aliases", () => {
  it("matches a trading name to its legal name", () => {
    expect(isKnownAlias("Westinghouse Air Brake Technologies", "WABTEC CORP")).toBe(true);
    expect(nameSimilarity("Westinghouse Air Brake Technologies", "WABTEC CORP"))
      .toBeGreaterThanOrEqual(NAME_MATCH_THRESHOLD);
  });

  it("matches a native-language directory name", () => {
    expect(isKnownAlias("Munich Reinsurance", "MUENCHENER RUECKVER AG-REG")).toBe(true);
    expect(nameSimilarity("Munich Reinsurance", "MUENCHENER RUECKVER AG-REG"))
      .toBeGreaterThanOrEqual(NAME_MATCH_THRESHOLD);
  });

  it("is symmetric", () => {
    expect(isKnownAlias("WABTEC CORP", "Westinghouse Air Brake Technologies")).toBe(true);
  });

  it("does NOT collapse genuinely different companies", () => {
    // The rejection that was correct, and must stay correct.
    expect(isKnownAlias("Pure Storage Inc", "EVERPURE INC-A")).toBe(false);
    expect(nameSimilarity("Pure Storage Inc", "EVERPURE INC-A")).toBeLessThan(NAME_MATCH_THRESHOLD);
    // And the collisions the resolver already protects against.
    expect(isKnownAlias("Balfour Beatty", "Best Buy")).toBe(false);
    expect(isKnownAlias("Prudential PLC", "PRUDENTIAL FINANCIAL INC")).toBe(false);
  });

  it("tolerates empty input", () => {
    expect(isKnownAlias("", "WABTEC CORP")).toBe(false);
    expect(isKnownAlias("Wabtec", "")).toBe(false);
  });
});
