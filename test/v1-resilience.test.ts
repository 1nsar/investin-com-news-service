import { afterEach, describe, expect, it, vi } from "vitest";
import { Semaphore, sleep, withTimeout } from "../src/util/async.js";
import { RateLimiter } from "../src/util/rateLimiter.js";
import { request } from "../src/util/http.js";
import { MarketauxProvider } from "../src/providers/marketaux.js";
import { startScheduler, stopScheduler } from "../src/ingest/scheduler.js";
import { runIngestExclusive } from "../src/ingest/runner.js";
import type { FetchableCompany } from "../src/providers/types.js";

vi.mock("../src/config/index.js",()=>({config:{MARKETAUX_API_KEY:"synthetic-key",MARKETAUX_RATE_LIMIT_PER_MIN:60,MARKETAUX_PAGE_SIZE:50,MARKETAUX_LANGUAGES:"en",INGEST_MAX_RETRIES:0,SCHEDULER_CRON:"* * * * *"}}));
vi.mock("../src/ingest/runner.js",()=>({runIngestExclusive:vi.fn().mockResolvedValue({})}));
vi.mock("../src/util/logger.js",()=>({logger:{info:vi.fn(),warn:vi.fn(),debug:vi.fn(),error:vi.fn()}}));
afterEach(()=>{stopScheduler();vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();});

const company:FetchableCompany={id:1,ticker:"EXM",companyName:"Example Corp",country:"US",listings:[{id:1,exchangeCode:"US",mic:"XNAS",symbol:"EXM",symbolFormat:"us",securityKind:"ordinary",country:"US",isUs:true,isPrimary:true,confidence:1}]};
const row=(id:number)=>({uuid:`test-${id}`,title:`Example release ${id}`,published_at:"2026-08-01T10:00:00Z",url:`https://publisher.example/${id}`,entities:[{symbol:"EXM"}]});
describe("V1 bounded collection",()=>{
  it("exhausts actual Marketaux plan pages rather than trusting requested page size",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({meta:{found:4,returned:3,limit:3,page:1},data:[1,2,3].map(row)})))
      .mockResolvedValueOnce(new Response(JSON.stringify({meta:{found:4,returned:1,limit:3,page:2},data:[row(4)]})));
    vi.stubGlobal("fetch",fetch);
    const result=await new MarketauxProvider().fetch({company,from:new Date("2026-07-01"),to:new Date("2026-09-01")});
    expect(result).toMatchObject({kind:"ok",complete:true});
    if(result.kind==="ok")expect(result.articles).toHaveLength(4);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get("page")).toBe("2");
  });
  it("marks a capped busy window incomplete so ingest retains the previous watermark",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async(url:string)=>{
      const page=Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify({meta:{found:30,returned:3,limit:3,page},data:[1,2,3].map(n=>row(page*3+n))}));
    }));
    const result=await new MarketauxProvider().fetch({company,from:new Date("2026-07-01"),to:new Date("2026-09-01")});
    expect(result).toMatchObject({kind:"ok",complete:false});
    if(result.kind==="ok")expect(result.articles).toHaveLength(9);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("lets the exclusive runner own the scheduler lock",async()=>{
    vi.useFakeTimers();startScheduler();await vi.advanceTimersByTimeAsync(60_000);
    expect(runIngestExclusive).toHaveBeenCalledTimes(1);
    expect(runIngestExclusive).toHaveBeenCalledWith({trigger:"schedule"});
  });
});
describe("Cancellation and shared concurrency",()=>{
  it("caps all callers through the same semaphore and cancels queued work",async()=>{
    const semaphore=new Semaphore(2);let active=0;let maximum=0;
    await Promise.all(Array.from({length:10},async()=>{const release=await semaphore.acquire();active++;maximum=Math.max(maximum,active);await sleep(3);active--;release();}));
    expect(maximum).toBe(2);
    const one=await semaphore.acquire(),two=await semaphore.acquire(),controller=new AbortController();
    const queued=semaphore.acquire(controller.signal);controller.abort();await expect(queued).rejects.toThrow();one();two();
    const release=await semaphore.acquire();release();
  });
  it("propagates timeout cancellation to a fetch and avoids its configured retries",async()=>{
    const controller=new AbortController();let aborted=false;
    const fetch=vi.fn().mockImplementation((_url:string,options:{signal:AbortSignal})=>new Promise((_resolve,reject)=>{
      options.signal.addEventListener("abort",()=>{aborted=true;reject(new Error("cancelled"));},{once:true});
    }));vi.stubGlobal("fetch",fetch);
    const operation=request("https://publisher.example/slow",{signal:controller.signal,maxRetries:4});
    await expect(withTimeout(operation,10,"fixture",()=>controller.abort())).rejects.toThrow();
    expect(aborted).toBe(true);expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cancels a shared rate-limit pause before attempting HTTP",async()=>{
    const limiter=new RateLimiter("test",1);limiter.pauseFor(60_000);
    const controller=new AbortController();const waiting=limiter.acquire(controller.signal);controller.abort();
    await expect(waiting).rejects.toThrow();
  });
});
