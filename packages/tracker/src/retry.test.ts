import { describe, expect, it, vi } from "vitest";
import { RetryableError, isTransientStatus, retryAfterMs, withRetry } from "./retry.js";

const noSleep = { sleep: async () => {}, jitter: () => 0, baseMs: 1 };

describe("withRetry", () => {
  it("retries a RetryableError then succeeds", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError("429"))
      .mockResolvedValueOnce("ok");
    expect(await withRetry(fn, noSleep)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after `retries` and rethrows", async () => {
    const fn = vi.fn(async () => {
      throw new RetryableError("still 500");
    });
    await expect(withRetry(fn, { ...noSleep, retries: 2 })).rejects.toThrow("still 500");
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("does not retry a non-retryable error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("bad request");
    });
    await expect(withRetry(fn, noSleep)).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honors retryAfterMs from the error", async () => {
    const sleeps: number[] = [];
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError("429", 1234))
      .mockResolvedValueOnce("ok");
    await withRetry(fn, { sleep: async (ms) => void sleeps.push(ms), jitter: () => 0 });
    expect(sleeps).toEqual([1234]);
  });
});

describe("helpers", () => {
  it("classifies transient statuses", () => {
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
    expect(isTransientStatus(404)).toBe(false);
  });
  it("parses Retry-After seconds → ms", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs(null)).toBeUndefined();
  });
});
