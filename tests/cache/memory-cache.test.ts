// tests/cache/memory-cache.test.ts

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { MemoryCache } from '@cache/memory-cache';
import { createCacheEntry } from '@cache/cache-entry';

describe('Memory Cache', () => {
  // Mock Date.now for predictable testing
  const originalDateNow = Date.now;
  let mockNow = 1609459200000; // 2021-01-01
  let cache: MemoryCache;
  let clearIntervalSpy: any;

  beforeAll(() => {
    clearIntervalSpy = vi.spyOn(global, 'clearInterval');
  });

  beforeEach(() => {
    cache = new MemoryCache();
    Date.now = vi.fn(() => mockNow);
    clearIntervalSpy.mockClear();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    if (cache) {
      cache.dispose();
    }
  });

  it('stores and retrieves entries', () => {
    const key = 'test-key';
    const entry = createCacheEntry('test-data');

    cache.set(key, entry);

    expect(cache.get(key)).toEqual(entry);
    expect(cache.has(key)).toBe(true);
  });

  it('returns undefined for non-existent keys', () => {
    expect(cache.get('non-existent')).toBeUndefined();
    expect(cache.has('non-existent')).toBe(false);
  });

  it('automatically removes expired entries when accessed', () => {
    const key = 'test-key';
    const entry = createCacheEntry('test-data', 0, 10000);

    cache.set(key, entry);
    expect(cache.has(key)).toBe(true);

    mockNow += 15000; // Advance time past expiration

    expect(cache.has(key)).toBe(false);
    expect(cache.get(key)).toBeUndefined();
  });

  it('updates entry metadata', () => {
    const key = 'test-key';
    const entry = createCacheEntry('test-data');

    cache.set(key, entry);

    const updated = cache.update(key, { isRevalidating: true });
    expect(updated).toBe(true);

    const updatedEntry = cache.get(key);
    expect(updatedEntry?.isRevalidating).toBe(true);
  });

  it('returns false when updating non-existent entry', () => {
    const updated = cache.update('non-existent', { isRevalidating: true });
    expect(updated).toBe(false);
  });

  it('deletes entries correctly', () => {
    const key = 'test-key';
    cache.set(key, createCacheEntry('test-data'));

    expect(cache.has(key)).toBe(true);

    const deleted = cache.delete(key);
    expect(deleted).toBe(true);
    expect(cache.has(key)).toBe(false);
  });

  it('returns false when deleting non-existent entry', () => {
    const deleted = cache.delete('non-existent');
    expect(deleted).toBe(false);
  });

  it('returns all cache keys', () => {
    cache.set('key1', createCacheEntry('data1'));
    cache.set('key2', createCacheEntry('data2'));
    cache.set('key3', createCacheEntry('data3'));

    const keys = cache.keys();
    expect(keys).toHaveLength(3);
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toContain('key3');
  });

  it('cleanup removes expired entries', () => {
    cache.set('key1', createCacheEntry('data1', 0, 5000));
    cache.set('key2', createCacheEntry('data2', 0, 15000));

    mockNow += 10000; // Advance time past first entry's expiration

    cache.cleanup();

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
  });

  it('clear removes all entries', () => {
    cache.set('key1', createCacheEntry('data1'));
    cache.set('key2', createCacheEntry('data2'));

    expect(cache.keys()).toHaveLength(2);

    cache.clear();

    expect(cache.keys()).toHaveLength(0);
  });

  // New tests for size limits and eviction policies
  describe('Size Limits', () => {
    it('enforces maxEntries limit', () => {
      // Mock the Date.now to have full control over timestamps
      let mockTime = 1000;
      const origDateNow = Date.now;
      Date.now = vi.fn(() => mockTime);

      try {
        // Create cache with max 3 entries and LRU policy
        const limitedCache = new MemoryCache({
          maxEntries: 3,
          evictionPolicy: 'lru',
        });

        // Add entries with explicit timestamps
        mockTime = 1000;
        limitedCache.set('key1', createCacheEntry('data1')); // First added (t=1000)

        mockTime = 2000;
        limitedCache.set('key2', createCacheEntry('data2')); // Second added (t=2000)

        mockTime = 3000;
        limitedCache.set('key3', createCacheEntry('data3')); // Last added (t=3000)

        // Verify all entries present
        expect(limitedCache.has('key1')).toBe(true);
        expect(limitedCache.has('key2')).toBe(true);
        expect(limitedCache.has('key3')).toBe(true);

        // Access key1 to make it most recently used
        mockTime = 4000; // Update access time to be newest
        limitedCache.get('key1');

        // Now key2 should be the least recently used (still at t=2000)
        // key3 was accessed at t=3000
        // key1 was accessed at t=4000

        // Add 4th entry
        mockTime = 5000;
        limitedCache.set('key4', createCacheEntry('data4')); // (t=5000)

        // key2 should be evicted as it's the least recently used
        expect(limitedCache.has('key1')).toBe(true); // Accessed at t=4000
        expect(limitedCache.has('key2')).toBe(false); // Evicted (last access t=2000)
        expect(limitedCache.has('key3')).toBe(true); // Last access at t=3000
        expect(limitedCache.has('key4')).toBe(true); // Just added at t=5000

        const stats = limitedCache.getStats();
        expect(stats.entryCount).toBe(3);
        expect(stats.maxEntries).toBe(3);
        expect(stats.evictions).toBe(1);
      } finally {
        // Restore original Date.now
        Date.now = origDateNow;
      }
    });

    it('enforces maxSize limit', () => {
      // Create a custom size estimator that returns fixed sizes
      const sizeEstimator = () => {
        // 100 bytes for each entry
        return 100;
      };

      // Create cache with max 250 bytes and default LRU policy
      const limitedCache = new MemoryCache({
        maxSize: 250,
        sizeEstimator,
      });

      // Add 2 entries (should fit: 2 * 100 = 200 bytes)
      limitedCache.set('key1', createCacheEntry('data1'));
      limitedCache.set('key2', createCacheEntry('data2'));

      // Both entries should be present
      expect(limitedCache.has('key1')).toBe(true);
      expect(limitedCache.has('key2')).toBe(true);
      expect(limitedCache.getSize()).toBe(200);

      // Add 3rd entry (would exceed limit: 3 * 100 = 300 bytes)
      limitedCache.set('key3', createCacheEntry('data3'));

      // Should have evicted key1 (oldest)
      expect(limitedCache.has('key1')).toBe(false);
      expect(limitedCache.has('key2')).toBe(true);
      expect(limitedCache.has('key3')).toBe(true);
      expect(limitedCache.getSize()).toBe(200);

      const stats = limitedCache.getStats();
      expect(stats.size).toBe(200);
      expect(stats.maxSize).toBe(250);
      expect(stats.evictions).toBe(1);
    });
  });

  describe('Eviction Policies', () => {
    it('uses LRU (Least Recently Used) policy', () => {
      // Mock Date.now for predictable testing
      let mockTime = 1000;
      const origDateNow = Date.now;
      Date.now = vi.fn(() => mockTime);

      try {
        const lruCache = new MemoryCache({
          maxEntries: 3,
          evictionPolicy: 'lru',
        });

        // Add 3 entries with explicit timestamps
        mockTime = 1000;
        lruCache.set('key1', createCacheEntry('data1')); // t=1000

        mockTime = 2000;
        lruCache.set('key2', createCacheEntry('data2')); // t=2000

        mockTime = 3000;
        lruCache.set('key3', createCacheEntry('data3')); // t=3000

        // Access key1 to make it most recently used
        mockTime = 4000;
        lruCache.get('key1'); // now key1 at t=4000

        // At this point:
        // key1: last accessed at t=4000
        // key2: last accessed at t=2000 (oldest)
        // key3: last accessed at t=3000

        // Add 4th entry
        mockTime = 5000;
        lruCache.set('key4', createCacheEntry('data4')); // t=5000

        // Should evict key2 (least recently used)
        expect(lruCache.has('key1')).toBe(true); // Accessed at t=4000
        expect(lruCache.has('key2')).toBe(false); // Evicted (last access t=2000)
        expect(lruCache.has('key3')).toBe(true); // Last access at t=3000
        expect(lruCache.has('key4')).toBe(true); // Just added at t=5000
      } finally {
        // Restore original Date.now
        Date.now = origDateNow;
      }
    });

    it('uses LFU (Least Frequently Used) policy', () => {
      const lfuCache = new MemoryCache({
        maxEntries: 3,
        evictionPolicy: 'lfu',
      });

      // Add 3 entries
      lfuCache.set('key1', createCacheEntry('data1'));
      lfuCache.set('key2', createCacheEntry('data2'));
      lfuCache.set('key3', createCacheEntry('data3'));

      // Access key1 multiple times to increase its usage count
      lfuCache.get('key1');
      lfuCache.get('key1');

      // Access key2 once
      lfuCache.get('key2');

      // Add 4th entry - should evict key3 (least frequently used)
      lfuCache.set('key4', createCacheEntry('data4'));

      expect(lfuCache.has('key1')).toBe(true); // Accessed 3 times (set + 2 gets)
      expect(lfuCache.has('key2')).toBe(true); // Accessed 2 times (set + 1 get)
      expect(lfuCache.has('key3')).toBe(false); // Accessed only once (set)
      expect(lfuCache.has('key4')).toBe(true); // Just added
    });

    it('uses FIFO (First In First Out) policy', () => {
      const fifoCache = new MemoryCache({
        maxEntries: 3,
        evictionPolicy: 'fifo',
      });

      // Add 3 entries
      fifoCache.set('key1', createCacheEntry('data1'));
      fifoCache.set('key2', createCacheEntry('data2'));
      fifoCache.set('key3', createCacheEntry('data3'));

      // Access shouldn't matter for FIFO
      fifoCache.get('key1');
      fifoCache.get('key2');
      fifoCache.get('key3');

      // Add 4th entry - should evict key1 (first added)
      fifoCache.set('key4', createCacheEntry('data4'));

      expect(fifoCache.has('key1')).toBe(false); // First in, first out
      expect(fifoCache.has('key2')).toBe(true);
      expect(fifoCache.has('key3')).toBe(true);
      expect(fifoCache.has('key4')).toBe(true); // Just added
    });

    it('uses TTL (Time To Live) policy', () => {
      const ttlCache = new MemoryCache({
        maxEntries: 3,
        evictionPolicy: 'ttl',
      });

      // Add entries with different expiration times
      ttlCache.set('key1', createCacheEntry('data1', 0, 5000)); // Expires in 5 seconds
      ttlCache.set('key2', createCacheEntry('data2', 0, 15000)); // Expires in 15 seconds
      ttlCache.set('key3', createCacheEntry('data3', 0, 10000)); // Expires in 10 seconds

      // Add 4th entry - should evict key1 (shortest TTL)
      ttlCache.set('key4', createCacheEntry('data4', 0, 20000)); // Expires in 20 seconds

      expect(ttlCache.has('key1')).toBe(false); // Shortest TTL, evicted
      expect(ttlCache.has('key2')).toBe(true);
      expect(ttlCache.has('key3')).toBe(true);
      expect(ttlCache.has('key4')).toBe(true); // Just added
    });
  });

  describe('Cache Statistics', () => {
    it('tracks hit and miss statistics', () => {
      const statsCache = new MemoryCache();

      // Set a value
      statsCache.set('key1', createCacheEntry('data1'));

      // Get existing value (hit)
      statsCache.get('key1');

      // Get non-existent value (miss)
      statsCache.get('key2');

      const stats = statsCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBe(0.5); // 1 hit / (1 hit + 1 miss)
    });

    it('tracks expirations', () => {
      const statsCache = new MemoryCache();

      // Set a value with short expiration
      statsCache.set('key1', createCacheEntry('data1', 0, 5000));

      // Advance time past expiration
      mockNow += 10000;

      // Access should count as miss and expiration
      statsCache.get('key1');

      const stats = statsCache.getStats();
      expect(stats.expirations).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });

    it('updates size statistics correctly', () => {
      // Use default size estimator to test size tracking
      const statsCache = new MemoryCache();

      // Empty cache should have size 0
      expect(statsCache.getSize()).toBe(0);

      // Add an entry
      const entry = createCacheEntry({ value: 'test' });
      statsCache.set('key1', entry);

      // Size should be updated
      expect(statsCache.getSize()).toBeGreaterThan(0);

      // Delete the entry
      statsCache.delete('key1');

      // Size should be back to 0
      expect(statsCache.getSize()).toBe(0);
    });
  });

  describe('Resource Management', () => {
    it('sets up automatic cleanup interval', () => {
      // Create cache with cleanup interval
      const cleanupCache = new MemoryCache({
        cleanupInterval: 5000, // 5 seconds
      });

      // Dispose should clear the interval
      cleanupCache.dispose();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('handles updates to existing entries correctly', () => {
      // Create a simple size estimator
      const sizeEstimator = (entry: any) => {
        return entry.data.length * 2; // 2 bytes per character
      };

      const updateCache = new MemoryCache({ sizeEstimator });

      // Add initial entry
      updateCache.set('key1', createCacheEntry('small'));
      const initialSize = updateCache.getSize();

      // Update with larger data
      updateCache.set('key1', createCacheEntry('much larger data'));

      // Size should increase
      expect(updateCache.getSize()).toBeGreaterThan(initialSize);

      // Get the updated value
      const entry = updateCache.get('key1');
      expect(entry?.data).toBe('much larger data');
    });
  });
});
