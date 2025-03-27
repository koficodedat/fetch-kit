// tests/cache/cache-warming.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheManager } from '../../src/cache/cache-manager';

describe('CacheManager Cache Warming', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should register a cache key for warming', () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'test data' });

    // Register cache warming
    cacheManager.registerCacheWarming('warm-key', fetchFn, { warmingInterval: 1000 });

    // Should immediately fetch to warm the cache
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Should have the key in warmed keys
    expect(cacheManager.getWarmedCacheKeys()).toContain('warm-key');
  });

  it('should unregister a warmed cache key', () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'test data' });

    // Register and then unregister
    cacheManager.registerCacheWarming('temp-key', fetchFn);
    expect(cacheManager.getWarmedCacheKeys()).toContain('temp-key');

    cacheManager.unregisterCacheWarming('temp-key');
    expect(cacheManager.getWarmedCacheKeys()).not.toContain('temp-key');
  });

  it('should refresh warmed cache entries at specified intervals', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'warm data' });

    // Register with a 5-second interval
    cacheManager.registerCacheWarming('interval-key', fetchFn, { warmingInterval: 5000 });

    // Initial fetch
    expect(fetchFn).toHaveBeenCalledTimes(1);
    fetchFn.mockClear();

    // Advance time by 5 seconds and wait for the async operation
    await vi.advanceTimersByTimeAsync(5000);

    // Should have fetched again
    expect(fetchFn).toHaveBeenCalledTimes(1);
    fetchFn.mockClear();

    // Advance time by another 5 seconds
    await vi.advanceTimersByTimeAsync(5000);

    // Should have fetched yet again
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should clear warming registry when cache is cleared', () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'test data' });

    // Register for warming
    cacheManager.registerCacheWarming('clear-test', fetchFn);
    expect(cacheManager.getWarmedCacheKeys()).toContain('clear-test');

    // Clear the cache
    cacheManager.clear();

    // Warming registry should be empty
    expect(cacheManager.getWarmedCacheKeys()).toHaveLength(0);
  });

  it('should handle errors during cache warming without crashing', async () => {
    const errorFn = vi.fn().mockRejectedValue(new Error('Test error'));

    // Register a function that will fail
    cacheManager.registerCacheWarming('error-key', errorFn);

    // Should have tried to fetch once
    expect(errorFn).toHaveBeenCalledTimes(1);
    errorFn.mockClear();

    // Advance time to trigger another warming attempt
    await vi.advanceTimersByTimeAsync(300000); // Default interval

    // Should try again despite previous error
    expect(errorFn).toHaveBeenCalledTimes(1);

    // Console error should have been called
    expect(console.error).toHaveBeenCalled();
  });
});
