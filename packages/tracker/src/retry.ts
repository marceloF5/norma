/** Error that signals the operation is worth retrying (429/5xx/network). */
export class RetryableError extends Error {
  constructor(
    message: string,
    /** Honor a server-provided Retry-After (ms) instead of the backoff schedule. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

export interface RetryOptions {
  /** Max retries after the first attempt (default 3). */
  retries?: number;
  /** Base backoff in ms (default 300). */
  baseMs?: number;
  /** Backoff ceiling in ms (default 5000). */
  maxMs?: number;
  /** Injectable sleeper (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter in ms (tests); default random 0–100ms. */
  jitter?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying only when it throws a `RetryableError`, with exponential
 * backoff + jitter (honoring `retryAfterMs` when present). Non-retryable errors
 * propagate immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 300;
  const max = opts.maxMs ?? 5000;
  const sleep = opts.sleep ?? defaultSleep;
  const jitter = opts.jitter ?? (() => Math.floor(Math.random() * 100));

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt >= retries) throw err;
      const backoff = Math.min(max, base * 2 ** attempt) + jitter();
      await sleep(err.retryAfterMs ?? backoff);
      attempt++;
    }
  }
}

/** Classify an HTTP status as transient (retryable). */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Parse a Retry-After header (seconds) into ms, if present. */
export function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  return Number.isFinite(secs) ? secs * 1000 : undefined;
}
