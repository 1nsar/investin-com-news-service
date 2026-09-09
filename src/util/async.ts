/** Run `worker` over `items` with a fixed number of workers in flight.
 *  Results keep input order. A rejecting worker rejects the whole call, so
 *  callers that must not lose the batch catch inside the worker. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const width = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index] as T, index);
      }
    }),
  );
  return results;
}

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new Error("Operation cancelled.")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });

/** Process-wide concurrency gate; waiting callers can be cancelled. */
export class Semaphore {
  private active = 0;
  constructor(private readonly maximum: number) {}
  async acquire(signal?: AbortSignal): Promise<() => void> {
    while (this.active >= this.maximum) { signal?.throwIfAborted(); await sleep(20, signal); }
    signal?.throwIfAborted();
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; } };
  }
}

/** Reject if `promise` has not settled within `ms`. The underlying work is not
 *  cancelled unless the caller also wires up the AbortSignal. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { onTimeout?.(); reject(new Error(`${label} timed out after ${ms}ms`)); }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Full jitter exponential backoff (AWS style): random between 0 and the
 *  capped exponential delay. Spreads a thundering herd of retries. */
export function backoffDelayMs(attempt: number, baseMs = 500, capMs = 30_000): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}
