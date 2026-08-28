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

/** `cp .env.example .env` must not change behaviour compared with no .env at
 *  all. An assignment with an empty value is NOT the same as an absent one for
 *  any setting that treats "" as meaningful - DEAD_ARTICLE_HOSTS reads an empty
 *  value as "disable the filter", so shipping `DEAD_ARTICLE_HOSTS=` in the
 *  template silently turned off dead-link filtering for every fresh clone while
 *  working perfectly in a dev environment that had no such line. */
it("does not assign an empty value to settings where empty means something", () => {
  const template = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const emptyMeansDisabled = ["DEAD_ARTICLE_HOSTS"];

  for (const key of emptyMeansDisabled) {
    const assigned = new RegExp(`^\\s*${key}\\s*=\\s*$`, "m").test(template);
    expect(assigned, `${key}= is assigned empty in .env.example; comment it out instead`).toBe(false);
  }
});
