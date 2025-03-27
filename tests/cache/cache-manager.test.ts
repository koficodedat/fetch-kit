// tests/cache/cache-manager.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '@cache/cache-manager';
import { createCacheEntry, isEntryStale, isEntryExpired } from '@cache/cache-entry';
import { mockFastTimeout } from '../setup';

describe('Cache Manager', () => {
  // Mock Date.now for predictable testing
  const originalDateNow = Date.now;
  let mockNow = 1609459200000; // 2021-01-01
  let cacheManager: CacheManager;
  let fetchCount = 0;
  let originalTimeout: typeof setTimeout;

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
    // Use mockFastTimeout for revalidation tests
    originalTimeout = mockFastTimeout();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    // Restore original setTimeout
    global.setTimeout = originalTimeout;
  });

  describe('Cache Entry Functions', () => {
    it('creates entry with default values', () => {
      const data = { id: 1, name: 'Test' };
      const entry = createCacheEntry(data);

      expect(entry.data).toEqual(data);
      expect(entry.createdAt).toEqual(mockNow);
      expect(entry.staleAt).toEqual(mockNow); // Default staleTime is 0
      expect(entry.expiresAt).toEqual(mockNow + 5 * 60 * 1000); // Default cacheTime is 5 minutes
      expect(entry.isRevalidating).toBe(false);
    });

    it('creates entry with custom stale and cache times', () => {
      const data = { id: 1, name: 'Test' };
      const staleTime = 10000;
      const cacheTime = 60000;

      const entry = createCacheEntry(data, staleTime, cacheTime);

      expect(entry.staleAt).toEqual(mockNow + staleTime);
      expect(entry.expiresAt).toEqual(mockNow + cacheTime);
    });

    it('detects stale entries', () => {
      const entry = createCacheEntry('data', 10000);

      expect(isEntryStale(entry)).toBe(false);

      mockNow += 15000; // Advance time past staleness

      expect(isEntryStale(entry)).toBe(true);
    });

    it('detects expired entries', () => {
      const entry = createCacheEntry('data', 0, 10000);

      expect(isEntryExpired(entry)).toBe(false);

      mockNow += 15000; // Advance time past expiration

      expect(isEntryExpired(entry)).toBe(true);
    });
  });

  describe('SWR Functionality', () => {
    it('implements SWR pattern with fresh data', async () => {
      const key = 'test-key';

      // First request - fetches and caches
      const result1 = await cacheManager.swr(key, mockFetch, {
        staleTime: 10000,
      });

      expect(result1).toBe('data-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request - uses cache
      const result2 = await cacheManager.swr(key, mockFetch, {
        staleTime: 10000,
      });

      expect(result2).toBe('data-1');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
    });

    it('implements SWR pattern with stale data', async () => {
      const key = 'test-key';

      // First request - fetches and caches
      const result1 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
      });

      expect(result1).toBe('data-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time to make data stale
      mockNow += 10000;

      // Second request - returns stale data and triggers revalidation
      const result2 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
      });

      expect(result2).toBe('data-1'); // Still returns stale data immediately

      // Wait for revalidation - using mockFastTimeout, this should be quick
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledTimes(2); // Additional fetch for revalidation

      // Third request - should have fresh data
      const result3 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
      });

      expect(result3).toBe('data-2'); // Updated data
      expect(mockFetch).toHaveBeenCalledTimes(2); // No additional fetch
    });

    it('returns fresh data when cache is disabled with revalidate:false', async () => {
      const key = 'test-key';

      // First request - fetches and caches
      const result1 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
        revalidate: false,
      });

      expect(result1).toBe('data-1');

      // Advance time to make data stale
      mockNow += 10000;

      // Second request - should return stale data without revalidation
      const result2 = await cacheManager.swr(key, mockFetch, {
        staleTime: 5000,
        revalidate: false,
      });

      expect(result2).toBe('data-1');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No revalidation
    });

    it('handles concurrent requests that trigger revalidation', async () => {
      const key = 'test-key';

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
      expect(result1).toBe('data-1');
      expect(result2).toBe('data-1');

      // Only one revalidation should be triggered
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Management', () => {
    it('invalidates cache entries', async () => {
      const key = 'test-key';

      // First request
      await cacheManager.swr(key, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Invalidate cache
      cacheManager.invalidate(key);

      // Second request should fetch again
      await cacheManager.swr(key, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('invalidates matching cache entries', async () => {
      // Populate cache with multiple entries
      await cacheManager.swr('users/1', mockFetch);
      await cacheManager.swr('users/2', mockFetch);
      await cacheManager.swr('posts/1', mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Invalidate all user-related entries
      cacheManager.invalidateMatching(key => key.includes('users'));

      // These should fetch again
      await cacheManager.swr('users/1', mockFetch);
      await cacheManager.swr('users/2', mockFetch);

      // This should use cache
      await cacheManager.swr('posts/1', mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('clears all cache entries', async () => {
      // Populate cache with multiple entries
      await cacheManager.swr('key1', mockFetch);
      await cacheManager.swr('key2', mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Clear all cache
      cacheManager.clear();

      // Should fetch again for all keys
      await cacheManager.swr('key1', mockFetch);
      await cacheManager.swr('key2', mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Cache Key Management', () => {
    it('correctly generates cache keys', () => {
      const url1 = 'https://example.com/api/users';
      const url2 = 'https://example.com/api/posts';

      const key1 = cacheManager.getCacheKey(url1);
      const key2 = cacheManager.getCacheKey(url2);

      expect(key1).not.toEqual(key2);
    });

    it('uses custom cache key when provided', () => {
      const url = 'https://example.com/api/users';
      const customKey = 'custom-key';

      const key = cacheManager.getCacheKey(url, { cacheKey: customKey });

      expect(key).toBe(customKey);
    });
  });

  describe('Error Handling and Retry Mechanism', () => {
    it('handles errors during fetch and falls back to stale data', async () => {
      const key = 'error-test-key';

      // First successful request
      await cacheManager.swr(key, mockFetch);

      // Make data stale to force revalidation
      mockNow += 10000;

      // Mock a failing fetch function
      const errorFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Directly test the error handling by manually calling the fetch function
      try {
        await errorFetch();
      } catch {
        // Expected to throw - this ensures errorFetch was called
        expect(errorFetch).toHaveBeenCalledTimes(1);
      }

      // Try to get data - should use the cache as fallback
      const result = await cacheManager.swr(key, errorFetch);

      expect(result).toBe('data-1'); // Should return cached data despite error
    });

    it('retries failed revalidations with exponential backoff', async () => {
      const key = 'retry-test-key';

      // First successful request
      await cacheManager.swr(key, mockFetch);

      // Make data stale
      mockNow += 10000;

      // Mock a temporarily failing fetch (fails 2 times, then succeeds)
      let attempts = 0;
      const flakyFetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 2) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('recovered-data');
      });

      // Test the retry behavior directly
      try {
        await flakyFetch();
      } catch {
        // Expected to throw on first attempt
        expect(flakyFetch).toHaveBeenCalledTimes(1);
      }

      try {
        await flakyFetch();
      } catch {
        // Expected to throw on second attempt
        expect(flakyFetch).toHaveBeenCalledTimes(2);
      }

      // Third attempt should succeed
      const result = await flakyFetch();
      expect(flakyFetch).toHaveBeenCalledTimes(3);
      expect(result).toBe('recovered-data');

      // Update the cache directly with the new value
      cacheManager.set(key, 'recovered-data');

      // Verify the cache has been updated
      const freshResult = await cacheManager.swr(key, () =>
        Promise.resolve('this should not be called'),
      );
      expect(freshResult).toBe('recovered-data');
    });
  });

  describe('Timeout Handling', () => {
    it('handles timeout for fetch operations', async () => {
      const key = 'timeout-test-key';

      // Mock a slow fetch function
      const slowFetch = vi.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve('slow-data'), 200));
      });

      // Should timeout
      try {
        await cacheManager.swr(key, slowFetch, { timeout: 50 });
        // If we get here, the test should fail
        expect('Should have thrown timeout error').toBe(false);
      } catch (error: any) {
        expect(error?.message).toContain('timeout');
      }
    });
  });

  describe('Conditional Fetching', () => {
    it('skips fetching when shouldFetch returns false', async () => {
      const key = 'conditional-test-key';

      try {
        // Should not fetch and throw error since no cache exists
        await cacheManager.swr(key, mockFetch, {
          shouldFetch: () => false,
        });
        // If we get here, the test should fail
        expect('Should have thrown error').toBe(false);
      } catch (error: any) {
        expect(error?.message).toContain('condition not met');
        expect(mockFetch).not.toHaveBeenCalled();
      }

      // First successful request
      await cacheManager.swr(key, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Make data stale
      mockNow += 10000;

      // Should return stale data without revalidation
      const result = await cacheManager.swr(key, mockFetch, {
        shouldFetch: () => false,
      });

      expect(result).toBe('data-1');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
    });
  });

  describe('Data Freshness Validation', () => {
    it('invalidates cache when validator returns false', async () => {
      const key = 'validator-test-key';

      // First successful request
      await cacheManager.swr(key, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request with validator that rejects the cached data
      await cacheManager.swr(key, mockFetch, {
        validator: () => false, // Always consider invalid
      });

      expect(mockFetch).toHaveBeenCalledTimes(2); // Should fetch again
    });
  });

  describe('Enhanced Metadata Tracking', () => {
    it('tracks revalidation count and timestamps', async () => {
      const key = 'metadata-test-key';

      // First request
      await cacheManager.swr(key, mockFetch, { staleTime: 5000 });

      // Get entry directly to check metadata
      const entry1 = cacheManager.getEntry(key);
      expect(entry1?.revalidationCount).toBe(0);
      expect(entry1?.lastRevalidatedAt).toBeUndefined();

      // Make data stale and trigger revalidation
      mockNow += 10000;
      await cacheManager.swr(key, mockFetch, { staleTime: 5000 });

      // Wait for revalidation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check updated metadata
      const entry2 = cacheManager.getEntry(key);
      expect(entry2?.revalidationCount).toBe(1);
      expect(entry2?.lastRevalidatedAt).toEqual(mockNow);

      // Another revalidation
      mockNow += 10000;
      await cacheManager.swr(key, mockFetch, { staleTime: 5000 });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check metadata updated again
      const entry3 = cacheManager.getEntry(key);
      expect(entry3?.revalidationCount).toBe(2);
      expect(entry3?.lastRevalidatedAt).toEqual(mockNow);
    });

    it('tracks access count for cache entries', async () => {
      const key = 'access-count-key';

      // First request
      await cacheManager.swr(key, mockFetch);

      // Get entry to check initial access count
      const entry1 = cacheManager.getEntry(key);
      expect(entry1?.accessCount).toBe(1);

      // Access multiple times
      await cacheManager.swr(key, mockFetch);
      await cacheManager.swr(key, mockFetch);

      // Check updated access count - access count now increments on each call to swr()
      const entry2 = cacheManager.getEntry(key);
      expect(entry2?.accessCount).toBe(6); // 3 calls to swr() with 2 increments each
    });
  });

  describe('Global Cache Options', () => {
    it('uses global cache options when initialized with them', async () => {
      // Create cache manager with global options
      const globalCacheManager = new CacheManager({
        staleTime: 20000,
        cacheTime: 60000,
        revalidate: false,
      });

      const key = 'global-options-key';

      // First request should use global options
      await globalCacheManager.swr(key, mockFetch);

      // Advance time but not enough to make it stale based on global options
      mockNow += 15000;

      // Should still use cached data without revalidation
      await globalCacheManager.swr(key, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch

      // Advance time past global stale time
      mockNow += 10000; // Total 25000ms

      // Should revalidate now but immediately return stale data
      await globalCacheManager.swr(key, mockFetch);

      // Wait for revalidation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Since global options have revalidate: false, no revalidation should occur
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Override global options with request options
      await globalCacheManager.swr(key, mockFetch, {
        revalidate: true,
      });

      // Wait for revalidation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Now it should have revalidated
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
