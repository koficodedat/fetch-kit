// src/cache/memory-cache.ts

import { CacheEntry, isEntryExpired } from './cache-entry';

/**
 * Eviction policy types for memory cache
 */
export type EvictionPolicy = 'lru' | 'lfu' | 'ttl' | 'fifo';

/**
 * Size estimator function to calculate size of cached items
 */
export type SizeEstimator<T> = (entry: CacheEntry<T>) => number;

/**
 * Default size estimator that uses JSON.stringify to estimate size
 */
export const defaultSizeEstimator: SizeEstimator<any> = entry => {
  try {
    return JSON.stringify(entry).length * 2; // Approximate size in bytes (UTF-16)
  } catch {
    return 1024; // Fallback size if can't be stringified
  }
};

/**
 * Options for memory cache configuration
 */
export interface MemoryCacheOptions {
  /** Maximum number of entries allowed in cache (0 = unlimited) */
  maxEntries?: number;
  /** Maximum size in bytes allowed in cache (0 = unlimited) */
  maxSize?: number;
  /** Eviction policy to use when cache is full */
  evictionPolicy?: EvictionPolicy;
  /** Function to estimate size of entries */
  sizeEstimator?: SizeEstimator<any>;
  /** How often to run automatic cleanup (in ms, 0 = disabled) */
  cleanupInterval?: number;
}

/**
 * Cache usage statistics
 */
export interface CacheStats {
  /** Current number of entries in cache */
  entryCount: number;
  /** Current estimated size in bytes */
  size: number;
  /** Maximum allowed size in bytes */
  maxSize: number;
  /** Maximum allowed entries */
  maxEntries: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of evictions performed */
  evictions: number;
  /** Number of items expired */
  expirations: number;
  /** Hit ratio (hits / (hits + misses)) */
  hitRatio: number;
}

/**
 * Metadata for cache usage tracking
 */
interface EntryMetadata {
  /** Creation timestamp */
  created: number;
  /** Last access timestamp */
  lastAccessed: number;
  /** Access count */
  accessCount: number;
  /** Estimated size in bytes */
  size: number;
}

/**
 * In-memory cache implementation with size limits and eviction policies
 */
export class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private metadata: Map<string, EntryMetadata> = new Map();
  private maxEntries: number;
  private maxSize: number;
  private currentSize: number = 0;
  private evictionPolicy: EvictionPolicy;
  private sizeEstimator: SizeEstimator<any>;
  private cleanupTimer?: NodeJS.Timeout;

  // Stats tracking
  private stats: CacheStats;

  /**
   * Create a new memory cache with specified options
   */
  constructor(options: MemoryCacheOptions = {}) {
    this.maxEntries = options.maxEntries || 0; // 0 = unlimited
    this.maxSize = options.maxSize || 0; // 0 = unlimited
    this.evictionPolicy = options.evictionPolicy || 'lru';
    this.sizeEstimator = options.sizeEstimator || defaultSizeEstimator;

    // Initialize stats
    this.stats = {
      entryCount: 0,
      size: 0,
      maxSize: this.maxSize,
      maxEntries: this.maxEntries,
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      hitRatio: 0,
    };

    // Set up automatic cleanup if interval is specified
    const cleanupInterval = options.cleanupInterval || 60000; // Default: 1 minute
    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, cleanupInterval);
    }
  }

  /**
   * Estimate size of a cache entry
   */
  private estimateSize<T>(entry: CacheEntry<T>): number {
    return this.sizeEstimator(entry);
  }

  /**
   * Set a value in the cache with metadata
   */
  set<T>(key: string, entry: CacheEntry<T>): void {
    const now = Date.now();

    // If already exists, update size tracking and preserve some metadata
    let prevAccessCount = 0;
    let prevRevalidationCount = 0;
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key);
      const oldMetadata = this.metadata.get(key);
      if (oldMetadata) {
        this.currentSize -= oldMetadata.size;
        prevAccessCount = oldMetadata.accessCount;
      }

      // Preserve revalidation count if it exists
      if (oldEntry && oldEntry.revalidationCount !== undefined) {
        prevRevalidationCount = oldEntry.revalidationCount;
      }
    }

    // Calculate size
    const size = this.estimateSize(entry);

    // Check if we need to make space
    if (this.shouldEvict(size)) {
      this.evict(size);
    }

    // Update entry metadata
    if (entry.revalidationCount === undefined) {
      entry.revalidationCount = 0;
    } else if (entry.revalidationCount !== prevRevalidationCount) {
      // If revalidation count has increased, update lastRevalidatedAt
      entry.lastRevalidatedAt = now;
    }

    // Store entry and metadata
    this.cache.set(key, entry);
    this.metadata.set(key, {
      created: now,
      lastAccessed: now, // Use the same timestamp for both to ensure consistency
      accessCount: prevAccessCount, // Preserve previous access count
      size,
    });

    // Update size tracking
    this.currentSize += size;
    this.stats.entryCount = this.cache.size;
    this.stats.size = this.currentSize;
  }

  /**
   * Get a value from the cache
   * Returns undefined if not found or expired
   */
  get<T>(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    // Return undefined if entry not found
    if (!entry) {
      this.stats.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Check if entry is expired, if so delete it and return undefined
    if (isEntryExpired(entry)) {
      this.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Update access metadata - CRITICAL for LRU to work properly
    const now = Date.now();
    const metadata = this.metadata.get(key);
    if (metadata) {
      metadata.lastAccessed = now; // Update with current timestamp
      metadata.accessCount++;
      this.metadata.set(key, metadata);

      // Also update the cache entry's access count
      if (entry.accessCount !== undefined) {
        entry.accessCount++;
      } else {
        entry.accessCount = 1;
      }
    }

    this.stats.hits++;
    this.updateHitRatio();
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
      this.stats.expirations++;
      return false;
    }

    // Update access timestamp for LRU - has() also counts as access
    const metadata = this.metadata.get(key);
    if (metadata) {
      metadata.lastAccessed = Date.now();
      this.metadata.set(key, metadata);
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

    // Special handling for revalidation state changes
    if (updates.isRevalidating === false && entry.isRevalidating === true) {
      // Revalidation just completed
      updates.lastRevalidatedAt = Date.now();
      if (entry.revalidationCount !== undefined) {
        updates.revalidationCount = entry.revalidationCount + 1;
      } else {
        updates.revalidationCount = 1;
      }
    }

    const updatedEntry = { ...entry, ...updates };
    this.set(key, updatedEntry);
    return true;
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): boolean {
    // Update size tracking
    const metadata = this.metadata.get(key);
    if (metadata) {
      this.currentSize -= metadata.size;
      this.metadata.delete(key);
    }

    const result = this.cache.delete(key);

    // Update stats
    this.stats.entryCount = this.cache.size;
    this.stats.size = this.currentSize;

    return result;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.metadata.clear();
    this.currentSize = 0;

    // Reset some stats
    this.stats.entryCount = 0;
    this.stats.size = 0;
    this.stats.evictions = 0;
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get current size of the cache in bytes
   */
  getSize(): number {
    return this.currentSize;
  }

  /**
   * Get current cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Update hit ratio statistic
   */
  private updateHitRatio(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRatio = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Determine if we need to evict items
   */
  private shouldEvict(newItemSize: number): boolean {
    if (this.maxEntries > 0 && this.cache.size >= this.maxEntries) {
      return true;
    }

    if (this.maxSize > 0 && this.currentSize + newItemSize > this.maxSize) {
      return true;
    }

    return false;
  }

  /**
   * Evict items according to policy to make room
   */
  private evict(requiredSpace: number = 0): void {
    if (this.cache.size === 0) return;

    // Function to get sorted keys based on policy
    const getSortedKeys = (): string[] => {
      const entries = Array.from(this.metadata.entries());

      switch (this.evictionPolicy) {
        case 'lru':
          // Least Recently Used - sort by lastAccessed (oldest first)
          // Log for debugging
          // console.log('Before eviction - entries with access times:',
          //   entries.map(e => ({ key: e[0], lastAccessed: e[1].lastAccessed, accessCount: e[1].accessCount })));

          return entries
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
            .map(entry => entry[0]);

        case 'lfu':
          // Least Frequently Used - sort by accessCount (lowest first)
          return entries.sort((a, b) => a[1].accessCount - b[1].accessCount).map(entry => entry[0]);

        case 'ttl':
          // Time To Live - sort by expiration (earliest first)
          return Array.from(this.cache.entries())
            .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
            .map(entry => entry[0]);

        case 'fifo':
          // First In First Out - sort by creation time (oldest first)
          return entries.sort((a, b) => a[1].created - b[1].created).map(entry => entry[0]);

        default:
          return Array.from(this.cache.keys());
      }
    };

    const keys = getSortedKeys();
    let spaceFreed = 0;
    let keysRemoved = 0;

    // Keep evicting until we have enough space or no more items
    for (const key of keys) {
      // We need to always make enough room for one new entry
      // when adding a new item and maxEntries is hit
      const needToReduceEntries =
        this.maxEntries > 0 && this.cache.size - keysRemoved >= this.maxEntries;

      // Check if we need to make more room for size
      const needToReduceSize =
        this.maxSize > 0 && this.currentSize - spaceFreed + requiredSpace > this.maxSize;

      // Stop if we've freed enough space
      if (!needToReduceEntries && !needToReduceSize) {
        // Log for debugging
        // console.log('Evicted keys:', keysRemoved > 0 ? keys.slice(0, keysRemoved) : 'none');
        break;
      }

      // Get size before deleting
      const metadata = this.metadata.get(key);
      if (metadata) {
        spaceFreed += metadata.size;
      }

      // Delete and track
      this.cache.delete(key);
      this.metadata.delete(key);
      keysRemoved++;
      this.stats.evictions++;
    }

    // Update size tracking
    this.currentSize -= spaceFreed;
    this.stats.entryCount = this.cache.size;
    this.stats.size = this.currentSize;
  }

  /**
   * Remove all expired entries from the cache
   */
  cleanup(): void {
    const now = Date.now();
    let expired = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.delete(key);
        expired++;
      }
    }

    if (expired > 0) {
      this.stats.expirations += expired;
    }
  }

  /**
   * Clean up resources when cache is no longer needed
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
