import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { PoolClient } from "pg";
import { query, queryOne, transaction } from "../db/pool.js";
import { listProviderDefinitions } from "./providers/index.js";
import { decryptCredentials, encryptCredentials, safePublicUrl } from "./security.js";
import type { ArticleRights, CompanyDirectoryEntry, CompanyHint, CompanyResolution, CoverageSummary, ProviderArticle, ProviderCredentials, ProviderDefinition, ProviderId, ProviderStatus, SyncJob, UpdateProviderRequest } from "./types.js";

export class V2Error extends Error { constructor(message: string, public status = 400) { super(message); } }
export const providerSettingsChanged = new EventEmitter();
export const sameCredentials = (left: ProviderCredentials, right: ProviderCredentials): boolean => JSON.stringify(Object.entries(left).sort())===JSON.stringify(Object.entries(right).sort());
const date = (value: unknown): string | null => value instanceof Date ? value.toISOString() : typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export const positiveEnv = (name: string, fallback: number, max: number): number => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
};
export const dailyLimit = (definition: ProviderDefinition): number => positiveEnv(definition.free ? "NEWS_V2_FREE_DAILY_REQUEST_LIMIT" : "NEWS_V2_PAID_DAILY_REQUEST_LIMIT", definition.free ? 600 : 100, 100_000);
export function definitionFor(id: string): ProviderDefinition {
  const definition = listProviderDefinitions().find((item) => item.id === id);
  if (!definition) throw new V2Error("Unknown news provider.");
  return definition;
}
interface ConfigRow { provider_id: ProviderId; enabled: boolean; credentials_encrypted: string | null; full_text_enabled: boolean; display_licensed: boolean }
export async function providerConfig(id: ProviderId, client?: PoolClient): Promise<{ definition: ProviderDefinition; credentials: ProviderCredentials; enabled: boolean; configured: boolean; fullTextEnabled: boolean; displayLicensed: boolean }> {
  const definition = definitionFor(id);
  const row = await queryOne<ConfigRow>("SELECT * FROM news_v2_provider_configs WHERE provider_id=$1", [id], client);
  const credentials = decryptCredentials(row?.credentials_encrypted ?? null);
  const displayLicensed = definition.free || (row?.display_licensed ?? false);
  return { definition, credentials, enabled: row?.enabled ?? definition.free,
    configured: definition.credentialFields.every((field) => !field.required || Boolean(credentials[field.key]?.trim())),
    fullTextEnabled: row?.full_text_enabled ?? false, displayLicensed };
}
export async function updateProvider(id: ProviderId, input: UpdateProviderRequest): Promise<void> {
  const existing = await providerConfig(id);
  const allowed = new Set(existing.definition.credentialFields.map((field) => field.key));
  for (const [key, value] of Object.entries(input.credentials ?? {})) {
    if (!allowed.has(key) || typeof value !== "string" || value.length > 4000) throw new V2Error("Unsupported provider credential field.");
  }
  const credentials = { ...existing.credentials, ...input.credentials };
  for (const key of Object.keys(credentials)) if (!credentials[key]?.trim()) delete credentials[key];
  const enabled = input.enabled ?? existing.enabled;
  const licensed = existing.definition.free || (input.displayLicensed ?? existing.displayLicensed);
  const fullText = input.fullTextEnabled ?? existing.fullTextEnabled;
  if (enabled && !licensed) throw new V2Error("Confirm that your provider agreement permits workspace display before enabling this paid source.");
  if (fullText && !existing.definition.supportsFullText) throw new V2Error("This provider supplies summaries and links; full text is not supported.");
  if (enabled && existing.definition.credentialFields.some((field) => field.required && !credentials[field.key])) throw new V2Error("Complete the required provider fields before enabling it.");
  const encrypted = Object.keys(credentials).length ? encryptCredentials(credentials) : null;
  const credentialsChanged=!sameCredentials(existing.credentials,credentials);
  await transaction(async (client) => {
  await client.query("SELECT pg_advisory_xact_lock(73102,hashtext($1))",[id]);
  await client.query(`INSERT INTO news_v2_provider_configs(provider_id,enabled,credentials_encrypted,full_text_enabled,display_licensed)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider_id) DO UPDATE SET enabled=$2,credentials_encrypted=$3,full_text_enabled=$4,display_licensed=$5,updated_at=now()`, [id,enabled,encrypted,fullText,licensed]);
  await client.query("UPDATE news_v2_provider_state SET last_error=NULL WHERE provider_id=$1", [id]);
  if(credentialsChanged)await resetProviderScope(client,id);
  if(!existing.definition.free && (existing.credentials.apiKey!==credentials.apiKey || !licensed))await client.query("DELETE FROM news_v2_articles WHERE provider_id=$1",[id]);
  else if (!existing.definition.free && (!enabled || !fullText)) await purgeProviderBodies(client, id);
  });
  providerSettingsChanged.emit("change",id);
}
async function resetProviderScope(client:PoolClient,id:ProviderId):Promise<void>{
  await client.query("UPDATE news_v2_provider_state SET checkpoint=NULL,last_attempt_at=NULL,last_success_at=NULL,last_error=NULL WHERE provider_id=$1",[id]);
  await client.query(`UPDATE news_v2_jobs SET checkpoint=NULL,
    error=CASE WHEN status IN ('queued','running') THEN 'Provider settings changed; previous ingestion scope was reset.' ELSE error END,
    finished_at=CASE WHEN status IN ('queued','running') THEN now() ELSE finished_at END,
    status=CASE WHEN status IN ('queued','running') THEN 'failed' ELSE status END,lease_owner=NULL,lease_until=NULL WHERE provider_id=$1`,[id]);
}
/** Remove restricted text from both current rows and historical revisions. */
async function purgeProviderBodies(client: PoolClient, id: ProviderId): Promise<void> {
  await client.query(`UPDATE news_v2_articles SET body=NULL,rights=jsonb_set(rights,'{bodyAllowed}','false'::jsonb),content_hash='purged:'||content_hash WHERE provider_id=$1 AND body IS NOT NULL`,[id]);
  await client.query(`UPDATE news_v2_article_revisions r SET snapshot=jsonb_set(jsonb_set(r.snapshot,'{body}','null'::jsonb),'{rights,bodyAllowed}','false'::jsonb)
    FROM news_v2_articles a WHERE r.article_id=a.id AND a.provider_id=$1 AND r.snapshot->>'body' IS NOT NULL`,[id]);
}
export async function deleteProvider(id: ProviderId): Promise<void> {
  const definition=definitionFor(id);
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(73102,hashtext($1))",[id]);
    await client.query(`INSERT INTO news_v2_provider_configs(provider_id,enabled) VALUES($1,FALSE)
      ON CONFLICT(provider_id) DO UPDATE SET enabled=FALSE,credentials_encrypted=NULL,full_text_enabled=FALSE,display_licensed=FALSE,updated_at=now()`, [id]);
    await resetProviderScope(client,id);
    if(!definition.free)await client.query("DELETE FROM news_v2_articles WHERE provider_id=$1",[id]);
    else await purgeProviderBodies(client, id);
  });
  providerSettingsChanged.emit("change",id);
}
export async function providerStatuses(): Promise<ProviderStatus[]> {
  const rows = await query<{provider_id:string;last_success_at:Date|null;last_attempt_at:Date|null;last_error:string|null;requests_today:number;budget_day:string|null;next_request_at:Date|null}>("SELECT *,budget_day::text AS budget_day FROM news_v2_provider_state");
  const counts = await query<{provider_id:string;count:number}>("SELECT provider_id,count(*)::int AS count FROM news_v2_articles WHERE NOT deleted GROUP BY provider_id");
  const statuses: ProviderStatus[] = [];
  for (const definition of listProviderDefinitions()) {
    const state = rows.find((row) => row.provider_id === definition.id);
    let config: Awaited<ReturnType<typeof providerConfig>>;
    let configError: string | null = null;
    try { config = await providerConfig(definition.id); }
    catch { config = {definition,credentials:{},enabled:false,configured:false,fullTextEnabled:false,displayLicensed:false}; configError="Server cannot decrypt provider settings."; }
    const day = state?.budget_day;
    const requestsToday = day === new Date().toISOString().slice(0,10) ? Number(state?.requests_today ?? 0) : 0;
    statuses.push({...definition,enabled:config.enabled,configured:config.configured,credentialFieldsSet:Object.keys(config.credentials),fullTextEnabled:config.fullTextEnabled,displayLicensed:config.displayLicensed,
      lastSuccessAt:date(state?.last_success_at),lastAttemptAt:date(state?.last_attempt_at),lastError:configError ?? state?.last_error ?? null,
      articleCount:counts.find((row)=>row.provider_id===definition.id)?.count ?? 0,
      budget:{requestsToday,dailyLimit:dailyLimit(definition),exhausted:requestsToday>=dailyLimit(definition),nextRequestAt:date(state?.next_request_at)}});
  }
  return statuses;
}
export async function coverageSummary(): Promise<CoverageSummary> {
  const row = await queryOne<{active:number;covered:number;received:Date|null;success:Date|null}>(`SELECT
    (SELECT count(*)::int FROM companies WHERE is_active) AS active,
    (SELECT count(DISTINCT ac.company_id)::int FROM news_v2_article_companies ac JOIN news_v2_articles a ON a.id=ac.article_id JOIN companies c ON c.id=ac.company_id WHERE c.is_active AND NOT a.deleted) AS covered,
    (SELECT max(received_at) FROM news_v2_articles) AS received,
    (SELECT min(last_success_at) FROM news_v2_provider_state) AS success`);
  return {activeCompanies:row?.active ?? 0,companiesWithV2News:row?.covered ?? 0,lastReceivedAt:date(row?.received),oldestProviderSuccessAt:date(row?.success),note:"Stored coverage does not guarantee current news for every company. Official macro feeds are not company-wide coverage; consult each provider's success time and quota."};
}

const COMPANY_SELECT = `SELECT c.id::text AS id,c.company_name AS name,c.ticker_raw AS ticker,c.country_raw AS country,c.resolution_status AS "resolutionStatus",
 COALESCE((SELECT json_agg(json_build_object('symbol',l.symbol,'exchange',l.exchange_code,'mic',l.mic,'country',l.country,'isPrimary',l.is_primary) ORDER BY l.is_primary DESC,l.id) FROM listings l WHERE l.company_id=c.id),'[]'::json) AS listings FROM companies c`;
export async function companyDirectory(q: string, cursor: string | null, limit: number): Promise<{data:CompanyDirectoryEntry[];pagination:{nextCursor:string|null;hasMore:boolean}}> {
  if (cursor && !/^\d{1,18}$/.test(cursor)) throw new V2Error("Invalid company cursor.");
  const rows=await query<CompanyDirectoryEntry>(`${COMPANY_SELECT} WHERE c.is_active AND c.id>$1::bigint AND ($2='' OR c.company_name ILIKE $3 OR c.ticker_raw ILIKE $3) ORDER BY c.id LIMIT $4`,[cursor ?? "0",q,`%${q}%`,limit+1]);
  const hasMore=rows.length>limit; const data=rows.slice(0,limit);
  return {data,pagination:{hasMore,nextCursor:hasMore?data.at(-1)?.id ?? null:null}};
}
function exchangeKey(value:string|undefined):string { const clean=value?.trim().toUpperCase() ?? ""; return ({NASDAQ:"XNAS",NASDAQGS:"XNAS",NASDAQGM:"XNAS",NASDAQCM:"XNAS",NASD:"XNAS",NYSE:"XNYS",AMEX:"XASE",NYSEAMERICAN:"XASE",OTC:"OOTC",LSE:"XLON"} as Record<string,string>)[clean] ?? clean; }
export function normalizedCompanyName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\b([a-z])\.(?=[a-z](?:\.|\b))/g,"$1").replace(/[^\p{L}\p{N}]+/gu," ").trim()
    .replace(/\s+(?:incorporated|inc|corporation|corp|plc|limited|ltd)$/u,"").trim();
}
async function auditedCompanyAlias(hint:CompanyHint,ticker:string,exchange:string,country:string,name:string,client?:PoolClient):Promise<CompanyResolution|null>{
  // Every key is mandatory. An alias never supplies missing input evidence.
  if(!ticker||!exchange||!country||!name)return null;
  const alias=await queryOne<{company_id:string;issuer_name_normalized:string;requires_catalogue_listing:boolean;source_url:string;checked_at:string;valid_until:string;evidence_note:string}>(
    `SELECT company_id::text,issuer_name_normalized,requires_catalogue_listing,source_url,checked_at::text,valid_until::text,evidence_note
     FROM news_v2_company_aliases WHERE enabled AND alias_name_normalized=$1 AND ticker=upper($2) AND mic=$3 AND issuer_country=$4
     AND checked_at<=(now() AT TIME ZONE 'UTC')::date AND valid_until>(now() AT TIME ZONE 'UTC')::date`,[normalizedCompanyName(name),ticker,exchange,country],client);
  if(!alias)return null;
  const company=await queryOne<CompanyDirectoryEntry>(`${COMPANY_SELECT} WHERE c.is_active AND c.id=$1::bigint AND upper(c.country_raw)=$2 AND upper(c.ticker_raw)=upper($3)`,[alias.company_id,country,ticker],client);
  if(!company||normalizedCompanyName(company.name)!==alias.issuer_name_normalized)return null;
  if(alias.requires_catalogue_listing&&!company.listings.some(listing=>listing.symbol.toUpperCase()===ticker.toUpperCase()&&exchangeKey(listing.mic ?? listing.exchange)===exchange))return null;
  const conflicts=await query<{id:string;name:string;ticker:string}>(`SELECT DISTINCT c.id::text AS id,c.company_name AS name,c.ticker_raw AS ticker FROM listings l JOIN companies c ON c.id=l.company_id
    WHERE c.is_active AND upper(l.symbol)=upper($1) AND upper(l.mic)=$2 AND c.id<>$3::bigint`,[ticker,exchange,company.id],client);
  const differentIssuers=conflicts.filter(row=>normalizedCompanyName(row.name)!==alias.issuer_name_normalized);
  if(differentIssuers.length)return {input:hint,status:"ambiguous",company:null,candidates:[{id:company.id,name:company.name,ticker:company.ticker},...differentIssuers]};
  return {input:hint,status:"matched",company,candidates:[],evidence:{method:"audited_alias",sourceUrl:alias.source_url,checkedAt:alias.checked_at,validUntil:alias.valid_until,note:alias.evidence_note}};
}
export async function resolveCompany(hint: CompanyHint, client?: PoolClient): Promise<CompanyResolution> {
  const ticker=hint.ticker?.trim() ?? "", name=hint.name?.trim() ?? "", country=hint.country?.trim().toUpperCase() ?? "", exchange=exchangeKey(hint.exchange);
  if (!ticker && !name) return {input:hint,status:"unmatched",company:null,candidates:[]};
  const audited=await auditedCompanyAlias(hint,ticker,exchange,country,name,client);
  if(audited)return audited;
  const canNormalize=Boolean(ticker && exchange && country && name);
  const rows=await query<CompanyDirectoryEntry>(`${COMPANY_SELECT} WHERE c.is_active
    AND ($1='' OR upper(c.ticker_raw)=upper($1) OR EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND upper(l.symbol)=upper($1)))
    AND ($2='' OR lower(c.company_name)=lower($2) OR $5)
    AND ($3='' OR upper(c.country_raw)=$3)
    AND ($4='' OR EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND (upper(l.mic)=$4 OR upper(l.exchange_code)=$4) AND ($1='' OR upper(l.symbol)=upper($1)))) ORDER BY c.id LIMIT 6`,[ticker,name,country,exchange,canNormalize],client);
  const verified=rows.filter(row=>!name || row.name.toLowerCase()===name.toLowerCase() || (canNormalize && normalizedCompanyName(row.name)===normalizedCompanyName(name)));
  // A bare ticker alone is not sufficient identity evidence in a global catalogue.
  const grounded=Boolean(name || exchange || (country && ticker));
  const matched=verified.length===1 && grounded;
  return {input:hint,status:matched?"matched":verified.length?"ambiguous":"unmatched",company:matched?verified[0] ?? null:null,candidates:matched?[]:verified.map(({id,name,ticker})=>({id,name,ticker}))};
}

export function normalizeProviderArticle(input: ProviderArticle, definition: ProviderDefinition, fullTextEnabled: boolean): ProviderArticle {
  if (!input || typeof input.sourceId!=="string" || !input.sourceId || input.sourceId.length>500 || !["upsert","delete"].includes(input.action)) throw new V2Error("Invalid source article identity.");
  const url=safePublicUrl(input.url), published=date(input.publishedAt), updated=date(input.updatedAt);
  if (!url || !published || Date.parse(published)>Date.now()+300_000 || typeof input.headline!=="string" || !input.headline.trim()) throw new V2Error("Invalid source article metadata.");
  const supplied=input.rights;
  if (!supplied || typeof supplied.bodyAllowed!=="boolean" || typeof supplied.imageAllowed!=="boolean" || typeof supplied.attribution!=="string" || !["public_source","licensed","summary_only","unknown"].includes(supplied.licenseStatus)) throw new V2Error("Missing article usage metadata.");
  const bodyAllowed=supplied.bodyAllowed && (definition.free || (definition.supportsFullText && fullTextEnabled)) && !(typeof input.body==="string"&&input.body.length>500_000);
  const rights:ArticleRights={bodyAllowed,imageAllowed:supplied.imageAllowed,attribution:supplied.attribution.slice(0,1000),licenseStatus:supplied.licenseStatus};
  return {...input,sourceId:input.sourceId.trim(),url,headline:input.headline.trim().slice(0,2000),summary:input.summary?.slice(0,20_000) ?? null,
    body:bodyAllowed && typeof input.body==="string" ? input.body.slice(0,500_000):null,publisher:input.publisher?.trim().slice(0,300) || definition.name,publisherUrl:safePublicUrl(input.publisherUrl),
    publishedAt:published,updatedAt:updated,receivedAt:new Date().toISOString(),imageUrl:rights.imageAllowed?safePublicUrl(input.imageUrl):null,
    topics:[...new Set((input.topics ?? []).filter((item)=>typeof item==="string" && /^[a-z0-9-]{1,60}$/.test(item)))].slice(0,20),
    companies:(input.companies ?? []).slice(0,100),language:input.language?.slice(0,20) ?? null,genre:input.genre?.slice(0,80) ?? null,rights};
}

export async function persistArticles(client:PoolClient, definition:ProviderDefinition, items:ProviderArticle[], fullTextEnabled:boolean):Promise<number> {
  let stored=0;
  for (const raw of items.slice(0,200)) {
    let item=normalizeProviderArticle(raw,definition,fullTextEnabled);
    if(item.action==="delete"){
      const prior=(await client.query<{published_at:Date;url:string}>("SELECT published_at,url FROM news_v2_articles WHERE provider_id=$1 AND provider_article_id=$2",[definition.id,item.sourceId])).rows[0];
      item={...item,headline:"This source article was withdrawn.",summary:null,body:null,imageUrl:null,publishedAt:prior?.published_at.toISOString() ?? item.publishedAt,url:prior?.url ?? item.url,rights:{...item.rights,bodyAllowed:false,imageAllowed:false}};
    }
    const hash=createHash("sha256").update(JSON.stringify({...item,receivedAt:undefined})).digest("hex");
    const previous=(await client.query<{id:string;content_hash:string;updated_at:Date|null}>("SELECT id,content_hash,updated_at FROM news_v2_articles WHERE provider_id=$1 AND provider_article_id=$2 FOR UPDATE",[definition.id,item.sourceId])).rows[0];
    if (previous?.content_hash===hash) continue;
    if (previous?.updated_at && item.updatedAt && Date.parse(item.updatedAt)<previous.updated_at.getTime()) continue;
    const id=previous?.id ?? randomUUID();
    const row=(await client.query<{revision:number}>(`INSERT INTO news_v2_articles(id,provider_id,provider_article_id,headline,summary,body,publisher,publisher_url,url,image_url,published_at,updated_at,received_at,language,topics,genre,rights,content_hash,correction,deleted,entity_evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT(provider_id,provider_article_id) DO UPDATE SET headline=EXCLUDED.headline,summary=EXCLUDED.summary,body=EXCLUDED.body,publisher=EXCLUDED.publisher,publisher_url=EXCLUDED.publisher_url,url=EXCLUDED.url,image_url=EXCLUDED.image_url,published_at=EXCLUDED.published_at,updated_at=EXCLUDED.updated_at,received_at=now(),language=EXCLUDED.language,topics=EXCLUDED.topics,genre=EXCLUDED.genre,rights=EXCLUDED.rights,content_hash=EXCLUDED.content_hash,revision=news_v2_articles.revision+1,correction=EXCLUDED.correction,deleted=EXCLUDED.deleted,entity_evidence=EXCLUDED.entity_evidence RETURNING revision`,
      [id,definition.id,item.sourceId,item.headline,item.summary,item.body,item.publisher,item.publisherUrl,item.url,item.imageUrl,item.publishedAt,item.updatedAt,item.language,item.topics,item.genre,JSON.stringify(item.rights),hash,Boolean(item.correction),item.action==="delete",JSON.stringify(item.companies ?? [])])).rows[0];
    await client.query("INSERT INTO news_v2_article_revisions(article_id,revision,action,snapshot) VALUES($1,$2,$3,$4)",[id,row?.revision ?? 1,item.action,JSON.stringify(item)]);
    if(item.action==="delete")await client.query(`UPDATE news_v2_article_revisions SET snapshot=jsonb_set(jsonb_set(jsonb_set(jsonb_set(snapshot,'{body}','null'::jsonb),'{summary}','null'::jsonb),'{imageUrl}','null'::jsonb),'{rights,bodyAllowed}','false'::jsonb) WHERE article_id=$1`,[id]);
    await client.query("DELETE FROM news_v2_article_companies WHERE article_id=$1",[id]);
    if (item.action!=="delete") for (const hint of item.companies ?? []) {
      const match=await resolveCompany(hint,client);
      if (match.company) await client.query("INSERT INTO news_v2_article_companies(article_id,company_id,evidence) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[id,match.company.id,JSON.stringify(match.evidence?{...hint,resolution:match.evidence}:hint)]);
    }
    stored++;
  }
  return stored;
}

export function jobFromRow(row:Record<string,unknown>):SyncJob { return {id:String(row.id),providerId:row.provider_id as ProviderId,status:row.status as SyncJob["status"],createdAt:date(row.created_at)!,startedAt:date(row.started_at),finishedAt:date(row.finished_at),pages:Number(row.pages),articlesSeen:Number(row.articles_seen),articlesStored:Number(row.articles_stored),error:typeof row.error==="string"?row.error:null}; }
export async function recentJobs():Promise<SyncJob[]> { return (await query("SELECT * FROM news_v2_jobs ORDER BY created_at DESC LIMIT 20")).map(jobFromRow); }
