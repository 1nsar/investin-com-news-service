import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import { adminAuthorized, decryptCredentials, encryptCredentials, safePublicUrl } from "../../src/features/global-news-v2/security.js";
import { decodeCursor, encodeCursor } from "../../src/features/global-news-v2/read.js";
import { normalizedCompanyName, normalizeProviderArticle } from "../../src/features/global-news-v2/store.js";
import { listProviderDefinitions } from "../../src/features/global-news-v2/providers/index.js";
import { v2Routes } from "../../src/features/global-news-v2/routes.js";
import { contentHash, normalizeHeadline } from "../../src/features/global-news/ingest/canonicalize.js";
import type { ProviderArticle } from "../../src/features/global-news-v2/types.js";

afterEach(()=>vi.unstubAllEnvs());
describe("V2 credentials and workspace boundary",()=>{
  it("encrypts credentials with authenticated encryption and rejects tampering/wrong keys",()=>{
    vi.stubEnv("NEWS_V2_ENCRYPTION_KEY",randomBytes(32).toString("base64"));
    const encrypted=encryptCredentials({apiKey:"synthetic-secret"});
    expect(encrypted).not.toContain("synthetic-secret");
    expect(decryptCredentials(encrypted)).toEqual({apiKey:"synthetic-secret"});
    const parts=encrypted.split(":");parts[2]=randomBytes(16).toString("base64");
    expect(()=>decryptCredentials(parts.join(":"))).toThrow();
    vi.stubEnv("NEWS_V2_ENCRYPTION_KEY",randomBytes(32).toString("base64"));
    expect(()=>decryptCredentials(encrypted)).toThrow();
  });
  it("requires the new server token on reads as well as writes",async()=>{
    vi.stubEnv("NEWS_V2_ADMIN_TOKEN","test-workspace-token");
    expect(adminAuthorized("Bearer éééééééééééééééééééé")).toBe(false);
    expect(adminAuthorized("Bearer test-workspace-token")).toBe(true);
    const app=Fastify();await app.register(v2Routes);
    for(const [method,url] of [["GET","/v2/news"],["GET","/v2/articles/legacy:1"],["GET","/v2/status"],["POST","/v2/sync"],["PUT","/v2/providers/fed"]] as const){
      const response=await app.inject({method,url});expect(response.statusCode).toBe(401);
    }
    vi.stubEnv("NEWS_V2_ADMIN_TOKEN","");
    expect((await app.inject({method:"GET",url:"/v2/news"})).statusCode).toBe(503);
    await app.close();
  });
});
describe("V2 normalization and pagination",()=>{
  const article:ProviderArticle={sourceId:"synthetic:1",action:"upsert",headline:"Example company announcement",summary:"Summary",body:"Entire sample article.",url:"https://publisher.example/article",publisher:"Example",publishedAt:"2026-08-01T10:00:00Z",rights:{bodyAllowed:true,imageAllowed:false,attribution:"Example",licenseStatus:"licensed"}};
  it("keeps paid full text unavailable until separately entitled and supported",()=>{
    const benzinga=listProviderDefinitions().find(p=>p.id==="benzinga")!;
    const marketaux=listProviderDefinitions().find(p=>p.id==="marketaux")!;
    expect(normalizeProviderArticle(article,benzinga,false).body).toBeNull();
    expect(normalizeProviderArticle(article,benzinga,true).body).toBe(article.body);
    expect(normalizeProviderArticle(article,marketaux,true).body).toBeNull();
    expect(normalizeProviderArticle({...article,body:"a".repeat(500001)},benzinga,true).body).toBeNull();
  });
  it("rejects private URLs and impossible timestamps rather than relabeling them as news",()=>{
    for(const url of ["http://example.com","https://127.0.0.1/x","https://localhost/x","https://user:pass@example.com/x","javascript:alert(1)"])expect(safePublicUrl(url)).toBeNull();
    expect(()=>normalizeProviderArticle({...article,publishedAt:"bad"},listProviderDefinitions()[0]!,false)).toThrow();
    expect(()=>normalizeProviderArticle({...article,publishedAt:"2100-01-01"},listProviderDefinitions()[0]!,false)).toThrow();
  });
  it("binds cursors to their source and handles legacy IDs without numeric coercion",()=>{
    const cursor=encodeCursor("2026-08-01T10:00:00Z","legacy:9007199254740992","archive");
    expect(decodeCursor(cursor,"archive")?.id).toBe("legacy:9007199254740992");
    expect(()=>decodeCursor(cursor,"free")).toThrow();
    expect(()=>decodeCursor("not-json","free")).toThrow();
  });
  it("preserves distinct non-Latin headlines while retaining Latin accent folding",()=>{
    const date=new Date("2026-08-01");
    expect(normalizeHeadline("Société Générale")).toBe("societe generale");
    expect(normalizeHeadline("公司發布業績")).toBe("公司發布業績");
    expect(contentHash("Рост выручки",date)).not.toBe(contentHash("Снижение прибыли",date));
    expect(contentHash("公司發布業績",date)).not.toBe(contentHash("銀行宣布新政策",date));
  });
  it("normalizes legal suffixes while preserving share classes and meaningful names",()=>{
    expect(normalizedCompanyName("Apple Inc.")).toBe(normalizedCompanyName("Apple Inc"));
    expect(normalizedCompanyName("Microsoft Corporation")).toBe(normalizedCompanyName("Microsoft Corp"));
    expect(normalizedCompanyName("ASML Holding N.V.")).toBe(normalizedCompanyName("ASML Holding NV"));
    expect(normalizedCompanyName("Example Class A")).not.toBe(normalizedCompanyName("Example Class C"));
    expect(normalizedCompanyName("Global Holdings PLC")).not.toBe(normalizedCompanyName("Global Mining PLC"));
  });
});
