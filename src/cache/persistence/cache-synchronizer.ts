// src/cache/persistence/cache-synchronizer.ts

import { CachePersistence } from './cache-persistence';
import { CacheEntry } from '../cache-entry';

/**
 * Configuration options for the cache synchronizer
 */
export interface SynchronizerOptions {
  /**
   * How frequently to sync changes (in milliseconds)
   * @default 30000 (30 seconds)
   */
  syncInterval?: number;

  /**
   * Maximum number of entries to sync per batch
   * @default 50
   */
  batchSize?: number;

  /**
   * Whether to perform initial sync on startup
   * @default true
   */
  syncOnStart?: boolean;

  /**
   * Function to filter which keys should be synchronized
   * @default All keys are synchronized
   */
  keyFilter?: (key: string) => boolean;

  /**
   * Callback when sync operations complete
   */
  onSyncComplete?: (stats: SyncStats) => void;

  /**
   * Determine conflict resolution strategy
   * @default 'mostRecent'
   */
  conflictStrategy?:
    | 'mostRecent'
    | 'primary'
    | 'secondary'
    | ((primary: CacheEntry<any>, secondary: CacheEntry<any>) => CacheEntry<any>);
}

/**
 * Statistics about a sync operation
 */
export interface SyncStats {
  /** Total entries processed */
  entriesProcessed: number;

  /** Entries added to primary */
  addedToPrimary: number;

  /** Entries added to secondary */
  addedToSecondary: number;

  /** Conflicts detected and resolved */
  conflictsResolved: number;

  /** Failed operations */
  failures: number;

  /** Time taken in milliseconds */
  timeTakenMs: number;
}

/**
 * Cache synchronizer keeps multiple persistence backends in sync
 */
export class CacheSynchronizer {
  private options: Required<SynchronizerOptions>;
  private primary: CachePersistence;
  private secondary: CachePersistence;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncInProgress = false;
  private pendingChanges = new Set<string>();

  /**
   * Create a new cache synchronizer
   */
  constructor(
    primary: CachePersistence,
    secondary: CachePersistence,
    options: SynchronizerOptions = {},
  ) {
    this.primary = primary;
    this.secondary = secondary;

    // Set default options
    this.options = {
      syncInterval: options.syncInterval ?? 30000,
      batchSize: options.batchSize ?? 50,
      syncOnStart: options.syncOnStart ?? true,
      keyFilter: options.keyFilter ?? (() => true),
      onSyncComplete: options.onSyncComplete ?? (() => {}),
      conflictStrategy: options.conflictStrategy ?? 'mostRecent',
    };

    // Start synchronization if requested
    if (this.options.syncOnStart) {
      this.syncAll();
    }

    // Start background sync timer
    this.startSyncTimer();
  }

  /**
   * Start background synchronization timer
   */
  private startSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.syncAll();
    }, this.options.syncInterval);
  }

  /**
   * Stop background synchronization
   */
  public stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Mark a specific key for synchronization
   */
  public markForSync(key: string): void {
    if (this.options.keyFilter(key)) {
      this.pendingChanges.add(key);
    }
  }

  /**
   * Synchronize a specific key immediately
   */
  public async syncKey(key: string): Promise<boolean> {
    if (!this.options.keyFilter(key)) {
      return false;
    }

    try {
      const primaryEntry = await this.primary.get(key);
      const secondaryEntry = await this.secondary.get(key);

      if (primaryEntry && !secondaryEntry) {
        // Key exists only in primary, copy to secondary
        await this.secondary.set(key, primaryEntry);
        return true;
      } else if (!primaryEntry && secondaryEntry) {
        // Key exists only in secondary, copy to primary
        await this.primary.set(key, secondaryEntry);
        return true;
      } else if (primaryEntry && secondaryEntry) {
        // Key exists in both, check for conflicts
        const resolvedEntry = this.resolveConflict(primaryEntry, secondaryEntry);

        // Update both stores with the resolved entry
        await this.primary.set(key, resolvedEntry);
        await this.secondary.set(key, resolvedEntry);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Failed to sync key: ${key}`, error);
      return false;
    }
  }

  /**
   * Synchronize all entries between persistence backends
   */
  public async syncAll(): Promise<SyncStats> {
    if (this.syncInProgress) {
      return {
        entriesProcessed: 0,
        addedToPrimary: 0,
        addedToSecondary: 0,
        conflictsResolved: 0,
        failures: 0,
        timeTakenMs: 0,
      };
    }

    this.syncInProgress = true;
    const startTime = Date.now();

    const stats: SyncStats = {
      entriesProcessed: 0,
      addedToPrimary: 0,
      addedToSecondary: 0,
      conflictsResolved: 0,
      failures: 0,
      timeTakenMs: 0,
    };

    try {
      // Get all keys from both storage backends
      const primaryKeys = new Set(await this.primary.keys());
      const secondaryKeys = new Set(await this.secondary.keys());

      // Combine and filter all keys
      const allKeys = new Set(
        [
          ...Array.from(primaryKeys),
          ...Array.from(secondaryKeys),
          ...Array.from(this.pendingChanges),
        ].filter(this.options.keyFilter),
      );

      // Process in batches
      const keyArray = Array.from(allKeys);

      for (let i = 0; i < keyArray.length; i += this.options.batchSize) {
        const batch = keyArray.slice(i, i + this.options.batchSize);

        await Promise.all(
          batch.map(async key => {
            try {
              const primaryEntry = await this.primary.get(key);
              const secondaryEntry = await this.secondary.get(key);

              if (primaryEntry && !secondaryEntry) {
                // Key exists only in primary, copy to secondary
                await this.secondary.set(key, primaryEntry);
                stats.addedToSecondary++;
              } else if (!primaryEntry && secondaryEntry) {
                // Key exists only in secondary, copy to primary
                await this.primary.set(key, secondaryEntry);
                stats.addedToPrimary++;
              } else if (primaryEntry && secondaryEntry) {
                // Check for conflicts
                const areEqual = JSON.stringify(primaryEntry) === JSON.stringify(secondaryEntry);

                if (!areEqual) {
                  // Resolve conflict and update both storages
                  const resolvedEntry = this.resolveConflict(primaryEntry, secondaryEntry);
                  await this.primary.set(key, resolvedEntry);
                  await this.secondary.set(key, resolvedEntry);
                  stats.conflictsResolved++;
                }
              }

              stats.entriesProcessed++;
            } catch (error) {
              console.error(`Failed to sync key: ${key}`, error);
              stats.failures++;
            }
          }),
        );
      }

      // Clear pending changes after successful sync
      this.pendingChanges.clear();
    } catch (error) {
      console.error('Sync failed:', error);
      stats.failures++;
    } finally {
      this.syncInProgress = false;
      stats.timeTakenMs = Date.now() - startTime;

      // Call completion callback
      this.options.onSyncComplete(stats);
    }

    return stats;
  }

  /**
   * Resolve a conflict between two cache entries
   */
  private resolveConflict<T>(primary: CacheEntry<T>, secondary: CacheEntry<T>): CacheEntry<T> {
    const strategy = this.options.conflictStrategy;

    if (strategy === 'primary') {
      return primary;
    } else if (strategy === 'secondary') {
      return secondary;
    } else if (strategy === 'mostRecent') {
      // Compare creation or update timestamps and use the most recent
      const primaryTimestamp = primary.createdAt || 0;
      const secondaryTimestamp = secondary.createdAt || 0;
      return primaryTimestamp >= secondaryTimestamp ? primary : secondary;
    } else if (typeof strategy === 'function') {
      // Use custom resolution function
      return strategy(primary, secondary);
    }

    // Default to primary if no strategy matched
    return primary;
  }
}
