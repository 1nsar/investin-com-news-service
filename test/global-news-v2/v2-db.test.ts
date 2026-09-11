/** Run NEWS_V2_TEST_DB=1 node --import dotenv/config node_modules/vitest/vitest.mjs run test/global-news-v2/v2-db.test.ts.
 * Every test runs inside a rolled-back transaction. */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, pool } from "../../src/db/pool.js";
import { definitionFor, deleteProvider, persistArticles, providerStatuses, resolveCompany, updateProvider } from "../../src/features/global-news-v2/store.js";
import { readArticle, readNews } from "../../src/features/global-news-v2/read.js";
import type { ProviderArticle } from "../../src/features/global-news-v2/types.js";

const state=vi.hoisted(()=>({client:undefined as PoolClient|undefined}));
vi.mock("../../src/db/pool.js",async(importOriginal)=>{
  const actual=await importOriginal<typeof import("../../src/db/pool.js")>();
  return {...actual,
    query:(sql:string,params:unknown[]=[],client?:PoolClient)=>actual.query(sql,params,client??state.client??actual.pool),
    queryOne:(sql:string,params:unknown[]=[],client?:PoolClient)=>actual.queryOne(sql,params,client??state.client??actual.pool),
    transaction:async(fn:(client:PoolClient)=>Promise<unknown>)=>{
      if(!state.client)throw new Error("Integration test requires its rollback transaction.");
      return fn(state.client);
    },
  };
});

describe.skipIf(process.env.NEWS_V2_TEST_DB!=="1")("V2 PostgreSQL integration (rollback only)",()=>{
  beforeEach(async()=>{
    vi.stubEnv("NEWS_V2_ENCRYPTION_KEY",randomBytes(32).toString("base64"));
    state.client=await pool.connect();await state.client.query("BEGIN");
    await state.client.query(readFileSync(new URL("../../src/db/migrations/010_news_v2_identity_aliases.sql",import.meta.url),"utf8"));
    // Isolate this provider within the uncommitted transaction; existing rows are restored by ROLLBACK.
    await state.client.query("DELETE FROM news_v2_articles WHERE provider_id='benzinga'");
    await state.client.query("DELETE FROM news_v2_provider_configs WHERE provider_id='benzinga'");
  });
  afterEach(async()=>{await state.client?.query("ROLLBACK");state.client?.release();state.client=undefined;vi.unstubAllEnvs();});
  afterAll(async()=>{await closePool();});
  const fixture=():ProviderArticle=>({sourceId:`synthetic:${randomUUID()}`,action:"upsert",headline:"Synthetic issuer announcement",summary:"Synthetic summary.",body:"Synthetic full article text.",publisher:"Synthetic Wire",url:"https://publisher.example/synthetic",publishedAt:"2026-08-01T10:00:00Z",updatedAt:"2026-08-01T10:01:00Z",rights:{bodyAllowed:true,imageAllowed:false,attribution:"Synthetic test only",licenseStatus:"licensed"}});
  it("deduplicates source revisions, rejects out-of-order updates, and purges withdrawn content",async()=>{
    const client=state.client!,definition=definitionFor("benzinga"),article=fixture();
    expect(await persistArticles(client,definition,[article],true)).toBe(1);
    expect(await persistArticles(client,definition,[article],true)).toBe(0);
    expect(await persistArticles(client,definition,[{...article,body:"Corrected synthetic body.",updatedAt:"2026-08-01T10:02:00Z",correction:true}],true)).toBe(1);
    expect(await persistArticles(client,definition,[article],true)).toBe(0);
    let row=(await client.query("SELECT * FROM news_v2_articles WHERE provider_article_id=$1",[article.sourceId])).rows[0];
    expect(row.revision).toBe(2);expect(row.correction).toBe(true);
    await persistArticles(client,definition,[{...article,action:"delete",publishedAt:"2026-08-02T10:00:00Z",updatedAt:"2026-08-02T10:00:00Z"}],true);
    row=(await client.query("SELECT * FROM news_v2_articles WHERE provider_article_id=$1",[article.sourceId])).rows[0];
    expect(row.deleted).toBe(true);expect(row.revision).toBe(3);expect(row.body).toBeNull();expect(row.summary).toBeNull();
    expect(row.published_at.toISOString()).toBe("2026-08-01T10:00:00.000Z");
    const revisions=(await client.query("SELECT snapshot FROM news_v2_article_revisions WHERE article_id=$1",[row.id])).rows;
    expect(revisions).toHaveLength(3);expect(revisions.every(r=>r.snapshot.body===null&&r.snapshot.summary===null)).toBe(true);
  });
  it("gates feed/detail access and purges both current and historical text when rights are removed",async()=>{
    const client=state.client!,article=fixture(),definition=definitionFor("benzinga");
    await updateProvider("benzinga",{enabled:true,displayLicensed:true,fullTextEnabled:true,credentials:{apiKey:"synthetic-only-key"}});
    const config=(await client.query("SELECT credentials_encrypted FROM news_v2_provider_configs WHERE provider_id='benzinga'")).rows[0];
    expect(config.credentials_encrypted).not.toContain("synthetic-only-key");
    await persistArticles(client,definition,[article],true);
    const id=(await client.query("SELECT id FROM news_v2_articles WHERE provider_article_id=$1",[article.sourceId])).rows[0].id;
    const options={scope:"all" as const,source:"benzinga" as const,companyIds:[],limit:10};
    const feed=await readNews(options);expect(feed.data).toHaveLength(1);expect(feed.data[0]?.body).toBeNull();expect(feed.data[0]?.contentMode).toBe("full_text");
    expect((await readArticle(id))?.body).toBe(article.body);
    await updateProvider("benzinga",{fullTextEnabled:false});
    expect((await readArticle(id))?.body).toBeNull();
    let revisions=(await client.query("SELECT snapshot FROM news_v2_article_revisions WHERE article_id=$1",[id])).rows;
    expect(revisions.every(r=>r.snapshot.body===null)).toBe(true);
    await updateProvider("benzinga",{fullTextEnabled:true});await persistArticles(client,definition,[article],true);
    expect((await readArticle(id))?.body).toBe(article.body);
    await deleteProvider("benzinga");
    expect(await readArticle(id)).toBeNull();expect((await readNews(options)).data).toHaveLength(0);
    revisions=(await client.query("SELECT snapshot FROM news_v2_article_revisions WHERE article_id=$1",[id])).rows;
    expect(revisions.every(r=>r.snapshot.body===null)).toBe(true);
    expect((await client.query("SELECT credentials_encrypted FROM news_v2_provider_configs WHERE provider_id='benzinga'")).rows[0].credentials_encrypted).toBeNull();
  });
  it("reports UTC request counts independently of the local DATE parser and keeps empty portfolios empty",async()=>{
    await state.client!.query("INSERT INTO news_v2_provider_state(provider_id,budget_day,requests_today) VALUES('benzinga',(now() AT TIME ZONE 'UTC')::date,17) ON CONFLICT(provider_id) DO UPDATE SET budget_day=EXCLUDED.budget_day,requests_today=17");
    expect((await providerStatuses()).find(p=>p.id==="benzinga")?.budget.requestsToday).toBe(17);
    expect((await readNews({scope:"portfolio",source:"all",companyIds:[],limit:10})).data).toEqual([]);
  });
  it("paginates only readable live articles and exposes body excerpts only while full-text access is enabled",async()=>{
    const client=state.client!,definition=definitionFor("benzinga");
    await updateProvider("benzinga",{enabled:true,displayLicensed:true,fullTextEnabled:true,credentials:{apiKey:"synthetic-only-key"}});
    const originalSummary="Publisher-provided summary stays unchanged.";
    const full={...fixture(),summary:originalSummary,body:"Actual source paragraph with its reported details. ".repeat(35),publishedAt:"2026-08-01T10:00:00Z"};
    const summary={...fixture(),body:null,summary:"The issuer announced its quarterly results, confirmed its guidance and explained the changes in operating costs during the reporting period.",publishedAt:"2026-08-02T10:00:00Z",rights:{...full.rights,bodyAllowed:false}};
    const unavailable={...fixture(),body:null,headline:"Official release about monetary policy and economic developments around the world today",summary:"Official release about monetary policy and economic developments around the world today",publishedAt:"2026-08-03T10:00:00Z",rights:{...full.rights,bodyAllowed:false}};
    await persistArticles(client,definition,[full,summary,unavailable],true);
    const options={scope:"all" as const,source:"benzinga" as const,companyIds:[],limit:1};
    const first=await readNews(options);expect(first.data[0]?.summary).toBe(summary.summary);expect(first.pagination.hasMore).toBe(true);
    const second=await readNews({...options,cursor:first.pagination.nextCursor!});
    expect(second.pagination.hasMore).toBe(false);expect(second.data[0]?.summary).toBe(originalSummary);
    expect(second.data[0]?.previewText).toMatch(/^Actual source paragraph/);expect(second.data[0]?.previewText?.length).toBeLessThanOrEqual(700);
    expect(second.data[0]?.readingMinutes).toBe(2);expect(second.data[0]?.body).toBeNull();
    expect((await readArticle(second.data[0]!.id))?.body).toBe(full.body);
    await updateProvider("benzinga",{fullTextEnabled:false});
    const revoked=await readNews({...options,limit:10});expect(revoked.data).toHaveLength(1);expect(revoked.data[0]?.previewText).toBe(summary.summary);
    expect(revoked.data[0]?.readingMinutes).toBeNull();
    // Unavailable records remain stored for later recovery; they were hidden, not deleted.
    expect((await client.query("SELECT count(*)::int AS n FROM news_v2_articles WHERE provider_id='benzinga'")).rows[0].n).toBe(3);
  });
  it("clears old job cursors and licensed cached content when replacing an API account",async()=>{
    const client=state.client!;
    await updateProvider("benzinga",{enabled:true,displayLicensed:true,fullTextEnabled:true,credentials:{apiKey:"synthetic-old-account"}});
    await persistArticles(client,definitionFor("benzinga"),[fixture()],true);
    await client.query("INSERT INTO news_v2_provider_state(provider_id,checkpoint) VALUES('benzinga','old-account-checkpoint') ON CONFLICT(provider_id) DO UPDATE SET checkpoint=EXCLUDED.checkpoint");
    await client.query("INSERT INTO news_v2_jobs(id,provider_id,status,checkpoint) VALUES($1,'benzinga','failed','old-account-resume')",[randomUUID()]);
    await updateProvider("benzinga",{credentials:{apiKey:"synthetic-new-account"}});
    expect((await client.query("SELECT count(*)::int AS n FROM news_v2_articles WHERE provider_id='benzinga'")).rows[0].n).toBe(0);
    expect((await client.query("SELECT checkpoint FROM news_v2_provider_state WHERE provider_id='benzinga'")).rows[0].checkpoint).toBeNull();
    expect((await client.query("SELECT checkpoint FROM news_v2_jobs WHERE provider_id='benzinga'")).rows.every(row=>row.checkpoint===null)).toBe(true);
  });
  it("requires the ticker and venue to belong to the same listing",async()=>{
    const client=state.client!,ticker=`SYN-${randomUUID()}`;
    // Explicit negative fixture IDs leave production identity sequences untouched.
    await client.query("INSERT INTO companies(id,ticker_raw,company_name,name_normalized,country_raw) OVERRIDING SYSTEM VALUE VALUES(-9999001,$1,'Synthetic Holdings Corp','synthetic holdings','US')",[ticker]);
    await client.query("INSERT INTO listings(id,company_id,exchange_code,mic,symbol,source) OVERRIDING SYSTEM VALUE VALUES(-9999001,-9999001,'US','XNAS',$1,'synthetic-test'),(-9999002,-9999001,'UN','XNYS',$2,'synthetic-test')",[ticker,`ALT-${ticker}`]);
    const hint={ticker,country:"US",name:"Synthetic Holdings Corporation"};
    expect((await resolveCompany({...hint,exchange:"NASDAQ"},client)).status).toBe("matched");
    expect((await resolveCompany({...hint,exchange:"NYSE"},client)).status).toBe("unmatched");
  });
  it("uses the two audited issuer aliases without substituting share classes, countries or venues",async()=>{
    const client=state.client!;
    const asml={ticker:"ASML",exchange:"NASDAQ",country:"NL",name:"ASML Holding N.V."};
    const alphabet={ticker:"GOOGL",exchange:"NASDAQ",country:"US",name:"Alphabet Inc. Class A"};
    const first=await resolveCompany(asml,client),second=await resolveCompany(alphabet,client);
    expect(first.status).toBe("matched");expect(first.company?.name).toBe("ASML Holding NV");expect(first.evidence?.sourceUrl).toBe("https://www.asml.com/en/investors/shares");
    expect(second.status).toBe("matched");expect(second.company?.ticker).toBe("GOOGL");expect(second.evidence?.checkedAt).toBe("2026-09-09");
    for(const hint of [{...asml,exchange:"NYSE"},{...asml,country:"US"},{...asml,name:"Unrelated NV"},{...alphabet,ticker:"GOOG"},{...alphabet,name:"Alphabet Inc Class C"},{...alphabet,country:"GB"}]){
      expect((await resolveCompany(hint,client)).status).not.toBe("matched");
    }
    await client.query("UPDATE news_v2_company_aliases SET checked_at=(now() AT TIME ZONE 'UTC')::date-2,valid_until=(now() AT TIME ZONE 'UTC')::date-1 WHERE ticker='ASML'");
    expect((await resolveCompany(asml,client)).status).toBe("unmatched");
    await client.query("UPDATE news_v2_company_aliases SET checked_at=(now() AT TIME ZONE 'UTC')::date,valid_until=(now() AT TIME ZONE 'UTC')::date+365 WHERE ticker='ASML'");
    await client.query("INSERT INTO companies(id,ticker_raw,company_name,name_normalized,country_raw) OVERRIDING SYSTEM VALUE VALUES(-9999025,'SYN-IDENTITY-CONFLICT','Unrelated Synthetic Issuer','unrelated synthetic issuer','US')");
    await client.query("INSERT INTO listings(id,company_id,exchange_code,mic,symbol,source) OVERRIDING SYSTEM VALUE VALUES(-9999025,-9999025,'US','XNAS','ASML','synthetic-test')");
    expect((await resolveCompany(asml,client)).status).toBe("ambiguous");
    await client.query("DELETE FROM companies WHERE id=-9999025");
    // A disabled review record must not become a generic ticker override.
    await client.query("UPDATE news_v2_company_aliases SET enabled=FALSE WHERE ticker='ASML'");
    expect((await resolveCompany(asml,client)).status).toBe("unmatched");
  });
});
