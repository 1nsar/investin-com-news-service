import { describe, expect, it } from "vitest";
import { NAME_MATCH_THRESHOLD, nameSimilarity, normalizeName, searchableName } from "../src/catalogue/names.js";

describe("normalizeName", () => {
  it("strips legal forms and depositary noise to a shared key", () => {
    expect(normalizeName("Toyota Motor Corp")).toBe("toyota motor");
    expect(normalizeName("TOYOTA MOTOR CORP -SPON ADR")).toBe("toyota motor");
    expect(normalizeName("Nestle SA-REG")).toBe("nestle");
    expect(normalizeName("NESTLE SA-SPONS ADR")).toBe("nestle");
  });

  it("folds accents so international names compare equal", () => {
    expect(normalizeName("Moet Hennessy")).toBe(normalizeName("Moët Hennessy"));
  });
});

describe("nameSimilarity", () => {
  it("accepts the same company written differently", () => {
    expect(nameSimilarity("Novo Nordisk A/S", "NOVO NORDISK A/S-B")).toBeGreaterThanOrEqual(
      NAME_MATCH_THRESHOLD,
    );
    expect(nameSimilarity("Siemens Energy AG", "SIEMENS ENERGY AG SPON ADR")).toBeGreaterThanOrEqual(
      NAME_MATCH_THRESHOLD,
    );
  });

  // These are the real collisions in the supplied catalogue: the same ticker
  // string belongs to a different company on a US exchange.
  it("rejects the catalogue's ticker collisions", () => {
    const collisions: [string, string][] = [
      ["Balfour Beatty PLC", "BEST BUY CO INC"],
      ["Admiral Group PLC", "ARCHER-DANIELS-MIDLAND CO"],
      ["Novo Nordisk A/S", "NOV INC"],
      ["Siemens Energy AG", "ENERGIZER HOLDINGS INC"],
      ["flatexDEGIRO AG", "FLOTEK INDUSTRIES INC"],
      ["Cranswick PLC", "CUSHMAN & WAKEFIELD PLC"],
    ];
    for (const [left, right] of collisions) {
      expect(nameSimilarity(left, right)).toBeLessThan(NAME_MATCH_THRESHOLD);
    }
  });

  // Every pair below is a real false rejection observed while resolving this
  // catalogue: the same company written differently by the reference source.
  it("accepts abbreviated and punctuated variants of the same company", () => {
    const same: [string, string][] = [
      ["Smith AO Corporation", "SMITH (A.O.) CORP"],
      ["Brinks Company", "BRINK'S CO/THE"],
      ["Auto Trader Group Plc", "AUTOTRADER GROUP PLC"],
      ["Babcock International Group PLC", "BABCOCK INTL GROUP PLC"],
      ["Expeditors International of Washington Inc", "EXPEDITORS INTL WASH INC"],
      ["Concentra Group Holdings Parent Inc", "CONCENTRA GROUP HOLDINGS PAR"],
      ["Grupo Aeroportuario del Sureste SAB de CV ADR", "GRUPO AEROPORTUARIO SUR-ADR"],
      ["Oceaneering International, Inc.", "OCEANEERING INTL INC"],
      ["WW Grainger Inc", "W.W. GRAINGER INC"],
    ];
    for (const [left, right] of same) {
      expect(nameSimilarity(left, right), `${left} vs ${right}`).toBeGreaterThanOrEqual(
        NAME_MATCH_THRESHOLD,
      );
    }
  });

  it("does not accept a single shared token as a match", () => {
    expect(nameSimilarity("Shanghai International Airport", "Shanghai Electric")).toBeLessThan(
      NAME_MATCH_THRESHOLD,
    );
  });
});

describe("searchableName", () => {
  it("drops legal suffixes that suppress news search results", () => {
    expect(searchableName("Munich Reinsurance Company AG")).toBe("Munich Reinsurance");
    expect(searchableName("Admiral Group PLC")).toBe("Admiral");
  });
});
