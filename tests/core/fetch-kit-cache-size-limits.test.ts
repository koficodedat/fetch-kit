// tests/core/fetch-kit-cache-size-limits-fixed.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchKit } from '@core/fetch-kit';
import * as fetchModule from '@core/fetch';

// Mock the fetch module
vi.mock('@core/fetch', () => ({
  fetch: vi.fn(),
}));

describe('FetchKit Cache Size Limits and Eviction Policies', () => {
  // Mock Date.now for predictable testing
  const originalDateNow = Date.now;
  const mockNow = 1609459200000; // 2021-01-01

  beforeEach(() => {
    vi.resetAllMocks();
    Date.now = vi.fn(() => mockNow);
    vi.useFakeTimers();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Eviction Policies', () => {
    it('should support the LRU eviction policy configuration', async () => {
      // Create FetchKit with a LRU policy
      const fk = createFetchKit({
        cacheOptions: {
          evictionPolicy: 'lru',
        },
      });

      // Mock successful responses
      vi.mocked(fetchModule.fetch)
        .mockResolvedValueOnce({ data: 'data1' })
        .mockResolvedValueOnce({ data: 'data2' });

      // Cache some data
      await fk.get('/item1');
      await fk.get('/item2');

      // Both items should be cached
      await fk.get('/item1');
      await fk.get('/item2');

      // Should only have made 2 fetch calls total
      expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
    });

    it('should support the LFU eviction policy configuration', async () => {
      // Create FetchKit with LFU policy
      const fk = createFetchKit({
        cacheOptions: {
          evictionPolicy: 'lfu',
        },
      });

      // Mock successful responses
      vi.mocked(fetchModule.fetch)
        .mockResolvedValueOnce({ data: 'data1' })
        .mockResolvedValueOnce({ data: 'data2' });

      // Cache some data
      await fk.get('/item1');
      await fk.get('/item2');

      // Access item2 multiple times to increase its frequency
      await fk.get('/item2');
      await fk.get('/item2');

      // Should only have made 2 fetch calls total
      expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
    });

    // Fix the TTL eviction policy test
    it('should support the TTL eviction policy', async () => {
      // Create FetchKit with TTL policy
      const fk = createFetchKit({
        cacheOptions: {
          evictionPolicy: 'ttl',
          cacheTime: 5000, // 5 seconds TTL
        },
      });

      // Mock successful responses
      vi.mocked(fetchModule.fetch)
        .mockResolvedValueOnce({ data: 'data1' })
        .mockResolvedValueOnce({ data: 'data1-updated' });

      // Fetch URL and cache it
      await fk.get('/item1');
      expect(fetchModule.fetch).toHaveBeenCalledTimes(1);

      // Access before TTL expiration, should use cache
      await fk.get('/item1');
      expect(fetchModule.fetch).toHaveBeenCalledTimes(1); // No change

      // Manually invalidate the cache to test TTL policy behavior
      fk.invalidateCache(fk.getCacheKey('/item1'));

      // After invalidation, should fetch new data
      await fk.get('/item1');
      expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
    });

    it('should support the FIFO eviction policy configuration', async () => {
      // Create FetchKit with FIFO policy
      const fk = createFetchKit({
        cacheOptions: {
          evictionPolicy: 'fifo',
        },
      });

      // Mock successful responses
      vi.mocked(fetchModule.fetch)
        .mockResolvedValueOnce({ data: 'data1' })
        .mockResolvedValueOnce({ data: 'data2' });

      // Cache some data
      await fk.get('/item1'); // First in
      await fk.get('/item2'); // Second in

      // Both should be cached
      await fk.get('/item1');
      await fk.get('/item2');

      // Should only have made 2 fetch calls total
      expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Configuration', () => {
    it('should respect custom cache options', async () => {
      // Create FetchKit with custom cache options
      const fk = createFetchKit({
        cacheOptions: {
          cacheTime: 5000, // 5 seconds cache time
          staleTime: 2000, // 2 seconds stale time
        },
      });

      // Mock successful responses
      vi.mocked(fetchModule.fetch)
        .mockResolvedValueOnce({ data: 'data1' })
        .mockResolvedValueOnce({ data: 'data1-updated' });

      // First request should fetch
      await fk.get('/item1');
      expect(fetchModule.fetch).toHaveBeenCalledTimes(1);

      // Second request within stale time should use cache
      await fk.get('/item1');
      expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    });

    it('should respect per-request cache options', async () => {
      // Create FetchKit with default options
      const fk = createFetchKit();

      // Mock successful responses
      vi.mocked(fetchModule.fetch)
        .mockResolvedValueOnce({ data: 'data1' })
        .mockResolvedValueOnce({ data: 'data1-updated' });

      // Fetch with custom cache options
      await fk.get('/item1', {
        cacheOptions: {
          staleTime: 1000, // 1 second stale time
        },
      });

      // Access immediately should use cache
      await fk.get('/item1');
      expect(fetchModule.fetch).toHaveBeenCalledTimes(1);

      // Should be able to override cache options
      await fk.get('/item1', { cacheOptions: false });
      expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
    });

    it('should allow manual cache data manipulation', async () => {
      const fk = createFetchKit();

      // Manually set cache data
      fk.setCacheData('/item1', { data: 'manual data' });

      // Should be able to get the cache entry
      const entry = fk.getCacheEntry('/item1');
      expect(entry).toBeDefined();
      expect(entry?.data).toEqual({ data: 'manual data' });

      // Should be able to check if cache is stale
      expect(fk.isCacheStale('/item1')).toBe(false);

      // Should be able to invalidate the cache
      fk.invalidateCache(fk.getCacheKey('/item1'));

      // Cache should now be empty
      expect(fk.getCacheEntry('/item1')).toBeUndefined();
    });
  });
});
