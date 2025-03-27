// src/types/core-extension.ts

import { CacheOptions } from './cache';
import { FetchKitConfig as BaseFetchKitConfig, RequestOptions as BaseRequestOptions } from './core';

/**
 * Extension to the base RequestOptions with additional properties
 */
export interface RequestOptionsExtension {
  /**
   * Custom caching options for FetchKit's SWR cache
   */
  cacheOptions?: CacheOptions | boolean;

  /**
   * Whether to deduplicate identical in-flight requests
   */
  deduplicate?: boolean;
}

/**
 * Extended request options including caching and deduplication
 */
export type ExtendedRequestOptions = BaseRequestOptions & RequestOptionsExtension;

/**
 * Extension to the base FetchKitConfig with additional properties
 */
export interface FetchKitConfigExtension {
  /**
   * Default cache options for all requests
   */
  cacheOptions?: CacheOptions;

  /**
   * Whether to deduplicate identical in-flight requests by default
   */
  deduplicate?: boolean;

  /**
   * Maximum number of items in cache (for count-based eviction)
   */
  maxItems?: number;

  /**
   * Maximum cache size in bytes (for size-based eviction)
   */
  maxSize?: number;

  /**
   * Cleanup interval in milliseconds (default: 60000)
   */
  cleanupInterval?: number;
}

/**
 * Extended FetchKit configuration including caching and deduplication
 */
export type ExtendedFetchKitConfig = BaseFetchKitConfig & FetchKitConfigExtension;

/**
 * Basic cache-related methods for FetchKit
 */
export interface CacheMethods {
  /**
   * Invalidate a specific cache entry or all entries
   */
  invalidateCache: (cacheKey?: string) => void;

  /**
   * Invalidate cache entries that match a predicate
   */
  invalidateCacheMatching: (predicate: (key: string) => boolean) => void;

  /**
   * Get the cache key for a request
   */
  getCacheKey: (url: string, options?: ExtendedRequestOptions) => string;
}

/**
 * Advanced cache-related methods for FetchKit's SWR implementation
 */
export interface AdvancedCacheMethods {
  /**
   * Register a URL for cache warming (proactive refreshing)
   * The URL will be automatically refreshed at specified intervals
   */
  registerCacheWarming: (url: string, options?: ExtendedRequestOptions) => void;

  /**
   * Unregister a URL from cache warming
   */
  unregisterCacheWarming: (url: string, options?: ExtendedRequestOptions) => void;

  /**
   * Get all cache keys that are currently being warmed
   */
  getWarmedCacheKeys: () => string[];

  /**
   * Manually revalidate a cached URL
   */
  revalidateCache: (url: string, options?: ExtendedRequestOptions) => Promise<void>;

  /**
   * Get the full cache entry including metadata for a URL
   */
  getCacheEntry: (
    url: string,
    options?: ExtendedRequestOptions,
  ) => { data: any; metadata: any } | undefined;

  /**
   * Check if a cached URL is stale
   */
  isCacheStale: (url: string, options?: ExtendedRequestOptions) => boolean;

  /**
   * Manually set data in the cache for a URL
   */
  setCacheData: (url: string, data: any, options?: ExtendedRequestOptions) => void;
}

/**
 * Deduplication-related methods for FetchKit
 */
export interface DeduplicationMethods {
  /**
   * Get the total number of in-flight requests
   */
  getInFlightRequestsCount: () => number;

  /**
   * Get the keys of all in-flight requests
   */
  getInFlightRequestKeys: () => string[];

  /**
   * Check if a specific request is currently in flight
   */
  isRequestInFlight: (cacheKey: string) => boolean;

  /**
   * Clear all tracked in-flight requests
   */
  cancelInFlightRequests: () => void;
}
