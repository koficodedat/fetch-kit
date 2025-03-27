// src/types/cache.ts

/**
 * Eviction policy types for memory cache
 */
export type EvictionPolicy = 'lru' | 'lfu' | 'ttl' | 'fifo';

/**
 * Options for cache configuration
 */
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
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Optional data validator function */
  validator?: (data: any) => boolean;
  /** Optional conditional function to determine if fetch should proceed */
  shouldFetch?: () => boolean | Promise<boolean>;
  /** Minimum time between re-validations of the same key in ms (throttling, default: 0) */
  throttleTime?: number;
  /** Time in ms to wait after last request before revalidating (debouncing, default: 0) */
  debounceTime?: number;
  /** Priority of the revalidation (1-10, higher is more important, default: 0) */
  priority?: number;
  /** Whether this entry should be proactively warmed (pre-fetched/kept fresh) */
  warmCache?: boolean;
  /** Interval in ms for refreshing warmed cache entries (default: 300000 - 5 minutes) */
  warmingInterval?: number;
  /**
   * Maximum memory size in bytes for the cache entry value
   * This is used to calculate the cache size for eviction policies
   */
  maxMemorySize?: number;
  /** The eviction policy to use for this specific cache entry */
  evictionPolicy?: EvictionPolicy;
  /** Whether to ignore global size constraints for this entry */
  ignoreGlobalConstraints?: boolean;
  /** A function to estimate the size of the cached item in bytes */
  sizeEstimator?: (value: any) => number;
}

/**
 * Structure for a cache entry with enhanced metadata
 */
export interface CacheEntry<T> {
  /** The cached data */
  data: T;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp when the entry becomes stale */
  staleAt: number;
  /** Timestamp when the entry expires (to be removed from cache) */
  expiresAt: number;
  /** Flag indicating if a revalidation is in progress */
  isRevalidating: boolean;
  /** Number of times this entry has been successfully revalidated */
  revalidationCount?: number;
  /** Timestamp of the last successful revalidation */
  lastRevalidatedAt?: number;
  /** Any error that occurred during the last revalidation attempt */
  lastError?: string;
  /** Number of times the cache entry has been accessed */
  accessCount?: number;
}

/**
 * Interface for cache storage implementations
 */
export interface CacheStorage {
  set<T>(key: string, entry: CacheEntry<T>): void;
  get<T>(key: string): CacheEntry<T> | undefined;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  keys(): string[];
}
