// src/cache/persistence/performance-optimized-persistence.ts

import { CachePersistence } from './cache-persistence';
import { CacheEntry } from '../cache-entry';

/**
 * Options for the performance optimized persistence
 */
export interface PerformanceOptions {
  /**
   * Underlying persistence implementation
   */
  persistence: CachePersistence;

  /**
   * Size of the memory cache (number of entries)
   * @default 100
   */
  memoryCacheSize?: number;

  /**
   * Whether to preload frequently accessed items on initialization
   * @default true
   */
  preloadFrequentItems?: boolean;

  /**
   * Maximum number of items to preload
   * @default 20
   */
  preloadLimit?: number;

  /**
   * Write delay in milliseconds to batch write operations
   * @default 200
   */
  writeDelay?: number;

  /**
   * Maximum number of pending write operations before forcing a flush
   * @default 50
   */
  maxPendingWrites?: number;
}

/**
 * Performance-optimized persistence wrapper
 *
 * This implementation improves performance by:
 * 1. Adding an in-memory LRU cache for fast read access
 * 2. Batching write operations to reduce I/O overhead
 * 3. Preloading frequently accessed items on initialization
 */
export class PerformanceOptimizedPersistence implements CachePersistence {
  private persistence: CachePersistence;
  private memoryCache = new Map<string, CacheEntry<any>>();
  private accessCount = new Map<string, number>();
  private pendingWrites = new Map<string, CacheEntry<any> | null>();
  private pendingDeletes = new Set<string>();
  private writeTimer: NodeJS.Timeout | null = null;
  private options: Required<PerformanceOptions>;

  /**
   * Create a performance-optimized persistence wrapper
   */
  constructor(options: PerformanceOptions) {
    this.persistence = options.persistence;

    this.options = {
      persistence: options.persistence,
      memoryCacheSize: options.memoryCacheSize ?? 100,
      preloadFrequentItems: options.preloadFrequentItems ?? true,
      preloadLimit: options.preloadLimit ?? 20,
      writeDelay: options.writeDelay ?? 200,
      maxPendingWrites: options.maxPendingWrites ?? 50,
    };

    // Preload frequently accessed items if enabled
    if (this.options.preloadFrequentItems) {
      this.preloadFrequentItems();
    }
  }

  /**
   * Preload frequently accessed items on initialization
   */
  private async preloadFrequentItems(): Promise<void> {
    try {
      // Get all keys
      const allKeys = await this.persistence.keys();

      // Preload a subset of items (limited by preloadLimit)
      const keysToPreload = allKeys.slice(0, this.options.preloadLimit);

      // Load items into memory cache
      await Promise.all(
        keysToPreload.map(async key => {
          try {
            const entry = await this.persistence.get(key);
            if (entry) {
              this.addToMemoryCache(key, entry);
            }
          } catch {
            // Ignore errors during preloading
          }
        }),
      );
    } catch {
      // Ignore errors during preloading
    }
  }

  /**
   * Store a cache entry
   */
  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    // Update memory cache immediately
    this.addToMemoryCache(key, entry);

    // Add to pending writes
    this.pendingWrites.set(key, entry);
    this.pendingDeletes.delete(key);

    // Schedule flush if not already scheduled
    this.scheduleFlush();

    // If we have too many pending writes, flush immediately
    if (this.pendingWrites.size >= this.options.maxPendingWrites) {
      await this.flush();
    }
  }

  /**
   * Retrieve a cache entry
   */
  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    // Check memory cache first for fast access
    if (this.memoryCache.has(key)) {
      // Update access statistics
      this.recordAccess(key);

      // Return from memory cache
      return this.memoryCache.get(key) as CacheEntry<T>;
    }

    // Check if this key has a pending write
    if (this.pendingWrites.has(key)) {
      const pendingEntry = this.pendingWrites.get(key);
      if (pendingEntry) {
        this.recordAccess(key);
        return pendingEntry as CacheEntry<T>;
      }
      return undefined;
    }

    // Check if this key has a pending delete
    if (this.pendingDeletes.has(key)) {
      return undefined;
    }

    // Fall back to persistence
    try {
      const entry = await this.persistence.get<T>(key);
      if (entry) {
        // Store in memory cache for future fast access
        this.addToMemoryCache(key, entry);
        this.recordAccess(key);
        return entry;
      }
    } catch (error) {
      console.error(`Error retrieving key ${key}:`, error);
    }

    return undefined;
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    // Check memory cache first
    if (this.memoryCache.has(key)) {
      this.recordAccess(key);
      return true;
    }

    // Check pending operations
    if (this.pendingWrites.has(key)) {
      return this.pendingWrites.get(key) !== null;
    }

    if (this.pendingDeletes.has(key)) {
      return false;
    }

    // Fall back to persistence
    try {
      return await this.persistence.has(key);
    } catch {
      return false;
    }
  }

  /**
   * Delete a cache entry
   */
  async delete(key: string): Promise<boolean> {
    // Remove from memory cache
    this.memoryCache.delete(key);
    this.accessCount.delete(key);

    // Add to pending deletes and remove from pending writes
    this.pendingDeletes.add(key);
    this.pendingWrites.delete(key);

    // Schedule flush
    this.scheduleFlush();

    return true;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();
    this.accessCount.clear();

    // Clear pending operations
    this.pendingWrites.clear();
    this.pendingDeletes.clear();

    // Cancel any pending flush
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }

    // Clear underlying persistence
    await this.persistence.clear();
  }

  /**
   * Get all cache keys
   */
  async keys(): Promise<string[]> {
    // Get keys from persistence
    const persistenceKeys = await this.persistence.keys();

    // Combine with memory cache keys, but exclude pending deletes
    const allKeys = new Set([
      ...persistenceKeys,
      ...Array.from(this.memoryCache.keys()),
      ...Array.from(this.pendingWrites.keys()),
    ]);

    // Remove keys that are pending deletion
    for (const key of this.pendingDeletes) {
      allKeys.delete(key);
    }

    return Array.from(allKeys);
  }

  /**
   * Get total size of stored cache
   */
  async getSize(): Promise<number> {
    // For accurate size, we need to flush pending operations first
    await this.flush();

    // Then return size from persistence
    return this.persistence.getSize();
  }

  /**
   * Add an entry to the memory cache, respecting size limits
   */
  private addToMemoryCache<T>(key: string, entry: CacheEntry<T>): void {
    // If cache is at capacity, remove least accessed item
    if (this.memoryCache.size >= this.options.memoryCacheSize && !this.memoryCache.has(key)) {
      this.evictLeastAccessed();
    }

    // Add to memory cache
    this.memoryCache.set(key, entry);

    // Initialize access count if not exists
    if (!this.accessCount.has(key)) {
      this.accessCount.set(key, 0);
    }
  }

  /**
   * Record an access to a key for LRU tracking
   */
  private recordAccess(key: string): void {
    const currentCount = this.accessCount.get(key) || 0;
    this.accessCount.set(key, currentCount + 1);
  }

  /**
   * Evict the least accessed item from memory cache
   */
  private evictLeastAccessed(): void {
    let leastAccessedKey: string | null = null;
    let leastAccessCount = Infinity;

    // Find the least accessed key
    for (const [key, count] of this.accessCount.entries()) {
      if (count < leastAccessCount) {
        leastAccessedKey = key;
        leastAccessCount = count;
      }
    }

    // Remove it from memory cache
    if (leastAccessedKey) {
      this.memoryCache.delete(leastAccessedKey);
      this.accessCount.delete(leastAccessedKey);
    }
  }

  /**
   * Schedule a flush of pending operations
   */
  private scheduleFlush(): void {
    if (this.writeTimer) {
      return; // Already scheduled
    }

    this.writeTimer = setTimeout(() => {
      this.flush().catch(error => {
        console.error('Error flushing pending operations:', error);
      });
    }, this.options.writeDelay);
  }

  /**
   * Flush all pending operations to persistence
   */
  async flush(): Promise<void> {
    // Clear the timer
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }

    // If no pending operations, return early
    if (this.pendingWrites.size === 0 && this.pendingDeletes.size === 0) {
      return;
    }

    // Process pending writes
    const writesPromises = Array.from(this.pendingWrites.entries()).map(async ([key, entry]) => {
      if (entry) {
        try {
          await this.persistence.set(key, entry);
        } catch (error) {
          console.error(`Error writing key ${key}:`, error);
        }
      }
    });

    // Process pending deletes
    const deletesPromises = Array.from(this.pendingDeletes).map(async key => {
      try {
        await this.persistence.delete(key);
      } catch (error) {
        console.error(`Error deleting key ${key}:`, error);
      }
    });

    // Wait for all operations to complete
    await Promise.all([...writesPromises, ...deletesPromises]);

    // Clear pending operations
    this.pendingWrites.clear();
    this.pendingDeletes.clear();
  }
}
