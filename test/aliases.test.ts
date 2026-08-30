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

describe("national legal forms and renames", () => {
  const matches = (a: string, b: string): boolean => nameSimilarity(a, b) >= NAME_MATCH_THRESHOLD;

  it("treats Abp as a legal form, like plc or ag", () => {
    // Finnish/Swedish for a public company. Without it, "Konecranes Abp"
    // scored 0.59 against "KONECRANES OYJ" - one hundredth under threshold.
    expect(matches("Konecranes Abp", "KONECRANES OYJ")).toBe(true);
  });

  it("bridges a corporate rename", () => {
    // Novozymes became Novonesis; no string similarity can derive that.
    expect(matches("Novozymes AS", "NOVONESIS B")).toBe(true);
  });

  it("bridges a shortened trade name", () => {
    expect(matches("Adobe Systems Inc", "ADOBE INC")).toBe(true);
  });

  it("bridges supplier abbreviations of a long legal name", () => {
    expect(matches("ACS Actividades Constr y Srvcs",
                   "ACS ACTIVIDADES DE CONSTRUCCION Y SERVICIOS SA")).toBe(true);
  });

  it("STILL rejects the collisions these aliases must not reopen", () => {
    // The whole point of the name check. Loosening matching to fix the cases
    // above must not let these through.
    expect(matches("Apple Inc", "Apple Hospitality REIT")).toBe(false);
    expect(matches("Prudential PLC", "PRUDENTIAL FINANCIAL INC")).toBe(false);
    expect(matches("Balfour Beatty", "BEST BUY CO INC")).toBe(false);
    expect(matches("Admiral Group", "ARCHER-DANIELS-MIDLAND CO")).toBe(false);
  });
});

describe("names abbreviated word-by-word", () => {
  const matches = (a: string, b: string): boolean => nameSimilarity(a, b) >= NAME_MATCH_THRESHOLD;

  it("matches a name shortened to fit a field", () => {
    // Reference data truncates to a fixed width. Sometimes that clips the last
    // word; sometimes it shortens every word. Both are the same company.
    expect(matches("Construcciones y Auxiliar de Ferrocarriles",
                   "CONSTRUCC Y AUX DE FERROCARR")).toBe(true);
    expect(matches("Corporación Interamericana de Entretenimiento",
                   "CORP INTERAMERICANA DE ENTRE")).toBe(true);
  });

  it("does NOT let abbreviation matching reopen the collisions", () => {
    // The guard is three-or-more aligned words. Every collision below turns on
    // one or two short tokens, so none of them qualify.
    expect(matches("Apple Inc", "Apple Hospitality REIT")).toBe(false);
    expect(matches("Prudential PLC", "PRUDENTIAL FINANCIAL INC")).toBe(false);
    expect(matches("Shanghai Airport", "Shanghai Electric Group")).toBe(false);
    expect(matches("Nova Ltd", "Novartis AG")).toBe(false);
    expect(matches("Sea Limited", "Sea World Entertainment")).toBe(false);
  });
});

describe("abbreviation matching must not credit stray initials", () => {
  const matches = (a: string, b: string): boolean => nameSimilarity(a, b) >= NAME_MATCH_THRESHOLD;

  it("does not match two unrelated companies through a single letter", () => {
    // "H & M Hennes & Mauritz" normalises to "h m hennes mauritz". Every word
    // of "Martin Marietta Materials" starts with "m", and crediting that
    // scored 0.78 - a false match between two real rows in this catalogue.
    expect(matches("H & M Hennes & Mauritz AB ADR", "Martin Marietta Materials Inc")).toBe(false);
  });

  it("still matches genuinely abbreviated names", () => {
    expect(matches("Construcciones y Auxiliar de Ferrocarriles",
                   "CONSTRUCC Y AUX DE FERROCARR")).toBe(true);
  });
});
