// src/cache/persistence/fallback-persistence.ts

import { CachePersistence } from './cache-persistence';
import { CacheEntry } from '../cache-entry';

/**
 * FallbackPersistence implements a chain of persistence mechanisms.
 * It tries to use the primary persistence first, but falls back to secondary
 * persistence options if primary operations fail.
 */
export class FallbackPersistence implements CachePersistence {
  private persistenceChain: CachePersistence[] = [];
  private activeIndex = 0;

  /**
   * Create a new fallback persistence with multiple persistence layers
   * @param persistenceOptions List of persistence mechanisms in order of preference
   */
  constructor(persistenceOptions: CachePersistence[]) {
    if (!persistenceOptions || persistenceOptions.length === 0) {
      throw new Error('At least one persistence mechanism is required');
    }
    this.persistenceChain = persistenceOptions;
  }

  /**
   * Store a cache entry in the active persistence and try to sync to backup
   */
  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    // Try with the active persistence first
    try {
      await this.getActivePersistence().set(key, entry);

      // If successful, attempt to sync this change to backup persistence mechanisms
      this.syncToBackups(key, entry);

      return;
    } catch (error) {
      // If active persistence fails, try the next one in the chain
      const nextPersistence = this.tryNextPersistence();
      if (nextPersistence) {
        return nextPersistence.set(key, entry);
      }
      throw error;
    }
  }

  /**
   * Retrieve a cache entry from any available persistence
   */
  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    // Try with active persistence first
    try {
      const result = await this.getActivePersistence().get<T>(key);
      if (result) return result;
    } catch {
      // Active persistence failed
      this.tryNextPersistence();
    }

    // Try each backup persistence in order
    for (let i = this.activeIndex; i < this.persistenceChain.length; i++) {
      try {
        const result = await this.persistenceChain[i].get<T>(key);
        if (result) {
          // If we found it in a backup, promote that persistence to active
          this.activeIndex = i;

          // And sync this data back to previously failed storage if possible
          this.syncToPrevious(key, result);

          return result;
        }
      } catch {
        // Skip failed persistence
        continue;
      }
    }

    return undefined;
  }

  /**
   * Check if a key exists in any available persistence
   */
  async has(key: string): Promise<boolean> {
    try {
      if (await this.getActivePersistence().has(key)) {
        return true;
      }
    } catch {
      // Active persistence failed
      this.tryNextPersistence();
    }

    // Try each backup persistence in order
    for (let i = this.activeIndex; i < this.persistenceChain.length; i++) {
      try {
        if (await this.persistenceChain[i].has(key)) {
          this.activeIndex = i;
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Delete a key from all persistence mechanisms
   */
  async delete(key: string): Promise<boolean> {
    let anySuccess = false;

    // Try to delete from all persistence layers
    for (let i = 0; i < this.persistenceChain.length; i++) {
      try {
        const success = await this.persistenceChain[i].delete(key);
        anySuccess = anySuccess || success;
      } catch {
        // Ignore failures
      }
    }

    return anySuccess;
  }

  /**
   * Clear all entries from all persistence mechanisms
   */
  async clear(): Promise<void> {
    const errors: Error[] = [];

    // Try to clear all persistence layers
    for (let i = 0; i < this.persistenceChain.length; i++) {
      try {
        await this.persistenceChain[i].clear();
      } catch (e) {
        errors.push(e as Error);
      }
    }

    if (errors.length === this.persistenceChain.length) {
      // If all failed, throw the first error
      throw errors[0];
    }
  }

  /**
   * Get keys from all persistence mechanisms
   */
  async keys(): Promise<string[]> {
    const allKeys = new Set<string>();

    // Try to get keys from all persistence layers
    for (let i = 0; i < this.persistenceChain.length; i++) {
      try {
        const keys = await this.persistenceChain[i].keys();
        keys.forEach(k => allKeys.add(k));
      } catch {
        // Ignore failures
      }
    }

    return Array.from(allKeys);
  }

  /**
   * Get total size from the active persistence
   */
  async getSize(): Promise<number> {
    try {
      return await this.getActivePersistence().getSize();
    } catch {
      const nextPersistence = this.tryNextPersistence();
      if (nextPersistence) {
        return nextPersistence.getSize();
      }
      return 0;
    }
  }

  /**
   * Get the actively used persistence mechanism
   */
  private getActivePersistence(): CachePersistence {
    return this.persistenceChain[this.activeIndex];
  }

  /**
   * Try to switch to the next persistence in chain
   * @returns The next persistence or null if none available
   */
  private tryNextPersistence(): CachePersistence | null {
    this.activeIndex++;
    if (this.activeIndex < this.persistenceChain.length) {
      return this.getActivePersistence();
    }
    // Reset to first persistence for next operations
    this.activeIndex = 0;
    return null;
  }

  /**
   * Sync a cache entry to all backup persistence mechanisms asynchronously
   */
  private syncToBackups<T>(key: string, entry: CacheEntry<T>): void {
    // Skip the active persistence
    for (let i = 0; i < this.persistenceChain.length; i++) {
      if (i === this.activeIndex) continue;

      // Fire and forget - don't await or catch errors
      this.persistenceChain[i].set(key, entry).catch(() => {
        // Silently ignore failures
      });
    }
  }

  /**
   * Sync a cache entry to previous (failed) persistence mechanisms
   */
  private syncToPrevious<T>(key: string, entry: CacheEntry<T>): void {
    // Sync to all persistence mechanisms that come before the active one
    for (let i = 0; i < this.activeIndex; i++) {
      this.persistenceChain[i].set(key, entry).catch(() => {
        // Silently ignore failures
      });
    }
  }
}
