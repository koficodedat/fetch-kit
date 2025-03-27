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
  /** Maximum number of retry attempts for failed re-validations (default: 3) */
  maxRetries?: number;
  /** Delay in ms between retry attempts (default: exponential backoff) */
  retryDelay?: number | ((attempt: number, error: Error) => number);
  /** Timeout in ms for fetch operations (default: 30000) */
  timeout?: number;
  /** Function to check if data is still valid and can be used (default: none) */
  validator?: (data: any) => boolean;
  /** Optional conditional function to determine if fetch should proceed */
  shouldFetch?: () => boolean | Promise<boolean>;
  /** Minimum time between re-validations of the same key in ms (throttling, default: 0) */
  throttleTime?: number;
  /** Time in ms to wait after last request before revalidating (debouncing, default: 0) */
  debounceTime?: number;
  /** Priority level for revalidation queue (higher numbers = higher priority, default: 0) */
  priority?: number;
  /** Whether this cache entry should be proactively warmed (pre-fetched/kept fresh) */
  warmCache?: boolean;
  /** Interval in ms for refreshing warmed cache entries (default: 300000 - 5 minutes) */
  warmingInterval?: number;
}

/**
 * Cache manager with SWR (Stale-While-Revalidate) logic
 */
export interface InvalidationHook {
  (cacheKey: string): void;
}

/** Revalidation queue item for priority-based revalidation */
interface RevalidationQueueItem<T> {
  cacheKey: string;
  fetchFn: () => Promise<T>;
  options?: CacheOptions;
  priority: number;
  timestamp: number;
}

export class CacheManager {
  private cache: MemoryCache;
  private revalidationMap: Map<string, Promise<any>> = new Map();
  private globalCacheOptions: CacheOptions;
  private invalidationHooks: Set<InvalidationHook> = new Set();
  private invalidationGroups: Map<string, (string | RegExp)[]> = new Map();
  private lastRevalidationTimes: Map<string, number> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private revalidationQueue: RevalidationQueueItem<any>[] = [];
  private isProcessingQueue: boolean = false;
  private warmingRegistry = new Map<
    string,
    {
      fetchFn: () => Promise<any>;
      options: CacheOptions;
      intervalId?: NodeJS.Timeout;
    }
  >();
  private defaultWarmingInterval: number = 300000; // 5 minutes

  constructor(globalCacheOptions?: CacheOptions) {
    this.cache = new MemoryCache();
    this.globalCacheOptions = globalCacheOptions || {};

    // Run cache cleanup periodically
    setInterval(() => {
      this.cache.cleanup();
    }, 60000); // Every minute

    // Process the revalidation queue periodically
    setInterval(() => {
      this.processRevalidationQueue();
    }, 200); // Process queue every 200ms

    // Cache warming is initialized on-demand when registerCacheWarming is called
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
    // Clear cache warming timers
    for (const entry of this.warmingRegistry.values()) {
      if (entry.intervalId) {
        clearInterval(entry.intervalId);
      }
    }
    this.warmingRegistry.clear();

    // Clear the cache
    this.cache.clear();
  }

  /**
   * Invalidate a specific cache key with optional event emission
   * @param cacheKey - The key to invalidate
   * @param options - Invalidation options
   * @returns true if an entry was found and invalidated
   */
  invalidate(
    cacheKey: string,
    options?: {
      silent?: boolean; // If true, doesn't emit invalidation events
      cascade?: boolean; // If true, also invalidates related entries
      related?: string[] | RegExp; // Related keys or pattern for cascading invalidation
      validator?: (entry: any) => boolean; // Function to validate whether entry should be invalidated
    },
  ): boolean {
    const { silent = false, cascade = false, related, validator } = options || {};

    // Get the entry before deleting it to check validity and track stats
    const entry = this.getEntry(cacheKey);

    // If entry doesn't exist or doesn't pass validation, skip invalidation
    if (!entry || (validator && !validator(entry.data))) {
      return false;
    }

    // Perform the actual invalidation
    const deleted = this.cache.delete(cacheKey);

    // Emit invalidation event if not silent
    if (deleted && !silent) {
      this.emitInvalidationEvent(cacheKey, entry);
    }

    // Handle cascading invalidation
    if (cascade && deleted) {
      if (related instanceof RegExp) {
        this.invalidateByPattern(related, { silent, validator });
      } else if (Array.isArray(related)) {
        related.forEach(key => this.invalidate(key, { silent, validator }));
      }
    }

    return deleted;
  }

  /**
   * Invalidate cache entries by predicate function
   * @param predicate - Function that returns true for keys to invalidate
   * @param options - Invalidation options
   */
  invalidateMatching(
    predicate: (key: string) => boolean,
    options?: {
      silent?: boolean;
      validator?: (entry: any) => boolean; // Function to validate whether entry should be invalidated
    },
  ): number {
    const { silent = false, validator } = options || {};
    const keys = this.cache.keys();
    let invalidatedCount = 0;

    keys.forEach(key => {
      if (predicate(key)) {
        // Get the entry before deleting to check validity
        const entry = this.getEntry(key);

        // Skip if entry doesn't exist or doesn't pass validation
        if (!entry || (validator && !validator(entry.data))) {
          return;
        }

        const deleted = this.cache.delete(key);
        if (deleted) {
          invalidatedCount++;

          // Emit invalidation event if not silent
          if (!silent) {
            this.emitInvalidationEvent(key, entry);
          }
        }
      }
    });

    return invalidatedCount;
  }

  /**
   * Invalidate cache entries matching a pattern
   * @param pattern - Regular expression pattern to match against cache keys
   * @param options - Invalidation options
   */
  invalidateByPattern(
    pattern: RegExp,
    options?: {
      silent?: boolean;
      validator?: (entry: any) => boolean;
    },
  ): number {
    return this.invalidateMatching(key => pattern.test(key), options);
  }

  /**
   * Invalidate cache entries after a mutation operation (POST, PUT, DELETE)
   * @param mutationUrl - The URL of the mutation operation
   * @param options - Invalidation options
   */
  /**
   * Invalidate cache entries after a mutation operation (POST, PUT, DELETE)
   * @param mutationUrl - The URL of the mutation operation
   * @param options - Invalidation options
   */
  invalidateAfterMutation(
    mutationUrl: string,
    options?: {
      resourceType?: string; // Resource type to invalidate (e.g., 'users', 'posts')
      relatedPatterns?: RegExp[]; // Additional patterns to invalidate
      silent?: boolean; // If true, doesn't emit invalidation events
      validator?: (entry: any) => boolean; // Function to validate whether entry should be invalidated
      exactMatch?: boolean; // If true, invalidates only the exact URL
      invalidateList?: boolean; // If true, also invalidates list endpoints of the same resource
      invalidateAll?: boolean; // If true, invalidates all resources of the same type
    },
  ): number {
    const {
      resourceType: explicitResourceType,
      relatedPatterns = [],
      silent = false,
      validator,
      exactMatch = false,
      invalidateList = true,
      invalidateAll = false,
    } = options || {};

    let invalidatedCount = 0;

    try {
      // Determine the resource type either from options or URL
      const resourceType = explicitResourceType || this.getResourceTypeFromUrl(mutationUrl);

      // Get auto-generated patterns based on URL structure (unless exactMatch is true)
      const autoPatterns = !exactMatch ? this.getRelatedPatternsFromUrl(mutationUrl) : [];

      // If we have no resource type, we can only process patterns
      if (!resourceType) {
        // Process any explicitly provided patterns
        for (const pattern of [...relatedPatterns, ...autoPatterns]) {
          invalidatedCount += this.invalidateByPattern(pattern, { silent, validator });
        }
        return invalidatedCount;
      }

      // Extract resource ID if present in the URL
      const resourceId = this.getResourceIdFromUrl(mutationUrl, resourceType);

      // Handle exactMatch case (only invalidate the specific resource)
      if (exactMatch && resourceId) {
        const specificResourceKey = `${resourceType}/${resourceId}`;
        if (this.invalidate(specificResourceKey, { silent, validator })) {
          invalidatedCount++;
        }
        return invalidatedCount; // Return early, don't invalidate anything else
      }

      // Specific invalidation cases (most common scenario)
      if (resourceId && !invalidateAll) {
        // Invalidate the specific resource
        const specificResourceKey = `${resourceType}/${resourceId}`;
        if (this.invalidate(specificResourceKey, { silent, validator })) {
          invalidatedCount++;
        }

        // Invalidate resource list if requested
        if (invalidateList) {
          const listKey = `${resourceType}`;
          if (this.invalidate(listKey, { silent, validator })) {
            invalidatedCount++;
          }
        }

        // Invalidate any nested resources - but don't invalidate sibling resources
        const nestedPattern = new RegExp(`^${resourceType}/${resourceId}/`);
        invalidatedCount += this.invalidateByPattern(nestedPattern, { silent, validator });
      }
      // Global invalidation for the resource type
      else if (invalidateAll) {
        // Use a pattern that matches all entries of this resource type
        const resourcePattern = new RegExp(`^${resourceType}`);
        invalidatedCount += this.invalidateByPattern(resourcePattern, { silent, validator });
      }

      // Process all patterns - both auto-generated and explicitly provided
      for (const pattern of [...relatedPatterns, ...autoPatterns]) {
        invalidatedCount += this.invalidateByPattern(pattern, { silent, validator });
      }
    } catch (error) {
      console.error('Error in invalidateAfterMutation:', error);
    }

    return invalidatedCount;
  }

  /**
   * Extract resource type from a URL
   * @private
   */
  private getResourceTypeFromUrl(url: string): string | null {
    try {
      // Remove protocol, domain, and leading/trailing slashes
      const cleanUrl = this.normalizeUrl(url);

      // Split the path and get the first meaningful segment
      const segments = cleanUrl.split('/').filter(Boolean);
      if (segments.length > 0) {
        return segments[0];
      }
    } catch (error) {
      console.error('Error extracting resource type from URL:', error);
    }

    return null;
  }

  /**
   * Extract resource ID from a URL given the resource type
   * @private
   */
  private getResourceIdFromUrl(url: string, resourceType: string): string | null {
    try {
      // Clean the URL first to remove protocol, domain, and query params
      const cleanUrl = this.normalizeUrl(url);

      // Safely escape the resource type for regex
      const escapedType = resourceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Match the ID that comes after the resource type
      const pattern = `${escapedType}\/(\w+)`;
      const regex = new RegExp(pattern);
      const match = cleanUrl.match(regex);

      if (match && match[1]) {
        return match[1];
      }
    } catch (error) {
      console.error('Error extracting resource ID from URL:', error);
    }

    return null;
  }

  /**
   * Generate related patterns based on a URL
   * @private
   */
  private getRelatedPatternsFromUrl(url: string): RegExp[] {
    const patterns: RegExp[] = [];
    const resourceType = this.getResourceTypeFromUrl(url);

    if (resourceType) {
      // Add pattern for all resources of this type
      patterns.push(new RegExp(`^${resourceType}\/`));

      // If URL contains an ID, add pattern for related nested resources
      const resourceId = this.getResourceIdFromUrl(url, resourceType);
      if (resourceId) {
        patterns.push(new RegExp(`^${resourceType}\/${resourceId}\/`));
      }
    }

    return patterns;
  }

  /**
   * Normalize a URL to match how it might be stored in cache
   * Removes protocol, domain, /api prefix, trailing slashes, and query parameters
   * @public
   */
  normalizeUrl(url: string): string {
    // Remove protocol, domain, and trailing slashes
    return url
      .replace(/^(?:https?:\/\/)?(?:[^\/]+)?(?:\/api)?\/?/, '')
      .replace(/\/?/, '')
      .replace(/\?.*$/, '');
  }

  /**
   * Set up time-based auto-invalidation for a cache key
   * @param cacheKey - The key to auto-invalidate
   * @param timeMs - Time in milliseconds after which to invalidate
   * @param options - Auto-invalidation options
   */
  setAutoInvalidation(
    cacheKey: string,
    timeMs: number,
    options?: {
      silent?: boolean;
    },
  ): void {
    const { silent = false } = options || {};

    setTimeout(() => {
      this.invalidate(cacheKey, { silent });
    }, timeMs);
  }

  /**
   * Register a group of related cache keys
   * @param groupName - Name of the invalidation group
   * @param keys - Array of cache keys or patterns in the group
   */
  registerInvalidationGroup(groupName: string, keys: (string | RegExp)[]): void {
    this.invalidationGroups.set(groupName, keys);
  }

  /**
   * Invalidate an entire group of cache entries
   * @param groupName - Name of the invalidation group to invalidate
   * @param options - Invalidation options
   */
  invalidateGroup(
    groupName: string,
    options?: {
      silent?: boolean;
      validator?: (entry: any) => boolean;
      cascade?: boolean;
    },
  ): number {
    const { silent = false, validator, cascade = false } = options || {};
    const group = this.invalidationGroups.get(groupName);

    if (!group) {
      return 0;
    }

    let invalidatedCount = 0;

    group.forEach(keyOrPattern => {
      if (typeof keyOrPattern === 'string') {
        if (this.invalidate(keyOrPattern, { silent, validator, cascade })) {
          invalidatedCount++;
        }
      } else if (keyOrPattern instanceof RegExp) {
        invalidatedCount += this.invalidateByPattern(keyOrPattern, { silent, validator });
      }
    });

    // Emit group invalidation event if not silent
    if (!silent && invalidatedCount > 0) {
      this.emitGroupInvalidationEvent(groupName, invalidatedCount);
    }

    return invalidatedCount;
  }

  /**
   * Emit a group invalidation event
   * @param groupName - The invalidated group name
   * @param count - Number of entries invalidated
   */
  private emitGroupInvalidationEvent(groupName: string, count: number): void {
    const event = new CustomEvent('fetchkit:group-invalidated', {
      detail: {
        groupName,
        invalidatedCount: count,
      },
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(event);
    }
  }

  /**
   * Add an invalidation hook that will be called when cache entries are invalidated
   * @param hook - Function to call when a cache entry is invalidated
   * @returns An unsubscribe function to remove the hook
   */
  onInvalidate(hook: InvalidationHook): () => void {
    this.invalidationHooks.add(hook);

    // Return an unsubscribe function
    return () => {
      this.invalidationHooks.delete(hook);
    };
  }

  /**
   * Remove an invalidation hook
   * @param hook - The hook to remove
   * @returns true if the hook was found and removed
   */
  removeInvalidationHook(hook: InvalidationHook): boolean {
    return this.invalidationHooks.delete(hook);
  }

  /**
   * Clear all invalidation hooks
   */
  clearInvalidationHooks(): void {
    this.invalidationHooks.clear();
  }

  /**
   * Emit an invalidation event
   * @param cacheKey - The invalidated cache key
   * @param entry - The cache entry that was invalidated
   */
  private emitInvalidationEvent(cacheKey: string, entry?: CacheEntry<any>): void {
    const event = new CustomEvent('fetchkit:invalidated', {
      detail: {
        cacheKey,
        data: entry?.data,
        metadata: {
          createdAt: entry?.createdAt,
          staleAt: entry?.staleAt,
          expiresAt: entry?.expiresAt,
          revalidationCount: entry?.revalidationCount,
          lastRevalidatedAt: entry?.lastRevalidatedAt,
          accessCount: entry?.accessCount,
        },
      },
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(event);
    }

    // Call any registered invalidation hooks
    this.invalidationHooks.forEach(hook => {
      try {
        hook(cacheKey);
      } catch (error) {
        console.error('Error in invalidation hook:', error);
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
   * Revalidate cache data in the background with retry mechanism, throttling, debouncing, and priority queue
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

    // Extract revalidation options
    const mergedOptions = {
      ...this.globalCacheOptions,
      ...options,
    };

    const maxRetries = mergedOptions?.maxRetries ?? 3;
    const retryDelay = mergedOptions?.retryDelay ?? this.getDefaultRetryDelay;
    const timeout = mergedOptions?.timeout ?? 30000;
    const validator = mergedOptions?.validator;
    const throttleTime = mergedOptions?.throttleTime ?? 0;
    const debounceTime = mergedOptions?.debounceTime ?? 0;
    const priority = mergedOptions?.priority ?? 0;

    // Apply throttling - skip if it's too soon to revalidate again
    if (throttleTime > 0) {
      const lastRevalidation = this.lastRevalidationTimes.get(cacheKey) || 0;
      const timeSinceLastRevalidation = Date.now() - lastRevalidation;

      if (timeSinceLastRevalidation < throttleTime) {
        console.debug(
          `Skipping revalidation for ${cacheKey} due to throttling (${timeSinceLastRevalidation}ms < ${throttleTime}ms)`,
        );
        return;
      }
    }

    // Apply debouncing - cancel previous timer and set a new one
    if (debounceTime > 0) {
      // Clear any existing debounce timer
      const existingTimer = this.debounceTimers.get(cacheKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set a new debounce timer
      const timer = setTimeout(() => {
        this.debounceTimers.delete(cacheKey);
        this.addToRevalidationQueue(cacheKey, fetchFn, mergedOptions, priority);
      }, debounceTime);

      this.debounceTimers.set(cacheKey, timer);
      return;
    }

    // If no debouncing, add directly to the queue with specified priority
    if (priority > 0) {
      this.addToRevalidationQueue(cacheKey, fetchFn, mergedOptions, priority);
      return;
    }

    // For immediate processing (priority=0, no debouncing), mark as revalidating and proceed
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

    // Update last revalidation time for throttling
    this.lastRevalidationTimes.set(cacheKey, Date.now());

    // Add to revalidation map
    this.revalidationMap.set(cacheKey, revalidatePromise);

    // Execute the promise
    await revalidatePromise;
  }

  /**
   * Add an item to the revalidation priority queue
   */
  private addToRevalidationQueue<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions,
    priority: number,
  ): void {
    // Create queue item
    const queueItem: RevalidationQueueItem<T> = {
      cacheKey,
      fetchFn,
      options,
      priority,
      timestamp: Date.now(),
    };

    // Add to queue
    this.revalidationQueue.push(queueItem);

    // Sort queue by priority (descending) and then by timestamp (ascending)
    this.revalidationQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.timestamp - b.timestamp; // Older requests first within same priority
    });

    // Start processing the queue if not already processing
    if (!this.isProcessingQueue) {
      this.processRevalidationQueue();
    }
  }

  /**
   * Register a cache key to be warmed (pre-fetched) at regular intervals
   * @param cacheKey The cache key to warm
   * @param fetchFn The function to fetch the data
   * @param options Optional cache options including warming interval
   */
  registerCacheWarming<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions,
  ): void {
    console.debug('Registering cache warming for key:', cacheKey);

    // Remove any existing warming for this key
    this.unregisterCacheWarming(cacheKey);

    // Merge options with defaults
    const mergedOptions = {
      ...this.globalCacheOptions,
      ...options,
      warmCache: true,
    };

    // Set the warming interval (use provided, default, or 5 minutes)
    const interval = mergedOptions.warmingInterval || this.defaultWarmingInterval;

    // Immediately warm the cache
    this.warmCache(cacheKey, fetchFn, mergedOptions);

    // Set up interval for regular warming
    const intervalId = setInterval(() => {
      this.warmCache(cacheKey, fetchFn, mergedOptions);
    }, interval);

    // Register the warming entry
    this.warmingRegistry.set(cacheKey, {
      fetchFn,
      options: mergedOptions,
      intervalId,
    });

    console.debug(`Registered cache warming for key: ${cacheKey} with interval: ${interval}ms`);
  }

  /**
   * Unregister a cache key from warming
   * @param cacheKey The cache key to stop warming
   */
  unregisterCacheWarming(cacheKey: string): void {
    const entry = this.warmingRegistry.get(cacheKey);
    if (entry?.intervalId) {
      clearInterval(entry.intervalId);
      this.warmingRegistry.delete(cacheKey);
      console.debug(`Unregistered cache warming for key: ${cacheKey}`);
    }
  }

  /**
   * Get all currently warmed cache keys
   * @returns Array of cache keys that are being warmed
   */
  getWarmedCacheKeys(): string[] {
    return Array.from(this.warmingRegistry.keys());
  }

  /**
   * Warm a specific cache entry by fetching its data
   * @param cacheKey The cache key to warm
   * @param fetchFn The function to fetch the data
   * @param options Optional cache options
   */
  private async warmCache<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<void> {
    try {
      console.debug(`Warming cache for key: ${cacheKey}`);
      // Use swr to populate the cache, which will invoke fetchFn
      await this.swr(cacheKey, fetchFn, options);
    } catch (error) {
      console.error(`Error warming cache for key: ${cacheKey}:`, error);
    }
  }

  /**
   * Process items in the revalidation queue based on priority
   */
  private async processRevalidationQueue(): Promise<void> {
    if (this.isProcessingQueue || this.revalidationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Get the highest priority item
      const item = this.revalidationQueue.shift();
      if (!item) {
        return;
      }

      // Skip if a revalidation is already in progress for this key
      if (this.revalidationMap.has(item.cacheKey)) {
        return;
      }

      const { cacheKey, fetchFn, options } = item;

      // Mark entry as revalidating
      const entry = this.getEntry(cacheKey);
      if (entry) {
        this.cache.update(cacheKey, { isRevalidating: true });
      }

      // Extract retry options
      const maxRetries = options?.maxRetries ?? 3;
      const retryDelay = options?.retryDelay ?? this.getDefaultRetryDelay;
      const timeout = options?.timeout ?? 30000;
      const validator = options?.validator;

      // Create revalidation promise with retry logic
      const executeWithRetry = async (attempt = 0): Promise<any> => {
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
          // Update last revalidation time for throttling
          this.lastRevalidationTimes.set(cacheKey, Date.now());

          // Get current entry (if any)
          const currentEntry = this.getEntry(cacheKey);

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
          const currentEntry = this.getEntry(cacheKey);
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

          // Continue processing the queue
          this.isProcessingQueue = false;
          this.processRevalidationQueue();
        });

      // Add to revalidation map
      this.revalidationMap.set(cacheKey, revalidatePromise);
    } catch (error) {
      console.error('Error processing revalidation queue:', error);
      this.isProcessingQueue = false;
    }
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
