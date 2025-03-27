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
  /** Maximum number of retry attempts for failed revalidations (default: 3) */
  maxRetries?: number;
  /** Delay in ms between retry attempts (default: exponential backoff) */
  retryDelay?: number | ((attempt: number, error: Error) => number);
  /** Timeout in ms for fetch operations (default: 30000) */
  timeout?: number;
  /** Function to check if data is still valid and can be used (default: none) */
  validator?: (data: any) => boolean;
  /** Optional conditional function to determine if fetch should proceed */
  shouldFetch?: () => boolean | Promise<boolean>;
}

/**
 * Cache manager with SWR (Stale-While-Revalidate) logic
 */
export class CacheManager {
  private cache: MemoryCache;
  private revalidationMap: Map<string, Promise<any>> = new Map();
  private globalCacheOptions: CacheOptions;

  constructor(globalCacheOptions?: CacheOptions) {
    this.cache = new MemoryCache();
    this.globalCacheOptions = globalCacheOptions || {};

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
   * Implements the SWR (Stale-While-Revalidate) pattern with enhanced features
   *
   * 1. If there's cached data that's not stale, return it
   * 2. If there's cached data that's stale, verify its validity, return it and trigger revalidation
   * 3. If there's no cached data, conditionally execute fetchFn and cache the result
   * 4. Handles errors, retries, and timeouts for robust operation
   */
  async swr<T>(cacheKey: string, fetchFn: () => Promise<T>, options?: CacheOptions): Promise<T> {
    // Process options with defaults, merging global options
    const mergedOptions = {
      ...this.globalCacheOptions,
      ...options,
    };

    const { revalidate = true, validator, shouldFetch, timeout = 30000 } = mergedOptions;

    const cacheEntry = this.getEntry<T>(cacheKey);

    // Update access count if entry exists
    if (cacheEntry) {
      this.cache.update(cacheKey, {
        accessCount: (cacheEntry.accessCount || 0) + 1,
      });
    }

    // Apply data validator if provided
    if (cacheEntry && validator && !validator(cacheEntry.data)) {
      // Data failed validation, remove it from cache
      this.delete(cacheKey);
      // Proceed as if there was no cache entry
    } else if (cacheEntry) {
      // Check if data is fresh
      const isFresh = !isEntryStale(cacheEntry);

      // Return fresh data immediately
      if (isFresh) {
        return cacheEntry.data;
      }

      // For stale data, initiate revalidation if needed
      if (revalidate && !cacheEntry.isRevalidating) {
        // Check if we should fetch based on conditional logic
        const shouldProceedWithFetch = shouldFetch ? await Promise.resolve(shouldFetch()) : true;

        if (shouldProceedWithFetch) {
          // Revalidate in background with timeout and retry support
          this.revalidateData(cacheKey, fetchFn, options);
        }
      }

      // Return stale data while revalidating
      return cacheEntry.data;
    }

    // No cache entry exists, check if we should fetch
    const shouldProceedWithFetch = shouldFetch ? await Promise.resolve(shouldFetch()) : true;
    if (!shouldProceedWithFetch) {
      throw new Error('Fetch condition not met and no cached data available');
    }

    // Fetch with timeout and retry support
    try {
      // Always try to fetch - this ensures errorFetch gets called in tests
      const fetchPromise = fetchFn();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout);
      });

      // Race between fetch and timeout
      const data = await Promise.race([fetchPromise, timeoutPromise]);

      // Validate fetched data if validator provided
      if (validator && !validator(data)) {
        throw new Error('Fetched data failed validation');
      }

      // Cache the successful result
      this.set(cacheKey, data, mergedOptions);
      return data;
    } catch (error: Error | unknown) {
      // Log the error
      console.error(`Error fetching data for cache key ${cacheKey}:`, error);

      // If we have stale data, return it even though the refresh failed
      if (cacheEntry) {
        // Mark as not revalidating since it failed
        this.cache.update(cacheKey, {
          isRevalidating: false,
          lastError: error instanceof Error ? error.message : 'Unknown error',
        });
        return cacheEntry.data;
      }

      // Rethrow if we have no fallback data
      throw error;
    }
  }

  /**
   * Revalidate cache data in the background with retry mechanism
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

    // Extract retry options
    const mergedOptions = {
      ...this.globalCacheOptions,
      ...options,
    };

    const maxRetries = mergedOptions?.maxRetries ?? 3;
    const retryDelay = mergedOptions?.retryDelay ?? this.getDefaultRetryDelay;
    const timeout = mergedOptions?.timeout ?? 30000;
    const validator = mergedOptions?.validator;

    // Mark entry as revalidating
    const entry = this.getEntry<T>(cacheKey);
    if (entry) {
      this.cache.update(cacheKey, { isRevalidating: true });
    }

    // Create revalidation promise with retry logic
    const executeWithRetry = async (attempt = 0): Promise<T> => {
      try {
        // Setup timeout
        const fetchPromise = fetchFn();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Revalidation timeout after ${timeout}ms`)), timeout);
        });

        // Race between fetch and timeout
        const data = await Promise.race([fetchPromise, timeoutPromise]);

        // Validate fetched data if validator provided
        if (validator && !validator(data)) {
          throw new Error('Revalidated data failed validation');
        }

        return data;
      } catch (error) {
        // If we've reached max retries, throw the error
        if (attempt >= maxRetries) {
          throw error;
        }

        // Calculate delay for next retry
        const delay =
          typeof retryDelay === 'function' ? retryDelay(attempt, error as Error) : retryDelay;

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));

        // Recursively retry
        return executeWithRetry(attempt + 1);
      }
    };

    // Create revalidation promise
    const revalidatePromise = executeWithRetry()
      .then(data => {
        // Get current entry (if any)
        const currentEntry = this.getEntry<T>(cacheKey);

        // Update cache with fresh data
        this.set(cacheKey, data, options);

        // Update revalidation metadata
        if (currentEntry) {
          this.cache.update(cacheKey, {
            isRevalidating: false,
            revalidationCount: (currentEntry.revalidationCount || 0) + 1,
            lastRevalidatedAt: Date.now(),
          });
        }

        // Emit a custom event for successful revalidation
        const event = new CustomEvent('fetchkit:revalidated', {
          detail: { cacheKey, success: true },
        });
        if (typeof window !== 'undefined') window.dispatchEvent(event);
      })
      .catch(error => {
        // Update entry to mark it's no longer revalidating
        const currentEntry = this.getEntry<T>(cacheKey);
        if (currentEntry) {
          this.cache.update(cacheKey, { isRevalidating: false });
        }

        console.error(`Error during cache revalidation (key: ${cacheKey}):`, error);

        // Emit a custom event for failed revalidation
        const event = new CustomEvent('fetchkit:revalidation-error', {
          detail: { cacheKey, error, attempts: maxRetries },
        });
        if (typeof window !== 'undefined') window.dispatchEvent(event);
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

  /**
   * Default exponential backoff strategy for retries
   */
  private getDefaultRetryDelay(attempt: number, _error: Error): number {
    // Exponential backoff: 2^n * 100ms, capped at 30 seconds
    return Math.min(Math.pow(2, attempt) * 100, 30000);
  }

  /**
   * Verify if entry is fresh and valid
   */
  isDataFresh<T>(cacheKey: string, validator?: (data: T) => boolean): boolean {
    const entry = this.getEntry<T>(cacheKey);
    if (!entry) return false;

    // Check staleness
    const isFresh = !isEntryStale(entry);

    // Apply validator if provided
    if (validator && !validator(entry.data)) {
      return false;
    }

    return isFresh;
  }
}
