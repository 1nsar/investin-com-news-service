import { sleep } from "./async.js";

/** Token bucket, one per provider. Providers publish a per-minute budget and
 *  every outbound call takes a token first, so concurrency inside the ingest
 *  can be tuned independently of what the provider will tolerate.
 *
 *  Deliberately in-process: this component is designed to run as a single
 *  ingest worker. Running several replicas against one provider key needs a
 *  shared bucket (Redis) - noted in the README's scaling section. */
export class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();
  /** Set when a provider answers 429; no token is issued until it passes. */
  private pausedUntil = 0;

  constructor(
    readonly name: string,
    private readonly perMinute: number,
  ) {
    this.tokens = perMinute;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed < 0) {
      // Wall clock stepped backwards (NTP correction). Without this the
      // timestamp stays in the future and no token is ever issued until real
      // time catches up - the ingest simply stops.
      this.lastRefill = now;
      return;
    }
    if (elapsed === 0) return;
    this.tokens = Math.min(this.perMinute, this.tokens + (elapsed / 60_000) * this.perMinute);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      if (this.pausedUntil > now) {
        await sleep(Math.min(this.pausedUntil - now, 5_000));
        continue;
      }
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Wait exactly as long as one token needs, plus a little slack.
      await sleep(Math.ceil((1 - this.tokens) * (60_000 / this.perMinute)) + 25);
    }
  }

  /** Called on a 429. Blocks the whole bucket, not just the calling task. */
  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  get snapshot(): { name: string; perMinute: number; available: number; pausedMs: number } {
    this.refill();
    return {
      name: this.name,
      perMinute: this.perMinute,
      available: Math.floor(this.tokens),
      pausedMs: Math.max(0, this.pausedUntil - Date.now()),
    };
  }
}
