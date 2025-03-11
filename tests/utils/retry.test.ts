// tests/utils/retry.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateRetryDelay,
  defaultShouldRetry,
  withRetry,
  DEFAULT_RETRY_CONFIG,
} from "@utils/retry";
import { ErrorCategory } from "@fk-types/error";
import { createError } from "@utils/error";

describe("Retry utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("calculateRetryDelay", () => {
    it("should calculate correct delay for fixed backoff", () => {
      const config = { count: 3, delay: 1000, backoff: "fixed" };

      expect(calculateRetryDelay(config, 1)).toBeCloseTo(1000, -2); // Allow ~1% jitter
      expect(calculateRetryDelay(config, 2)).toBeCloseTo(1000, -2);
      expect(calculateRetryDelay(config, 3)).toBeCloseTo(1000, -2);
    });

    it("should calculate correct delay for linear backoff", () => {
      const config = { count: 3, delay: 1000, backoff: "linear" };

      expect(calculateRetryDelay(config, 1)).toBeCloseTo(1000, -2);
      expect(calculateRetryDelay(config, 2)).toBeCloseTo(2000, -2);
      expect(calculateRetryDelay(config, 3)).toBeCloseTo(3000, -2);
    });

    it("should calculate correct delay for exponential backoff", () => {
      const config = {
        count: 3,
        delay: 1000,
        backoff: "exponential",
        factor: 2,
      };

      expect(calculateRetryDelay(config, 1)).toBeCloseTo(1000, -2);
      expect(calculateRetryDelay(config, 2)).toBeCloseTo(2000, -2);
      expect(calculateRetryDelay(config, 3)).toBeCloseTo(4000, -2);
    });

    it("should respect maxDelay", () => {
      const config = {
        count: 5,
        delay: 1000,
        backoff: "exponential",
        factor: 3,
        maxDelay: 5000,
      };

      expect(calculateRetryDelay(config, 1)).toBeCloseTo(1000, -2);
      expect(calculateRetryDelay(config, 2)).toBeCloseTo(3000, -2);
      expect(calculateRetryDelay(config, 3)).toBeCloseTo(5000, -2); // Capped at maxDelay
      expect(calculateRetryDelay(config, 4)).toBeCloseTo(5000, -2); // Still capped
    });

    it("should add jitter to the delay", () => {
      const config = { count: 3, delay: 1000, backoff: "fixed" };
      const delay1 = calculateRetryDelay(config, 1);
      const delay2 = calculateRetryDelay(config, 1);

      // With 20% jitter, delays should be different
      expect(delay1).not.toBe(delay2);

      // But should be within the expected range
      expect(delay1).toBeGreaterThanOrEqual(800); // -20%
      expect(delay1).toBeLessThanOrEqual(1200); // +20%
      expect(delay2).toBeGreaterThanOrEqual(800);
      expect(delay2).toBeLessThanOrEqual(1200);
    });
  });

  describe("defaultShouldRetry", () => {
    it("should retry server errors", () => {
      const error = createError("Server error", {
        category: ErrorCategory.Server,
        status: 500,
      });

      expect(defaultShouldRetry(error, 1)).toBe(true);
    });

    it("should retry timeout errors", () => {
      const error = createError("Timeout error", {
        category: ErrorCategory.Timeout,
        isTimeout: true,
      });

      expect(defaultShouldRetry(error, 1)).toBe(true);
    });

    it("should retry network errors", () => {
      const error = createError("Network error", {
        category: ErrorCategory.Network,
        isNetworkError: true,
      });

      expect(defaultShouldRetry(error, 1)).toBe(true);
    });

    it("should retry 429 errors", () => {
      const error = createError("Too many requests", {
        category: ErrorCategory.Client,
        status: 429,
      });

      expect(defaultShouldRetry(error, 1)).toBe(true);
    });

    it("should not retry other client errors", () => {
      const error = createError("Not found", {
        category: ErrorCategory.Client,
        status: 404,
      });

      expect(defaultShouldRetry(error, 1)).toBe(false);
    });

    it("should not retry cancelled requests", () => {
      const error = createError("Cancelled", {
        category: ErrorCategory.Cancel,
        isCancelled: true,
      });

      expect(defaultShouldRetry(error, 1)).toBe(false);
    });

    it("should not retry if max attempts reached", () => {
      const error = createError("Server error", {
        category: ErrorCategory.Server,
        status: 500,
      });

      expect(defaultShouldRetry(error, DEFAULT_RETRY_CONFIG.count)).toBe(false);
    });
  });

  describe("withRetry", () => {
    it("should return result if successful on first try", async () => {
      const requestFn = vi.fn().mockResolvedValue("success");

      const result = await withRetry(requestFn);

      expect(result).toBe("success");
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure until success", async () => {
      // Fail twice, succeed on third attempt
      const requestFn = vi
        .fn()
        .mockRejectedValueOnce(
          createError("Server error", { category: ErrorCategory.Server })
        )
        .mockRejectedValueOnce(
          createError("Server error", { category: ErrorCategory.Server })
        )
        .mockResolvedValueOnce("success");

      const result = await withRetry(requestFn);

      expect(result).toBe("success");
      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it("should respect max retry count", async () => {
      // Always fail
      const requestFn = vi
        .fn()
        .mockRejectedValue(
          createError("Server error", { category: ErrorCategory.Server })
        );

      try {
        await withRetry(requestFn, { count: 2 });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(requestFn).toHaveBeenCalledTimes(2);
      }
    });

    it("should respect custom shouldRetry function", async () => {
      // Custom function that only retries on status 500
      const shouldRetry = vi.fn((error) => error.status === 500);

      const requestFn = vi
        .fn()
        .mockRejectedValueOnce(createError("Server error", { status: 500 }))
        .mockRejectedValueOnce(createError("Bad request", { status: 400 })) // Should not retry after this
        .mockResolvedValueOnce("success");

      try {
        await withRetry(requestFn, { shouldRetry });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(requestFn).toHaveBeenCalledTimes(2);
        expect(shouldRetry).toHaveBeenCalledTimes(1);
        expect(error.status).toBe(400);
      }
    });

    it("should wait appropriate delay between retries", async () => {
      const requestFn = vi
        .fn()
        .mockRejectedValueOnce(
          createError("Server error", { category: ErrorCategory.Server })
        )
        .mockResolvedValueOnce("success");

      const retryPromise = withRetry(requestFn, {
        delay: 2000,
        backoff: "fixed",
      });

      // First call happens immediately
      expect(requestFn).toHaveBeenCalledTimes(1);

      // Fast-forward 1 second (not enough time)
      vi.advanceTimersByTime(1000);
      expect(requestFn).toHaveBeenCalledTimes(1);

      // Fast-forward another 1.5 seconds (enough time with jitter)
      vi.advanceTimersByTime(1500);

      // Now the second call should have been made
      await retryPromise;
      expect(requestFn).toHaveBeenCalledTimes(2);
    });

    it("should track retry count in error object", async () => {
      let lastError: any;

      // Always fail
      const requestFn = vi.fn().mockImplementation(() => {
        throw createError("Server error", { category: ErrorCategory.Server });
      });

      try {
        await withRetry(requestFn, { count: 3 });
      } catch (error: any) {
        lastError = error;
      }

      expect(requestFn).toHaveBeenCalledTimes(3);
      expect(lastError.retryCount).toBe(2); // 0-based index, so 2 means 3 attempts
    });
  });
});
