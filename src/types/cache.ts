// src/types/cache.ts

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
}

/**
 * Structure for a cache entry with metadata
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
