// src/cache/cache-manager.ts

import { RequestOptions } from '@fk-types/core';
import { generateCacheKey } from './cache-key';
import { CacheEntry, createCacheEntry, isEntryStale } from './cache-entry';
import { MemoryCache } from './memory-cache';

export interface CacheOptions {
  /** Time in ms after which data is considered stale (default: 0) */
  staleTime?: number;
  /** Time in ms after which cached data should be removed (default: 5 minutes) */
  cacheTime?: number;
  /** Whether to automatically revalidate stale data in the background */
  revalidate?: boolean;
  /** Optional cache key for custom cache key generation */
  cacheKey?: string;
}

/**
 * Cache manager with SWR (Stale-While-Revalidate) logic
 */
export class CacheManager {
  private cache: MemoryCache;
  private revalidationMap: Map<string, Promise<any>> = new Map();

  constructor() {
    this.cache = new MemoryCache();

    // Run cache cleanup periodically
    setInterval(() => {
      this.cache.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Get cache key for a request
   */
  getCacheKey(url: string, options?: RequestOptions & CacheOptions): string {
    // Use custom cache key if provided
    if (options?.cacheKey) {
      return options.cacheKey;
    }

    return generateCacheKey(url, options);
  }

  /**
   * Get data from cache
   */
  get<T>(cacheKey: string): T | undefined {
    const entry = this.cache.get<T>(cacheKey);
    return entry ? entry.data : undefined;
  }

  /**
   * Get full cache entry
   */
  getEntry<T>(cacheKey: string): CacheEntry<T> | undefined {
    return this.cache.get<T>(cacheKey);
  }

  /**
   * Check if cache entry is stale
   */
  isStale(cacheKey: string): boolean {
    const entry = this.cache.get(cacheKey);
    return entry ? isEntryStale(entry) : true;
  }

  /**
   * Set data in cache
   */
  set<T>(cacheKey: string, data: T, options?: CacheOptions): void {
    const entry = createCacheEntry<T>(data, options?.staleTime, options?.cacheTime);

    this.cache.set(cacheKey, entry);
  }

  /**
   * Delete data from cache
   */
  delete(cacheKey: string): boolean {
    return this.cache.delete(cacheKey);
  }

  /**
   * Check if cache has data for a key
   */
  has(cacheKey: string): boolean {
    return this.cache.has(cacheKey);
  }

  /**
   * Clear all cache data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Invalidate a specific cache key
   */
  invalidate(cacheKey: string): boolean {
    return this.cache.delete(cacheKey);
  }

  /**
   * Invalidate cache entries by predicate
   */
  invalidateMatching(predicate: (key: string) => boolean): void {
    const keys = this.cache.keys();
    keys.forEach(key => {
      if (predicate(key)) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Implements the SWR (Stale-While-Revalidate) pattern
   *
   * 1. If there's cached data that's not stale, return it
   * 2. If there's cached data that's stale, return it and trigger revalidation
   * 3. If there's no cached data, execute fetchFn and cache the result
   */
  async swr<T>(cacheKey: string, fetchFn: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const cacheEntry = this.getEntry<T>(cacheKey);

    // 1. No cached data - fetch, cache, and return
    if (!cacheEntry) {
      const data = await fetchFn();
      this.set(cacheKey, data, options);
      return data;
    }

    // 2. Cached data is fresh - return it directly
    if (!isEntryStale(cacheEntry) || cacheEntry.isRevalidating) {
      return cacheEntry.data;
    }

    // 3. Cached data is stale - return it and trigger revalidation if needed
    if (options?.revalidate !== false) {
      this.revalidateData(cacheKey, fetchFn, options);
    }

    return cacheEntry.data;
  }

  /**
   * Revalidate cache data in the background
   */
  private async revalidateData<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<void> {
    // Don't start another revalidation if one is already in progress
    if (this.revalidationMap.has(cacheKey)) {
      return;
    }

    // Mark entry as revalidating
    const entry = this.getEntry<T>(cacheKey);
    if (entry) {
      this.cache.update(cacheKey, { isRevalidating: true });
    }

    // Create revalidation promise
    const revalidatePromise = fetchFn()
      .then(data => {
        // Update cache with fresh data
        this.set(cacheKey, data, options);
      })
      .catch(error => {
        // Update entry to mark it's no longer revalidating
        const currentEntry = this.getEntry<T>(cacheKey);
        if (currentEntry) {
          this.cache.update(cacheKey, { isRevalidating: false });
        }

        console.error('Error during cache revalidation:', error);
      })
      .finally(() => {
        // Remove from revalidation map
        this.revalidationMap.delete(cacheKey);
      });

    // Add to revalidation map
    this.revalidationMap.set(cacheKey, revalidatePromise);

    // Execute the promise
    await revalidatePromise;
  }
}
