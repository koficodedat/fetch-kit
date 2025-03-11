// src/types/core-extension.ts

import { CacheOptions } from './cache';
import { FetchKitConfig as BaseFetchKitConfig, RequestOptions as BaseRequestOptions } from './core';

/**
 * Extension to the base RequestOptions with additional caching properties
 */
export interface RequestOptionsExtension {
  /**
   * Custom caching options for FetchKit's SWR cache
   */
  cacheOptions?: CacheOptions | boolean;
}

/**
 * Extended request options including caching
 */
export type ExtendedRequestOptions = BaseRequestOptions & RequestOptionsExtension;

/**
 * Extension to the base FetchKitConfig with additional caching properties
 */
export interface FetchKitConfigExtension {
  /**
   * Default cache options for all requests
   */
  cacheOptions?: CacheOptions;
}

/**
 * Extended FetchKit configuration including caching
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
