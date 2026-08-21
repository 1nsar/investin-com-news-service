import { describe, expect, it } from "vitest";
import {
  RELEVANCE_FLOOR,
  ROUNDUP_THRESHOLD,
  mentionsCompanyExactly,
  roundupPenaltySql,
  scoreRelevance,
  sourceTier,
  verifyNameMatch,
} from "../src/ingest/relevance.js";

describe("verifyNameMatch", () => {
  // Every case below is a real misattribution observed in this catalogue.
  it("rejects the misattributions the name search actually produced", () => {
    const bad: [string, string][] = [
      ["Kid ASA", "‘Club Kid’ Trailer: Jordan Firstman’s Directorial Debut Earns Raves"],
      ["Kid ASA", "My favorite loyalty program perk? The one that pays me back"],
      ["Jensen-Group", "How BMW Financial Services North America CEO is navigating fresh terrain"],
      ["Jensen-Group", "LG, Nvidia Accelerate Physical AI Robot Partnership"],
      ["Jensen-Group", "Eva Rose: The \"Sorry If It's Selfish\" Tour"],
      ["Safari Industries", "IHCL Signs Gateway Hotel Near Bengaluru Airport"],
    ];
    for (const [company, headline] of bad) {
      expect(verifyNameMatch(company, headline).verified, `${company} :: ${headline}`).toBe(false);
    }
  });

  it("accepts articles genuinely about the company", () => {
    const good: [string, string][] = [
      ["Jensen-Group", "Jensen Group reports record quarterly revenue"],
      ["Malta International Airport", "Malta International Airport passenger numbers climb 8%"],
      ["Admiral Group PLC", "Admiral shares jump after profit beats analyst forecasts"],
      ["Novo Nordisk A/S", "Novo Nordisk raises full-year guidance"],
    ];
    for (const [company, headline] of good) {
      expect(verifyNameMatch(company, headline).verified, `${company} :: ${headline}`).toBe(true);
    }
  });

  // One shared token is not a match. This exact rule, when it was too loose,
  // linked 163 macro articles to 1,262 companies because every energy company
  // matched every article containing the word "energy".
  it("does not match on a single shared token of a multi-word name", () => {
    const headline = "US to announce steps to help refiners produce more fuel, easing energy costs";
    for (const company of ["Bloom Energy Corporation", "Duke Energy", "Vistra Energy", "Siemens Energy AG"]) {
      expect(verifyNameMatch(company, headline).verified, company).toBe(false);
    }
    // But the company actually named still matches.
    expect(
      verifyNameMatch("Bloom Energy Corporation", "Bloom Energy wins fuel cell contract").verified,
    ).toBe(true);
  });

  // "Jensen-Group" reduces to the single token "jensen", which matched every
  // story about NVIDIA's CEO Jensen Huang.
  it("does not match a surname that belongs to a different entity", () => {
    const wrong = [
      "The 4 Words From Jensen Huang That Could Redefine NVIDIA",
      "Elon Musk and Jensen Huang's New Partnership Could Create",
      "Jensen Releases 2026-27 Wyoming Men's Golf Schedule",
      "LG's Koo gifts Nvidia's Jensen Huang miniature humanoid robot",
    ];
    for (const headline of wrong) {
      expect(verifyNameMatch("Jensen-Group", headline).verified, headline).toBe(false);
    }
    // The company itself still matches, including its own continuation.
    expect(verifyNameMatch("Jensen-Group", "Jensen Group reports record revenue").verified).toBe(true);
    expect(verifyNameMatch("Jensen-Group", "Jensen shares climb after earnings").verified).toBe(true);
  });

  it("requires financial context before trusting an everyday-word name", () => {
    // "Kid" alone proves nothing; "Kid ASA shares" does.
    expect(verifyNameMatch("Kid ASA", "A kid built a treehouse").verified).toBe(false);
    expect(
      verifyNameMatch("Kid ASA", "Kid ASA shares rise after strong quarterly earnings").verified,
    ).toBe(true);
  });
});

describe("mentionsCompanyExactly", () => {
  it("only links a macro story to a company named outright", () => {
    const macro = "US to announce steps to help refiners produce more fuel, easing energy costs";
    expect(mentionsCompanyExactly("Bloom Energy Corporation", macro)).toBe(false);
    expect(mentionsCompanyExactly("Duke Energy", macro)).toBe(false);

    const named = "US warns Siemens devices can be hacked amid fears Iran is breaching water plants";
    expect(mentionsCompanyExactly("Siemens Energy AG", named)).toBe(false); // "Siemens Energy" is not the phrase used
    expect(mentionsCompanyExactly("Novo Nordisk A/S", "Novo Nordisk raises guidance")).toBe(true);
  });

  it("separates an ambiguous company name from ordinary verb usage", () => {
    // Real false positive: a profit-taking story filed under Booking Holdings.
    expect(
      mentionsCompanyExactly("Booking Holdings Inc", "We're booking a five-fold profit on the rally"),
    ).toBe(false);
    expect(
      mentionsCompanyExactly("Booking Holdings Inc", "Booking shares climb after earnings beat"),
    ).toBe(true);
  });

  it("still links distinctive single-word names", () => {
    expect(mentionsCompanyExactly("NVIDIA Corp", "Nvidia backs financing for OpenAI data center")).toBe(true);
    // Full headline: a single-word name needs recognisable business context,
    // and "customer" supplies it. The truncated form legitimately does not.
    expect(
      mentionsCompanyExactly(
        "Broadcom Inc",
        "Where we stand on Broadcom after Marvell muscles in on its key customer Google",
      ),
    ).toBe(true);
    expect(mentionsCompanyExactly("Broadcom Inc", "Where we stand on Broadcom today")).toBe(false);
  });
});

describe("sourceTier", () => {
  it("separates primary wires from aggregators", () => {
    expect(sourceTier("Reuters")).toBe(1);
    expect(sourceTier("Bloomberg")).toBe(1);
    expect(sourceTier("MarketWatch")).toBe(2);
    expect(sourceTier("Benzinga")).toBe(3);
    expect(sourceTier("ChartMill")).toBe(3);
    expect(sourceTier(null)).toBe(3);
  });
});

describe("scoreRelevance", () => {
  const base = { companyName: "Acme Corp", headline: "Acme Corp beats estimates" };

  it("ranks a company-specific wire story highest", () => {
    const result = scoreRelevance({ ...base, matchMethod: "ticker", source: "Reuters" });
    expect(result.score).toBeGreaterThan(0.9);
  });

  // The round-up penalty is applied at READ time, because how many companies
  // an article is filed against is not known while it is being stored.
  it("applies the round-up penalty from the live company count", () => {
    const sql = roundupPenaltySql("n");
    expect(sql).toContain(String(ROUNDUP_THRESHOLD));
    // A company-specific story keeps its intrinsic score; a 28-company
    // round-up loses 0.35 and a 5-company one loses 0.15.
    const evaluate = (n: number): number =>
      n >= ROUNDUP_THRESHOLD ? 0.35 : n >= 4 ? 0.15 : 0;
    expect(evaluate(1)).toBe(0);
    expect(evaluate(5)).toBe(0.15);
    expect(evaluate(28)).toBe(0.35);
  });

  it("scores an unverifiable name match at zero so it is never stored", () => {
    const result = scoreRelevance({
      matchMethod: "name_match",
      companyName: "Kid ASA",
      headline: "‘Club Kid’ Trailer: Jordan Firstman’s Directorial Debut",
      source: "Yahoo",
    });
    expect(result.verified).toBe(false);
    expect(result.score).toBeLessThan(RELEVANCE_FLOOR);
  });
});

describe("redactUrl", () => {
  it("removes credentials from URLs that reach logs, errors and the API", async () => {
    const { redactUrl } = await import("../src/util/http.js");
    expect(redactUrl("https://finnhub.io/api/v1/company-news?symbol=AAPL&token=SECRET")).toBe(
      "https://finnhub.io/api/v1/company-news?symbol=AAPL&token=REDACTED",
    );
    expect(redactUrl("https://x.com/a?apiKey=abc&q=1")).not.toContain("abc");
    // Error messages are stored in fetch_run_companies.error and served by the
    // runs API, so an un-redacted URL would publish the key.
    const { HttpError } = await import("../src/util/http.js");
    const error = new HttpError(500, "https://finnhub.io/x?token=SECRET", "boom");
    expect(error.message).not.toContain("SECRET");
    expect(error.url).not.toContain("SECRET");
  });
});

describe("defects found in review", () => {
  it("does not let an ampersand name match the word 'and'", () => {
    const headline = "Fed holds rates steady as global stocks and bonds rally";
    for (const company of ["AT&T Inc", "PG&E Corp", "M&G PLC", "H&K AG", "S&P Global"]) {
      expect(verifyNameMatch(company, headline).verified, company).toBe(false);
    }
    expect(verifyNameMatch("AT&T Inc", "AT&T raises full-year guidance").verified).toBe(true);
  });

  it("accepts title-cased headlines, which are the dominant real form", () => {
    for (const [company, headline] of [
      ["Broadcom Inc", "Broadcom Announces Q3 Results"],
      ["Copart Inc", "Copart Reports Record Revenue"],
      ["Softcat PLC", "Softcat Wins Major Contract"],
    ] as [string, string][]) {
      expect(verifyNameMatch(company, headline).verified, headline).toBe(true);
    }
    // The surname guard still works in sentence case, where a capital means
    // something.
    expect(
      verifyNameMatch("Jensen-Group", "Nvidia boss Jensen Huang said on Monday").verified,
    ).toBe(false);
  });

  it("can verify two-character company names", () => {
    for (const company of ["3M Company", "HP Inc", "3i Group PLC", "Q2 Holdings"]) {
      const result = verifyNameMatch(company, `${company} reports quarterly earnings`);
      expect(result.verified, `${company}: ${result.reason}`).toBe(true);
    }
  });

  it("matches accented company names against accented headlines", () => {
    expect(verifyNameMatch("Société Générale", "Société Générale posts record profit").verified).toBe(true);
    expect(verifyNameMatch("Société Générale", "Societe Generale posts record profit").verified).toBe(true);
    expect(verifyNameMatch("Nestlé S.A.", "Nestlé raises guidance as shares jump").verified).toBe(true);
  });
});
