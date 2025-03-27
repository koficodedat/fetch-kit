// src/cache/persistence/session-storage-persistence.ts

import { CacheEntry } from '../cache-entry';
import { CachePersistence } from './cache-persistence';
import { serializeEntry, deserializeEntry } from './serialization';

/**
 * SessionStorage persistence implementation
 * Uses sessionStorage for temporary persistence during a browser session
 */
export class SessionStoragePersistence implements CachePersistence {
  private readonly prefix: string;
  private readonly maxSize: number;

  constructor(prefix = 'fk_session:', maxSize = 5 * 1024 * 1024) {
    this.prefix = prefix;
    this.maxSize = maxSize;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const serialized = serializeEntry(entry);
      if (await this.hasSpace(serialized.length)) {
        sessionStorage.setItem(this.getKey(key), serialized);
      } else {
        throw new Error('Storage quota exceeded');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        await this.cleanup();
        // Retry once after cleanup
        const serialized = serializeEntry(entry);
        if (await this.hasSpace(serialized.length)) {
          sessionStorage.setItem(this.getKey(key), serialized);
        } else {
          throw new Error('Storage quota exceeded even after cleanup');
        }
      } else {
        throw error;
      }
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const serialized = sessionStorage.getItem(this.getKey(key));
    if (!serialized) return undefined;

    try {
      const entry = deserializeEntry<T>(serialized);
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
    return sessionStorage.getItem(this.getKey(key)) !== null;
  }

  async delete(key: string): Promise<boolean> {
    const exists = await this.has(key);
    if (exists) {
      sessionStorage.removeItem(this.getKey(key));
      return true;
    }
    return false;
  }

  async clear(): Promise<void> {
    const keys = await this.keys();
    keys.forEach(key => sessionStorage.removeItem(this.getKey(key)));
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return keys;
  }

  async getSize(): Promise<number> {
    const keys = await this.keys();
    return keys.reduce((size, key) => {
      const item = sessionStorage.getItem(this.getKey(key));
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
