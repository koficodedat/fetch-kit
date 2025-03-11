// tests/cache/cache-manager.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CacheManager } from "@cache/cache-manager";
import {
  createCacheEntry,
  isEntryStale,
  isEntryExpired,
} from "@cache/cache-entry";

describe("Cache Manager", () => {
  // Mock Date.now for predictable testing
  const originalDateNow = Date.now;
  let mockNow = 1609459200000; // 2021-01-01
  let cacheManager: CacheManager;
  let fetchCount = 0;

  // Mock fetch function that counts calls
  const mockFetch = vi.fn().mockImplementation(() => {
    fetchCount++;
    return Promise.resolve(`data-${fetchCount}`);
  });

  beforeEach(() => {
    cacheManager = new CacheManager();
    fetchCount = 0;
    mockFetch.mockClear();
    Date.now = vi.fn(() => mockNow);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe("Cache Entry Functions", () => {
    it("creates entry with default values", () => {
      const data = { id: 1, name: "Test" };
      const entry = createCacheEntry(data);

      expect(entry.data).toEqual(data);
      expect(entry.createdAt).toEqual(mockNow);
      expect(entry.staleAt).toEqual(mockNow); // Default staleTime is 0
      expect(entry.expiresAt).toEqual(mockNow + 5 * 60 * 1000); // Default cacheTime is 5 minutes
      expect(entry.isRevalidating).toBe(false);
    });

    it("creates entry with custom stale and cache times", () => {
      const data = { id: 1, name: "Test" };
      const staleTime = 10000;
      const cacheTime = 60000;

      const entry = createCacheEntry(data, staleTime, cacheTime);

      expect(entry.staleAt).toEqual(mockNow + staleTime);
      expect(entry.expiresAt).toEqual(mockNow + cacheTime);
    });

    it("detects stale entries", () => {
      const entry = createCacheEntry("data", 10000);

      expect(isEntryStale(entry)).toBe(false);

      mockNow += 15000; // Advance time past staleness

      expect(isEntryStale(entry)).toBe(true);
    });

    it("detects expired entries", () => {
      const entry = createCacheEntry("data", 0, 10000);

      expect(isEntryExpired(entry)).toBe(false);

      mockNow += 15000; // Advance time past expiration

      expect(isEntryExpired(entry)).toBe(true);
    });
  });

  describe("SWR Functionality", () => {
    it("implements SWR pattern with fresh data", async () => {
      const key = "test-key";

      // First request - fetches and caches
      const result1 = await cacheManager.swr(key, mockFetch, {
        staleTime: 10000,
      });

      expect(result1).toBe("data-1");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request - uses cache
      const result2 = await cacheManager.swr(key, mockFetch, {
        staleTime: 10000,
      });

      expect(result2).toBe("data-1");
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
    });

    it("implements SWR pattern with stale data", async () => {
      const key = "test-key";

      // First request - fetches and caches
      const result1 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
      });

      expect(result1).toBe("data-1");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time to make data stale
      mockNow += 10000;

      // Second request - returns stale data and triggers revalidation
      const result2 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
      });

      expect(result2).toBe("data-1"); // Still returns stale data immediately

      // Wait for revalidation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledTimes(2); // Additional fetch for revalidation

      // Third request - should have fresh data
      const result3 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
      });

      expect(result3).toBe("data-2"); // Updated data
      expect(mockFetch).toHaveBeenCalledTimes(2); // No additional fetch
    });

    it("returns fresh data when cache is disabled with revalidate:false", async () => {
      const key = "test-key";

      // First request - fetches and caches
      const result1 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
        revalidate: false,
      });

      expect(result1).toBe("data-1");

      // Advance time to make data stale
      mockNow += 10000;

      // Second request - should return stale data without revalidation
      const result2 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
        revalidate: false,
      });

      expect(result2).toBe("data-1");
      expect(mockFetch).toHaveBeenCalledTimes(1); // No revalidation
    });

    it("handles concurrent requests that trigger revalidation", async () => {
      const key = "test-key";

      // First request - fetches and caches
      await cacheManager.swr(key, mockFetch, { staleTime: 5000 });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time to make data stale
      mockNow += 10000;

      // Concurrent requests
      const promise1 = cacheManager.swr(key, mockFetch, { staleTime: 5000 });
      const promise2 = cacheManager.swr(key, mockFetch, { staleTime: 5000 });

      // Both should resolve with stale data
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe("data-1");
      expect(result2).toBe("data-1");

      // Only one revalidation should be triggered
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Cache Management", () => {
    it("invalidates cache entries", async () => {
      const key = "test-key";

      // First request
      await cacheManager.swr(key, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Invalidate cache
      cacheManager.invalidate(key);

      // Second request should fetch again
      await cacheManager.swr(key, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("invalidates matching cache entries", async () => {
      // Populate cache with multiple entries
      await cacheManager.swr("users/1", mockFetch);
      await cacheManager.swr("users/2", mockFetch);
      await cacheManager.swr("posts/1", mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Invalidate all user-related entries
      cacheManager.invalidateMatching((key) => key.includes("users"));

      // These should fetch again
      await cacheManager.swr("users/1", mockFetch);
      await cacheManager.swr("users/2", mockFetch);

      // This should use cache
      await cacheManager.swr("posts/1", mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("clears all cache entries", async () => {
      // Populate cache with multiple entries
      await cacheManager.swr("key1", mockFetch);
      await cacheManager.swr("key2", mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Clear all cache
      cacheManager.clear();

      // Should fetch again for all keys
      await cacheManager.swr("key1", mockFetch);
      await cacheManager.swr("key2", mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("Cache Key Management", () => {
    it("correctly generates cache keys", () => {
      const url1 = "https://example.com/api/users";
      const url2 = "https://example.com/api/posts";

      const key1 = cacheManager.getCacheKey(url1);
      const key2 = cacheManager.getCacheKey(url2);

      expect(key1).not.toEqual(key2);
    });

    it("uses custom cache key when provided", () => {
      const url = "https://example.com/api/users";
      const customKey = "custom-key";

      const key = cacheManager.getCacheKey(url, { cacheKey: customKey });

      expect(key).toBe(customKey);
    });
  });
});
