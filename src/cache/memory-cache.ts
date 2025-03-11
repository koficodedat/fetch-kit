// src/cache/memory-cache.ts

import { CacheEntry, isEntryExpired } from './cache-entry';

/**
 * In-memory cache implementation with TTL support
 */
export class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  /**
   * Set a value in the cache with metadata
   */
  set<T>(key: string, entry: CacheEntry<T>): void {
    this.cache.set(key, entry);
  }

  /**
   * Get a value from the cache
   * Returns undefined if not found or expired
   */
  get<T>(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    // Return undefined if entry not found
    if (!entry) {
      return undefined;
    }

    // Check if entry is expired, if so delete it and return undefined
    if (isEntryExpired(entry)) {
      this.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Check if a key exists in the cache and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if entry is expired
    if (isEntryExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Update a cache entry's metadata
   */
  update<T>(key: string, updates: Partial<CacheEntry<T>>): boolean {
    const entry = this.get<T>(key);

    if (!entry) {
      return false;
    }

    this.set(key, { ...entry, ...updates });
    return true;
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Remove all expired entries from the cache
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}
