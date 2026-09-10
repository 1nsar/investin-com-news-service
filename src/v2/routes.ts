import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminAuthorized, adminConfigured, encryptionKey } from "./security.js";
import { companyDirectory, coverageSummary, definitionFor, deleteProvider, providerStatuses, recentJobs, resolveCompany, updateProvider, V2Error } from "./store.js";
import { readArticle, readNews } from "./read.js";
import { enqueueJobs, workerEnabled } from "./worker.js";

const Provider=z.enum(["fed","ecb","sec","benzinga","marketaux","finnhub"]);
const Hint=z.object({ticker:z.string().trim().min(1).max(80).optional(),exchange:z.string().trim().max(80).optional(),country:z.string().trim().max(3).optional(),name:z.string().trim().max(300).optional(),externalId:z.string().trim().max(150).optional()}).strict();
const FeedQuery=z.object({scope:z.enum(["all","portfolio","company","macro"]).default("all"),source:z.enum(["free","all","archive","fed","ecb","sec","benzinga","marketaux","finnhub"]).default("free"),companyIds:z.string().max(4000).default(""),topic:z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),q:z.string().trim().max(200).optional(),cursor:z.string().max(500).optional(),limit:z.coerce.number().int().min(1).max(100).default(30)});
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>{const result=schema.safeParse(value);if(!result.success)throw new V2Error("Invalid request fields.");return result.data as z.output<S>;}

export async function v2Routes(app:FastifyInstance):Promise<void>{
  app.addHook("onRequest",async(request,reply)=>{
    reply.header("Cache-Control","no-store");
    if(!adminConfigured())return reply.code(503).send({error:"V2 workspace access is not configured."});
    if(!adminAuthorized(request.headers.authorization))return reply.code(401).send({error:"Authorized workspace access is required."});
  });
  app.setErrorHandler((error:unknown,_request,reply)=>reply.code(error instanceof V2Error?error.status:500).send({error:error instanceof V2Error?error.message:"V2 news is temporarily unavailable."}));
  app.get("/v2/news",async request=>{
    const input=parse(FeedQuery,request.query);
    const companyIds=input.companyIds?input.companyIds.split(","):[];
    if(companyIds.length>200||companyIds.some(id=>!/^\d{1,18}$/.test(id)))throw new V2Error("Company identifiers must be a bounded comma-separated list of numeric IDs.");
    return readNews({...input,companyIds:[...new Set(companyIds)]});
  });
  app.get("/v2/articles/:id",async(request,reply)=>{
    const {id}=request.params as {id:string};const data=await readArticle(id);
    return data?{data}:reply.code(404).send({error:"Article is not available."});
  });
  app.get("/v2/companies",async request=>{const input=parse(z.object({q:z.string().trim().max(200).default(""),cursor:z.string().max(30).optional(),limit:z.coerce.number().int().min(1).max(100).default(30)}),request.query);return companyDirectory(input.q,input.cursor ?? null,input.limit);});
  app.post("/v2/resolve-companies",async request=>{const input=parse(z.object({companies:z.array(Hint).max(200)}).strict(),request.body);const data=[];for(const hint of input.companies)data.push(await resolveCompany(hint));return {data};});
  app.get("/v2/providers",async()=>({data:await providerStatuses(),adminConfigured:adminConfigured(),encryptionConfigured:Boolean(encryptionKey())}));
  app.get("/v2/status",async()=>({version:"2",workerEnabled:workerEnabled(),adminConfigured:adminConfigured(),encryptionConfigured:Boolean(encryptionKey()),coverage:await coverageSummary(),providers:await providerStatuses(),jobs:await recentJobs(),limitations:["Official feeds do not provide comprehensive company coverage.","A configured API key is not proof of a data licence.","Per-source jobs are bounded and resume incomplete windows; quotas can delay freshness.","This preview uses PostgreSQL jobs and basic text filtering; 50,000-company readiness requires workload benchmarks and contracted source coverage."]}));
  app.post("/v2/sync",async(request,reply)=>{const input=parse(z.object({providerIds:z.array(Provider).min(1).max(6).optional()}).strict(),request.body ?? {});const ids=input.providerIds ?? (await providerStatuses()).filter(p=>p.enabled&&p.configured&&p.displayLicensed).map(p=>p.id);return reply.code(202).send({data:await enqueueJobs(ids),workerEnabled:workerEnabled()});});
  app.put("/v2/providers/:id",async request=>{const id=parse(Provider,(request.params as {id:string}).id);const input=parse(z.object({enabled:z.boolean().optional(),displayLicensed:z.boolean().optional(),fullTextEnabled:z.boolean().optional(),credentials:z.record(z.string().min(1).max(80),z.string().max(4000)).refine(v=>Object.keys(v).length<=10).optional()}).strict(),request.body);await updateProvider(id,input);return {data:(await providerStatuses()).find(p=>p.id===id)};});
  app.delete("/v2/providers/:id",async request=>{const id=parse(Provider,(request.params as {id:string}).id);definitionFor(id);await deleteProvider(id);return {data:(await providerStatuses()).find(p=>p.id===id)};});
}
