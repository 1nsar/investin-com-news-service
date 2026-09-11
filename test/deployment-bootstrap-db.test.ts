/** Opt-in test for a disposable Unix-socket PostgreSQL cluster only.
 * DATABASE_URL must point to /private/tmp/news-deploy-pg.*/
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closePool, pool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { loadCatalogue } from "../src/catalogue/loader.js";
import { importListingSnapshot } from "../src/catalogue/listing-snapshot.js";
import { seedIdentityAliases } from "../src/catalogue/identity-aliases.js";
import { bootstrapProduction } from "../src/deployment/bootstrap.js";
import { saveResolutions } from "../src/resolution/store.js";
import { resolveCompany } from "../src/v2/store.js";

describe.skipIf(process.env.NEWS_DEPLOYMENT_TEST_DB !== "1")("fresh deployment in disposable PostgreSQL", () => {
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? "");
    if (!database.pathname.startsWith("/news_deploy_test_") || !database.searchParams.get("host")?.startsWith("/private/tmp/news-deploy-pg.")) {
      throw new Error("Deployment tests require their disposable database and Unix socket; refusing any existing workspace database.");
    }
    const current = await pool.query("SELECT current_database() AS name");
    expect(current.rows[0].name).toMatch(/^news_deploy_test_/);
    const tables = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public'");
    expect(tables.rows, "Use a fresh disposable test database.").toHaveLength(0);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Offline bootstrap attempted an outbound request."); }));
  });
  afterAll(async () => {
    if (vi.isMockFunction(fetch)) expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    await closePool();
  });

  it("seeds aliases after fresh catalogue and listing import, including the two portfolio identities", async () => {
    await migrate();
    expect((await pool.query("SELECT * FROM news_v2_company_aliases")).rows).toHaveLength(0);
    expect((await loadCatalogue()).parsed).toBe(1515);
    expect((await pool.query("SELECT ticker FROM news_v2_company_aliases")).rows).toEqual([{ ticker: "ASML" }]);
    const imported = await importListingSnapshot();
    expect(imported.companiesImported).toBe(1515);
    expect(imported.listingsImported).toBeGreaterThan(1500);
    expect(imported.aliasesInserted).toBe(1);
    expect((await pool.query("SELECT ticker FROM news_v2_company_aliases ORDER BY ticker")).rows).toEqual([{ ticker: "ASML" }, { ticker: "GOOGL" }]);
    for (const hint of [
      { ticker: "ASML", exchange: "NASDAQ", country: "NL", name: "ASML Holding N.V." },
      { ticker: "GOOGL", exchange: "NASDAQ", country: "US", name: "Alphabet Inc. Class A" },
    ]) expect((await resolveCompany(hint)).status).toBe("matched");
  }, 30_000);

  it("repeats offline bootstrap without replacing current listings or re-enabling a disabled alias", async () => {
    const before = await pool.query("SELECT count(*)::int AS n FROM listings");
    await pool.query("UPDATE news_v2_company_aliases SET enabled=false WHERE ticker='ASML'");
    await pool.query("UPDATE companies SET resolution_note='newer reviewed resolution' WHERE ticker_raw='GOOGL'");
    const result = await bootstrapProduction();
    expect(result.migrations).toEqual([]);
    expect(result.catalogue.inserted).toBe(0);
    expect(result.listings.listingsImported).toBe(0);
    expect(result.listings.companiesSkipped).toBe(1515);
    expect((await pool.query("SELECT count(*)::int AS n FROM listings")).rows).toEqual(before.rows);
    expect((await pool.query("SELECT enabled FROM news_v2_company_aliases WHERE ticker='ASML'")).rows[0].enabled).toBe(false);
    expect((await pool.query("SELECT resolution_note FROM companies WHERE ticker_raw='GOOGL'")).rows[0].resolution_note).toBe("newer reviewed resolution");
    expect((await pool.query("SELECT * FROM news_v2_provider_configs")).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM news_v2_jobs")).rows).toHaveLength(0);
  }, 30_000);

  it("seeds the listing-dependent alias after an explicit resolution save", async () => {
    await pool.query("DELETE FROM news_v2_company_aliases WHERE ticker='GOOGL'");
    const company = (await pool.query("SELECT id FROM companies WHERE ticker_raw='GOOGL'")).rows[0];
    await saveResolutions([{ companyId: Number(company.id), ticker: "GOOGL", status: "resolved", note: "Isolated test resolution", listings: [{
      exchangeCode: "US", mic: "XNAS", symbol: "GOOGL", symbolFormat: "us", securityKind: "ordinary", country: "US", currency: "USD",
      figi: null, compositeFigi: null, shareClassFigi: null, isin: null, isPrimary: true, isUs: true, confidence: 1, source: "catalogue",
    }] }]);
    expect((await pool.query("SELECT ticker FROM news_v2_company_aliases WHERE ticker='GOOGL'")).rows).toHaveLength(1);
  });

  it("refuses a conflicting issuer instead of using the alias seed as a ticker override", async () => {
    await pool.query("DELETE FROM news_v2_company_aliases WHERE ticker='GOOGL'");
    const conflict = (await pool.query(`INSERT INTO companies(ticker_raw,company_name,name_normalized,country_raw)
      VALUES('SYN-CONFLICT','Unrelated Test Issuer','unrelated test issuer','US') RETURNING id`)).rows[0];
    await pool.query("INSERT INTO listings(company_id,exchange_code,mic,symbol,source) VALUES($1,'US','XNAS','GOOGL','catalogue')", [conflict.id]);
    await seedIdentityAliases();
    expect((await pool.query("SELECT ticker FROM news_v2_company_aliases WHERE ticker='GOOGL'")).rows).toHaveLength(0);
    expect((await resolveCompany({ ticker: "GOOGL", exchange: "NASDAQ", country: "US", name: "Alphabet Inc. Class A" })).status).not.toBe("matched");
  });
});
