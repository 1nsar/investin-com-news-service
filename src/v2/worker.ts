import { randomUUID } from "node:crypto";
import { isVercelRuntime } from "../config/runtime.js";
import { query, queryOne, transaction } from "../db/pool.js";
import { logger } from "../util/logger.js";
import { fetchProviderBatch } from "./providers/index.js";
import { ProviderFetchError } from "./providers/http.js";
import { dailyLimit, jobFromRow, persistArticles, positiveEnv, providerConfig, providerSettingsChanged, providerStatuses, sameCredentials, V2Error } from "./store.js";
import type { ProviderDefinition, ProviderId, SyncJob } from "./types.js";

export function workerEnabled():boolean{return !isVercelRuntime()&&process.env.NEWS_V2_WORKER_ENABLED==="true";}
const owner=randomUUID();
let timer:ReturnType<typeof setInterval>|undefined;
let active:Promise<void>|null=null;
let controller:AbortController|null=null;
let stopping=false;
let activeProvider:ProviderId|null=null;
providerSettingsChanged.on("change",(id:ProviderId)=>{if(id===activeProvider)controller?.abort();});

export async function enqueueJobs(ids:ProviderId[]):Promise<SyncJob[]> {
  const jobs:SyncJob[]=[];
  for(const id of [...new Set(ids)]){
    const config=await providerConfig(id);
    if(!config.enabled||!config.configured||!config.displayLicensed)throw new V2Error(`Enable and configure ${config.definition.name} before fetching.`);
    const row=await queryOne(`INSERT INTO news_v2_jobs(id,provider_id,checkpoint)
      VALUES($1,$2,COALESCE((SELECT CASE WHEN status IN ('partial','failed') THEN checkpoint ELSE NULL END FROM news_v2_jobs WHERE provider_id=$2 ORDER BY created_at DESC LIMIT 1),(SELECT checkpoint FROM news_v2_provider_state WHERE provider_id=$2)))
      ON CONFLICT(provider_id) WHERE status IN ('queued','running') DO UPDATE SET provider_id=EXCLUDED.provider_id RETURNING *`,[randomUUID(),id]);
    if(row)jobs.push(jobFromRow(row));
  }
  if(workerEnabled())kickWorker();
  return jobs;
}

/** Shared PostgreSQL budget: every adapter HTTP call reserves one real request. */
async function acquireRequest(definition:ProviderDefinition,signal:AbortSignal,expected:Awaited<ReturnType<typeof providerConfig>>):Promise<void>{
  while(true){
    signal.throwIfAborted();
    const wait=await transaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(73102,hashtext($1))",[definition.id]);
      const current=await providerConfig(definition.id,client);
      if(!current.enabled||!current.configured||!current.displayLicensed||!sameCredentials(current.credentials,expected.credentials)||current.fullTextEnabled!==expected.fullTextEnabled)throw new V2Error("Provider settings changed; remaining HTTP requests were cancelled.");
      await client.query("INSERT INTO news_v2_provider_state(provider_id) VALUES($1) ON CONFLICT DO NOTHING",[definition.id]);
      const row=(await client.query<{requests_today:number;today:boolean;wait_ms:number}>(`SELECT requests_today,budget_day=(now() AT TIME ZONE 'UTC')::date AS today,GREATEST(0,EXTRACT(EPOCH FROM (next_request_at-now()))*1000)::float AS wait_ms FROM news_v2_provider_state WHERE provider_id=$1 FOR UPDATE`,[definition.id])).rows[0]!;
      const used=row.today?row.requests_today:0;
      if(used>=dailyLimit(definition))throw new V2Error("Daily request budget exhausted; source freshness is paused until the next UTC day.",429);
      if(row.wait_ms>0)return Math.min(row.wait_ms,5000);
      const interval=Math.ceil(60_000/Math.max(1,definition.requestsPerMinute));
      await client.query(`UPDATE news_v2_provider_state SET budget_day=(now() AT TIME ZONE 'UTC')::date,requests_today=$2,next_request_at=now()+($3::text||' milliseconds')::interval WHERE provider_id=$1`,[definition.id,used+1,interval]);
      return 0;
    });
    if(wait===0)return;
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{clearTimeout(timeout);reject(new Error("Request aborted."));};
      const timeout=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},wait);
      signal.addEventListener("abort",abort,{once:true});
      if(signal.aborted)abort();
    });
  }
}

async function enqueueDue():Promise<void>{
  const statuses=await providerStatuses();
  for(const source of statuses){
    if(!source.enabled||!source.configured||!source.displayLicensed||source.budget.exhausted||source.lastError?.startsWith("[auth]"))continue;
    const minutes=positiveEnv(source.free?"NEWS_V2_FREE_REFRESH_MINUTES":"NEWS_V2_PAID_REFRESH_MINUTES",source.free?15:5,1440);
    if(source.lastAttemptAt&&Date.now()-Date.parse(source.lastAttemptAt)<minutes*60_000)continue;
    await enqueueJobs([source.id]);
  }
}

async function runNext():Promise<void>{
  const row=await transaction(async client=>{
    // Reclaim expired leases without discarding their persisted resume cursor.
    await client.query("UPDATE news_v2_jobs SET status='queued',lease_owner=NULL,lease_until=NULL WHERE status='running' AND lease_until<now()");
    const selected=(await client.query("SELECT * FROM news_v2_jobs WHERE status='queued' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if(!selected)return null;
    return (await client.query("UPDATE news_v2_jobs SET status='running',started_at=COALESCE(started_at,now()),lease_owner=$2,lease_until=now()+interval '180 seconds' WHERE id=$1 RETURNING *",[selected.id,owner])).rows[0];
  });
  if(!row)return;
  const providerId=row.provider_id as ProviderId;
  const abort=new AbortController();controller=abort;activeProvider=providerId;
  const timeout=setTimeout(()=>abort.abort(),120_000);
  const heartbeat=setInterval(()=>{void query("UPDATE news_v2_jobs SET lease_until=now()+interval '180 seconds' WHERE id=$1 AND lease_owner=$2 AND status='running'",[row.id,owner]).catch(()=>abort.abort());},30_000);
  try{
    const config=await providerConfig(providerId);
    if(!config.enabled||!config.configured||!config.displayLicensed)throw new V2Error("Provider is no longer enabled for this workspace.");
    await query(`INSERT INTO news_v2_provider_state(provider_id,last_attempt_at) VALUES($1,now()) ON CONFLICT(provider_id) DO UPDATE SET last_attempt_at=now()`,[providerId]);
    const batch=await fetchProviderBatch({providerId,credentials:config.credentials,checkpoint:typeof row.checkpoint==="string"?row.checkpoint:null,signal:abort.signal,limit:50,fullTextEnabled:config.fullTextEnabled,acquireRequest:()=>acquireRequest(config.definition,abort.signal,config)});
    abort.signal.throwIfAborted();
    if(!Array.isArray(batch.items)||batch.items.length>200||typeof batch.complete!=="boolean"||(batch.nextCheckpoint!==null&&typeof batch.nextCheckpoint!=="string")||(batch.nextCheckpoint?.length ?? 0)>100_000)throw new V2Error("Provider returned an invalid bounded batch.",502);
    if(!batch.complete&&!batch.nextCheckpoint)throw new V2Error("Incomplete provider window has no resume cursor.",502);
    await transaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(73102,hashtext($1))",[providerId]);
      const current=(await client.query("SELECT * FROM news_v2_jobs WHERE id=$1 AND lease_owner=$2 AND status='running' FOR UPDATE",[row.id,owner])).rows[0];
      if(!current)throw new V2Error("Job lease was lost.",409);
      const latest=await providerConfig(providerId,client);
      if(!latest.enabled||!latest.configured||!latest.displayLicensed||!sameCredentials(latest.credentials,config.credentials))throw new V2Error("Provider settings changed while the batch was running.");
      const stored=await persistArticles(client,config.definition,batch.items,latest.fullTextEnabled);
      const pages=Number(current.pages)+1;
      const status=batch.complete?"succeeded":pages>=positiveEnv("NEWS_V2_MAX_PAGES_PER_JOB",3,20)?"partial":"queued";
      await client.query(`UPDATE news_v2_jobs SET status=$2,pages=$3,articles_seen=articles_seen+$4,articles_stored=articles_stored+$5,checkpoint=$6,lease_owner=NULL,lease_until=NULL,available_at=now()+interval '1 second',finished_at=CASE WHEN $2 IN ('succeeded','partial') THEN now() ELSE NULL END,error=$7 WHERE id=$1`,[row.id,status,pages,batch.items.length,stored,batch.nextCheckpoint,batch.notices?.length?batch.notices.map(n=>String(n).slice(0,300)).join(" ").slice(0,1000):null]);
      if(batch.complete)await client.query("UPDATE news_v2_provider_state SET checkpoint=$2,last_success_at=now(),last_error=NULL WHERE provider_id=$1",[providerId,batch.nextCheckpoint]);
      else await client.query("UPDATE news_v2_provider_state SET last_error='Window incomplete; saved resume cursor, stable watermark unchanged.' WHERE provider_id=$1",[providerId]);
    });
  }catch(error){
    // No provider URLs, credentials or raw response bodies enter the public job log.
    const reason=error instanceof V2Error?error.message:error instanceof ProviderFetchError?`[${error.code}] ${error.message.slice(0,300)}${error.code==="auth"?"; automatic retries paused until settings are saved or Fetch latest is requested.":""}`:abort.signal.aborted?"Provider request timed out or was cancelled.":"Provider fetch failed; check credentials, permissions and upstream availability.";
    const failed=await query("UPDATE news_v2_jobs SET status='failed',error=$3,finished_at=now(),lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2 RETURNING id",[row.id,owner,reason]).catch(()=>[]);
    if(failed.length)await query("UPDATE news_v2_provider_state SET last_error=$2 WHERE provider_id=$1",[providerId,reason]).catch(()=>undefined);
    if(failed.length&&error instanceof ProviderFetchError && error.code==="rate_limited")await query("UPDATE news_v2_provider_state SET next_request_at=GREATEST(next_request_at,now()+($2::text||' seconds')::interval) WHERE provider_id=$1",[providerId,error.retryAfterSeconds ?? 900]).catch(()=>undefined);
  }finally{clearTimeout(timeout);clearInterval(heartbeat);controller=null;activeProvider=null;}
}

function kickWorker():void{
  if(active||stopping||!workerEnabled())return;
  active=(async()=>{await enqueueDue();await runNext();})().catch(()=>logger.warn("V2 worker could not access its queue; it will retry on its next tick.")).finally(()=>{active=null;});
}
export function startV2Worker():void{
  if(timer||!workerEnabled())return;
  stopping=false;timer=setInterval(kickWorker,positiveEnv("NEWS_V2_WORKER_INTERVAL_MS",5000,60_000));timer.unref();kickWorker();
}
export async function stopV2Worker():Promise<void>{stopping=true;clearInterval(timer);timer=undefined;controller?.abort();await active;}
