import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within limit", () => {
    const limiter = new RateLimiter(3, 1000);

    expect(limiter.canMakeRequest()).toBe(true);
  });

  it("tracks request count", async () => {
    const limiter = new RateLimiter(2, 1000);

    await limiter.waitForSlot();
    expect(limiter.canMakeRequest()).toBe(true);

    await limiter.waitForSlot();
    expect(limiter.canMakeRequest()).toBe(false);
  });

  it("resets after window expires", async () => {
    const limiter = new RateLimiter(1, 1000);

    await limiter.waitForSlot();
    expect(limiter.canMakeRequest()).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(1001);

    expect(limiter.canMakeRequest()).toBe(true);
  });

  it("waits when rate limited", async () => {
    const limiter = new RateLimiter(1, 100);

    // First request should be immediate
    const start = Date.now();
    await limiter.waitForSlot();
    expect(Date.now() - start).toBeLessThan(10);

    // Second request should wait
    const waitPromise = limiter.waitForSlot();
    vi.advanceTimersByTime(100);
    await waitPromise;
  });
});
