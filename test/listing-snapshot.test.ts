import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseListingSnapshot } from "../src/catalogue/listing-snapshot.js";

const fixture = JSON.parse(readFileSync("data/listings-mapping.json", "utf8"));
describe("offline listing snapshot validation", () => {
  it("accepts the tracked mapping with its existing provenance and unresolved identities", () => {
    const rows = parseListingSnapshot(fixture);
    expect(rows).toHaveLength(2026);
    expect(new Set(rows.map((row) => row.catalogue_ticker)).size).toBe(1515);
    expect(rows.some((row) => row.resolution_status === "unresolved")).toBe(true);
    expect(rows.find((row) => row.catalogue_ticker === "GOOGL" && row.symbol === "GOOGL")).toMatchObject({ mic: "XNAS", source: "finnhub_directory" });
  });
  it.each([
    [], [{ ...fixture[0], confidence: 1.5 }], [{ ...fixture[0], source: "unreviewed-source" }],
    [{ ...fixture[0], symbol: null }], [{ ...fixture[0], exchange_code: null }],
  ].map((snapshot) => ({ snapshot })))("rejects invalid snapshots before any database write (%#)", ({ snapshot }) => {
    expect(() => parseListingSnapshot(snapshot)).toThrow("snapshot is invalid");
  });
});
