// src/cache/persistence/cache-persistence.ts

import { CacheEntry } from '../cache-entry';

/**
 * Interface for cache persistence implementations
 */
export interface CachePersistence {
  /**
   * Store a cache entry
   */
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;

  /**
   * Retrieve a cache entry
   */
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;

  /**
   * Check if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Remove a cache entry
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all entries
   */
  clear(): Promise<void>;

  /**
   * Get all cache keys
   */
  keys(): Promise<string[]>;

  /**
   * Get total size of stored cache
   */
  getSize(): Promise<number>;
}

/**
 * Local storage persistence implementation
 */
export class LocalStoragePersistence implements CachePersistence {
  private readonly prefix: string;
  private readonly maxSize: number;

  constructor(prefix = 'fk_cache:', maxSize = 5 * 1024 * 1024) {
    this.prefix = prefix;
    this.maxSize = maxSize;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const serialized = JSON.stringify(entry);
      if (await this.hasSpace(serialized.length)) {
        localStorage.setItem(this.getKey(key), serialized);
      } else {
        throw new Error('Storage quota exceeded');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        await this.cleanup();
        // Retry once after cleanup
        const serialized = JSON.stringify(entry);
        if (await this.hasSpace(serialized.length)) {
          localStorage.setItem(this.getKey(key), serialized);
        } else {
          throw new Error('Storage quota exceeded even after cleanup');
        }
      } else {
        throw error;
      }
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const serialized = localStorage.getItem(this.getKey(key));
    if (!serialized) return undefined;

    try {
      const entry = JSON.parse(serialized) as CacheEntry<T>;
      if (entry.expiresAt <= Date.now()) {
        await this.delete(key);
        return undefined;
      }
      return entry;
    } catch {
      await this.delete(key);
      return undefined;
    }
  }

  async has(key: string): Promise<boolean> {
    return localStorage.getItem(this.getKey(key)) !== null;
  }

  async delete(key: string): Promise<boolean> {
    const exists = await this.has(key);
    if (exists) {
      localStorage.removeItem(this.getKey(key));
      return true;
    }
    return false;
  }

  async clear(): Promise<void> {
    const keys = await this.keys();
    keys.forEach(key => localStorage.removeItem(this.getKey(key)));
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return keys;
  }

  async getSize(): Promise<number> {
    const keys = await this.keys();
    return keys.reduce((size, key) => {
      const item = localStorage.getItem(this.getKey(key));
      return size + (item ? item.length * 2 : 0); // Multiply by 2 for UTF-16
    }, 0);
  }

  private async hasSpace(additionalBytes: number): Promise<boolean> {
    const currentSize = await this.getSize();
    return currentSize + additionalBytes <= this.maxSize;
  }

  private async cleanup(): Promise<void> {
    const keys = await this.keys();
    const entries = await Promise.all(
      keys.map(async key => {
        const entry = await this.get(key);
        return { key, entry };
      }),
    );

    // Remove expired entries
    const now = Date.now();
    for (const { key, entry } of entries) {
      if (entry && entry.expiresAt <= now) {
        await this.delete(key);
      }
    }
  }
}

/**
 * Memory persistence implementation (fallback)
 */
export class MemoryPersistence implements CachePersistence {
  private storage = new Map<string, string>();
  private readonly maxSize: number;

  constructor(maxSize = 5 * 1024 * 1024) {
    this.maxSize = maxSize;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const serialized = JSON.stringify(entry);
    if (await this.hasSpace(serialized.length)) {
      this.storage.set(key, serialized);
    } else {
      throw new Error('Storage quota exceeded');
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const serialized = this.storage.get(key);
    if (!serialized) return undefined;

    try {
      const entry = JSON.parse(serialized) as CacheEntry<T>;
      if (entry.expiresAt <= Date.now()) {
        await this.delete(key);
        return undefined;
      }
      return entry;
    } catch {
      await this.delete(key);
      return undefined;
    }
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async getSize(): Promise<number> {
    return Array.from(this.storage.values()).reduce((size, item) => size + item.length * 2, 0);
  }

  private async hasSpace(additionalBytes: number): Promise<boolean> {
    const currentSize = await this.getSize();
    return currentSize + additionalBytes <= this.maxSize;
  }
}

/**
 * Creates appropriate persistence implementation based on environment
 */
export function createPersistence(options?: {
  prefix?: string;
  maxSize?: number;
}): CachePersistence {
  if (typeof localStorage !== 'undefined') {
    try {
      // Test localStorage availability
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return new LocalStoragePersistence(options?.prefix, options?.maxSize);
    } catch {
      // Fallback to memory if localStorage is not available
      return new MemoryPersistence(options?.maxSize);
    }
  }
  return new MemoryPersistence(options?.maxSize);
}
