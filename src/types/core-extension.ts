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
}

/**
 * Extended FetchKit configuration including caching and deduplication
 */
export type ExtendedFetchKitConfig = BaseFetchKitConfig & FetchKitConfigExtension;

/**
 * Cache-related methods for FetchKit
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
