import { query, queryOne } from "../db/pool.js";
import { coverageSummary, providerConfig, providerStatuses, V2Error } from "./store.js";
import { safePublicUrl } from "./security.js";
import type { ArticleRights, NewsArticle, NewsPage, NewsScope, ProviderId, SourceFilter } from "./types.js";

export interface ReadNewsOptions {scope:NewsScope;source:SourceFilter;companyIds:string[];topic?:string;q?:string;cursor?:string;limit:number}
const iso=(value:unknown):string|null=>value instanceof Date?value.toISOString():typeof value==="string"&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
type Row=Record<string,unknown>;
export function encodeCursor(timestamp:string,id:string,source:string):string { return Buffer.from(JSON.stringify({timestamp,id,source})).toString("base64url"); }
export function decodeCursor(value:string|undefined,source:string):{timestamp:string;id:string}|null {
  if (!value) return null;
  try { if(value.length>500)throw new Error(); const cursor:unknown=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
    if(!cursor||typeof cursor!=="object")throw new Error(); const data=cursor as Row;
    if(data.source!==source||typeof data.id!=="string"||!/^([a-f0-9-]{36}|legacy:\d{1,18})$/.test(data.id)||!iso(data.timestamp))throw new Error();
    return {timestamp:iso(data.timestamp)!,id:data.id};
  }catch{throw new V2Error("Invalid feed cursor.");}
}
function v2Article(row:Row,fullTextEnabled:boolean,free:boolean):NewsArticle {
  const stored=(row.rights ?? {}) as Partial<ArticleRights>;
  const bodyAllowed=stored.bodyAllowed===true&&(free||fullTextEnabled);
  const body=bodyAllowed&&typeof row.body==="string"?row.body:null;
  const summary=typeof row.summary==="string"?row.summary:null;
  return {id:String(row.id),headline:String(row.headline),summary,body,bodyFormat:body?"text":null,contentMode:body?"full_text":summary?"summary":"link_only",
    source:{id:String(row.provider_id),name:String(row.publisher),url:safePublicUrl(row.publisher_url),kind:free?"official":row.provider_id==="benzinga"?"wire":"aggregator"},
    url:String(row.url),imageUrl:stored.imageAllowed?safePublicUrl(row.image_url):null,publishedAt:iso(row.published_at)!,updatedAt:iso(row.updated_at),receivedAt:iso(row.received_at)!,
    language:typeof row.language==="string"?row.language:null,topics:Array.isArray(row.topics)?row.topics as string[]:[],genre:typeof row.genre==="string"?row.genre:null,
    companies:(row.companies ?? []) as NewsArticle["companies"],rights:{bodyAllowed,imageAllowed:stored.imageAllowed===true,attribution:stored.attribution ?? String(row.publisher),licenseStatus:stored.licenseStatus ?? "unknown"},
    revision:Number(row.revision),correction:row.correction===true,deleted:row.deleted===true};
}
function legacyArticle(row:Row):NewsArticle {
  return {id:`legacy:${row.id}`,headline:String(row.headline),summary:typeof row.summary==="string"?row.summary:null,body:null,bodyFormat:null,contentMode:row.summary?"summary":"link_only",
    source:{id:"archive",name:typeof row.source==="string"?row.source:"V1 archive",url:null,kind:"archive"},url:String(row.url),imageUrl:null,
    publishedAt:iso(row.published_at)!,updatedAt:null,receivedAt:iso(row.first_seen_at)!,language:typeof row.language==="string"?row.language:null,topics:[],genre:row.is_market_wide?"macro":null,
    companies:(row.companies ?? []) as NewsArticle["companies"],rights:{bodyAllowed:false,imageAllowed:false,attribution:"V1 archived provider summary; article-body and image display rights have not been established.",licenseStatus:"unknown"},revision:1,correction:false,deleted:false};
}
const V2_COMPANIES=`COALESCE((SELECT json_agg(json_build_object('id',c.id::text,'name',c.company_name,'ticker',c.ticker_raw) ORDER BY c.id) FROM news_v2_article_companies ac JOIN companies c ON c.id=ac.company_id WHERE ac.article_id=a.id AND c.is_active),'[]'::json) AS companies`;
const LEGACY_COMPANIES=`COALESCE((SELECT json_agg(json_build_object('id',c.id::text,'name',c.company_name,'ticker',c.ticker_raw) ORDER BY c.id) FROM article_companies ac JOIN companies c ON c.id=ac.company_id WHERE ac.article_id=a.id AND c.is_active),'[]'::json) AS companies`;

export async function readNews(options:ReadNewsOptions):Promise<NewsPage> {
  const meta={scope:options.scope,source:options.source,generatedAt:new Date().toISOString(),coverage:await coverageSummary()};
  if((options.scope==="company"||options.scope==="portfolio")&&!options.companyIds.length)return {data:[],pagination:{nextCursor:null,hasMore:false},meta};
  const archived=options.source==="archive";
  const cursor=decodeCursor(options.cursor,options.source);
  const params:unknown[]=[]; const bind=(value:unknown)=>{params.push(value);return `$${params.length}`;};
  const where:string[]=[];
  const statuses=archived?[]:await providerStatuses();
  if(!archived){
    const allowed=statuses.filter(p=>p.enabled&&p.configured&&p.displayLicensed&&(options.source==="all"||(options.source==="free"?p.free:p.id===options.source))).map(p=>p.id);
    if(!allowed.length)return {data:[],pagination:{nextCursor:null,hasMore:false},meta};
    where.push(`NOT a.deleted AND a.provider_id=ANY(${bind(allowed)}::text[])`);
  }
  if(options.scope==="company"||options.scope==="portfolio")where.push(`EXISTS(SELECT 1 FROM ${archived?"article_companies":"news_v2_article_companies"} ac WHERE ac.article_id=a.id AND ac.company_id=ANY(${bind(options.companyIds)}::bigint[]))`);
  if(options.scope==="macro")where.push(archived?"a.is_market_wide":"(a.provider_id IN ('fed','ecb') OR a.genre='macro' OR a.topics && ARRAY['monetary-policy','inflation']::text[])");
  if(options.topic){if(archived)return {data:[],pagination:{nextCursor:null,hasMore:false},meta};where.push(`${bind(options.topic)}=ANY(a.topics)`);}
  if(options.q)where.push(`(a.headline ILIKE ${bind(`%${options.q}%`)} OR a.summary ILIKE $${params.length})`);
  const idExpression=archived?"('legacy:' || a.id::text)":"a.id::text";
  if(cursor)where.push(`(a.published_at,${idExpression})<(${bind(cursor.timestamp)}::timestamptz,${bind(cursor.id)}::text)`);
  const rows=await query(`SELECT a.*,${archived?LEGACY_COMPANIES:V2_COMPANIES} FROM ${archived?"articles":"news_v2_articles"} a WHERE ${where.length?where.join(" AND "):"TRUE"} ORDER BY a.published_at DESC,${idExpression} DESC LIMIT ${bind(options.limit+1)}`,params);
  const hasMore=rows.length>options.limit;
  const data=rows.slice(0,options.limit).map(row=>{
    const article=archived?legacyArticle(row):v2Article(row,statuses.find(p=>p.id===row.provider_id)?.fullTextEnabled ?? false,statuses.find(p=>p.id===row.provider_id)?.free ?? false);
    // Full text is fetched through the article reader, not repeated on every feed refresh.
    return {...article,body:null,bodyFormat:null};
  });
  const last=data.at(-1);
  return {data,pagination:{hasMore,nextCursor:hasMore&&last?encodeCursor(last.publishedAt,last.id,options.source):null},meta};
}
export async function readArticle(id:string):Promise<NewsArticle|null> {
  if(/^legacy:\d{1,18}$/.test(id)){
    const row=await queryOne(`SELECT a.*,${LEGACY_COMPANIES} FROM articles a WHERE a.id=$1`,[id.slice(7)]);
    return row?legacyArticle(row):null;
  }
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new V2Error("Invalid article identifier.");
  const row=await queryOne(`SELECT a.*,${V2_COMPANIES} FROM news_v2_articles a WHERE a.id=$1`,[id]);
  if(!row)return null;
  const config=await providerConfig(row.provider_id as ProviderId);
  if(!config.enabled||!config.configured||!config.displayLicensed)return null;
  if(row.deleted){row.body=null;row.summary=null;row.image_url=null;row.headline="This source article was withdrawn.";}
  return v2Article(row,config.fullTextEnabled,config.definition.free);
}
