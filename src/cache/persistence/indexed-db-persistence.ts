// src/cache/persistence/indexed-db-persistence.ts

import { CacheEntry } from '../cache-entry';
import { CachePersistence } from './cache-persistence';
import { serializeEntry, deserializeEntry } from './serialization';

interface IndexedDBCacheEntry {
  key: string;
  value: string; // Serialized cache entry
  size: number;
  expiresAt: number;
}

/**
 * IndexedDB persistence implementation
 * Provides a larger, more robust storage option for browser environments
 */
export class IndexedDBPersistence implements CachePersistence {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly maxSize: number;
  private readonly prefix: string;
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    options: {
      dbName?: string;
      storeName?: string;
      maxSize?: number;
      prefix?: string;
    } = {},
  ) {
    this.dbName = options.dbName || 'fetchkit-cache';
    this.storeName = options.storeName || 'cache-store';
    this.maxSize = options.maxSize || 50 * 1024 * 1024; // Default: 50MB
    this.prefix = options.prefix || 'fk_cache:';
  }

  /**
   * Open the IndexedDB database
   */
  private async openDatabase(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const request = window.indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Execute a transaction on the object store
   */
  private async withStore<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDatabase();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, mode);
      const store = transaction.objectStore(this.storeName);

      const request = callback(store);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('IndexedDB transaction failed'));
      };
    });
  }

  /**
   * Get the full key with prefix
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Remove prefix from a key
   */
  private removePrefix(key: string): string {
    return key.startsWith(this.prefix) ? key.slice(this.prefix.length) : key;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const serialized = serializeEntry(entry);

      // Check if we have enough space
      const currentSize = await this.getSize();
      if (currentSize + serialized.length * 2 > this.maxSize) {
        await this.cleanup();

        // Check again after cleanup
        const newSize = await this.getSize();
        if (newSize + serialized.length * 2 > this.maxSize) {
          throw new Error('Storage quota exceeded');
        }
      }

      // Store the serialized entry with prefixed key
      const dbEntry: IndexedDBCacheEntry = {
        key: this.getKey(key),
        value: serialized,
        size: serialized.length * 2, // UTF-16 uses 2 bytes per character
        expiresAt: entry.expiresAt,
      };

      await this.withStore('readwrite', store => {
        return store.put(dbEntry);
      });
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to store cache entry');
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const dbEntry = await this.withStore<IndexedDBCacheEntry | undefined>('readonly', store => {
        return store.get(this.getKey(key));
      });

      if (!dbEntry) return undefined;

      // Check if entry is expired
      if (dbEntry.expiresAt <= Date.now()) {
        await this.delete(key);
        return undefined;
      }

      try {
        return deserializeEntry<T>(dbEntry.value);
      } catch {
        await this.delete(key);
        return undefined;
      }
    } catch {
      return undefined;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const entry = await this.withStore<IndexedDBCacheEntry | undefined>('readonly', store => {
        return store.get(this.getKey(key));
      });

      if (!entry) return false;

      // Check if entry is expired
      if (entry.expiresAt <= Date.now()) {
        await this.delete(key);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      // We'll check if it exists directly to avoid calling has which would lookup using prefixed key
      await this.withStore('readwrite', store => {
        return store.delete(this.getKey(key));
      });

      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.withStore('readwrite', store => {
        return store.clear();
      });
    } catch (error) {
      throw new Error(
        `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async keys(): Promise<string[]> {
    try {
      const allKeys = await this.withStore<IDBValidKey[]>('readonly', store => {
        return store.getAllKeys();
      });

      // Filter keys by prefix and remove prefix from the keys
      return allKeys
        .map(key => key.toString())
        .filter(key => key.startsWith(this.prefix))
        .map(key => this.removePrefix(key));
    } catch {
      return [];
    }
  }

  async getSize(): Promise<number> {
    try {
      const entries = await this.getAllEntries();
      return entries.reduce((total, entry) => total + entry.size, 0);
    } catch {
      return 0;
    }
  }

  private async getAllEntries(): Promise<IndexedDBCacheEntry[]> {
    try {
      return await this.withStore<IndexedDBCacheEntry[]>('readonly', store => {
        return store.getAll();
      });
    } catch {
      return [];
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      const db = await this.openDatabase();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('expiresAt');

        // Get all expired entries
        const range = IDBKeyRange.upperBound(now);
        const request = index.openCursor(range);

        request.onsuccess = event => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            // Delete expired entry
            cursor.delete();
            cursor.continue();
          }
        };

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(new Error('Failed to cleanup expired entries'));
        };
      });
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }
}
