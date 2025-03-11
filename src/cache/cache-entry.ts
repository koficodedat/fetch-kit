// src/cache/cache-entry.ts

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
 * Creates a new cache entry
 * @param data The data to cache
 * @param staleTime Time in ms until the data becomes stale (default: 0 - immediately stale)
 * @param cacheTime Time in ms until the data expires (default: 5 minutes)
 * @returns A new cache entry with metadata
 */
export function createCacheEntry<T>(
  data: T,
  staleTime = 0,
  cacheTime = 5 * 60 * 1000,
): CacheEntry<T> {
  const now = Date.now();

  return {
    data,
    createdAt: now,
    staleAt: now + staleTime,
    expiresAt: now + cacheTime,
    isRevalidating: false,
  };
}

/**
 * Checks if a cache entry is stale
 */
export function isEntryStale<T>(entry: CacheEntry<T>): boolean {
  return Date.now() > entry.staleAt;
}

/**
 * Checks if a cache entry is expired
 */
export function isEntryExpired<T>(entry: CacheEntry<T>): boolean {
  return Date.now() > entry.expiresAt;
}
