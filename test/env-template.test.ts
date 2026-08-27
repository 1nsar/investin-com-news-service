import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** `.env.example` is TRACKED; `.env` is not. Editing the wrong one puts a live
 *  credential into the repository, and it is an easy mistake — the two files
 *  sit next to each other and look identical. This happened during development
 *  with a real Marketaux key.
 *
 *  Any secret-shaped field in the template must therefore be empty. */
const SECRET_FIELD = /^([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))=(.*)$/;

describe(".env.example", () => {
  const lines = readFileSync(".env.example", "utf8").split("\n");

  it("carries no credential values", () => {
    const populated: string[] = [];
    for (const line of lines) {
      const match = SECRET_FIELD.exec(line.trim());
      if (match && (match[2] ?? "").trim().length > 0) populated.push(match[1] as string);
    }
    expect(
      populated,
      `these fields have values in the tracked template and must be blank: ${populated.join(", ")}`,
    ).toEqual([]);
  });

  it("still documents every key the service reads", () => {
    const documented = new Set(
      lines.map((line) => SECRET_FIELD.exec(line.trim())?.[1]).filter(Boolean) as string[],
    );
    for (const required of ["FINNHUB_API_KEY", "MARKETAUX_API_KEY", "OPENFIGI_API_KEY"]) {
      expect(documented.has(required), `${required} is missing from .env.example`).toBe(true);
    }
  });
});
