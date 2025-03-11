// tests/cache/memory-cache.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache } from '@cache/memory-cache';
import { createCacheEntry } from '@cache/cache-entry';

describe('Memory Cache', () => {
  // Mock Date.now for predictable testing
  const originalDateNow = Date.now;
  let mockNow = 1609459200000; // 2021-01-01
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
    Date.now = vi.fn(() => mockNow);
  });

  afterEach(() => {
    Date.now = originalDateNow;
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
});
