// src/cache/persistence/persistence-migration.ts

import { CachePersistence } from './cache-persistence';

/**
 * Options for migration between persistence implementations
 */
export interface MigrationOptions {
  /**
   * Whether to remove entries from the source after migration
   * @default false
   */
  cleanup?: boolean;

  /**
   * Maximum number of entries to migrate per batch
   * @default 100
   */
  batchSize?: number;

  /**
   * Function to filter which keys should be migrated
   * @default All keys are migrated
   */
  keyFilter?: (key: string) => boolean;

  /**
   * Progress callback called after each batch is processed
   */
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Result of a persistence migration operation
 */
export interface MigrationResult {
  /** Total number of keys found in source */
  totalKeys: number;

  /** Number of keys successfully migrated */
  migratedCount: number;

  /** Number of keys that failed to migrate */
  failedCount: number;

  /** List of keys that failed to migrate */
  failedKeys: string[];
}

/**
 * Utility to migrate data between persistence implementations
 */
export async function migratePersistence(
  source: CachePersistence,
  target: CachePersistence,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const { cleanup = false, batchSize = 100, keyFilter = () => true, onProgress } = options;

  // Fetch all keys from source
  const allKeys = await source.keys();
  const filteredKeys = allKeys.filter(keyFilter);

  const result: MigrationResult = {
    totalKeys: filteredKeys.length,
    migratedCount: 0,
    failedCount: 0,
    failedKeys: [],
  };

  // Migrate in batches to avoid memory issues with large datasets
  for (let i = 0; i < filteredKeys.length; i += batchSize) {
    const batch = filteredKeys.slice(i, i + batchSize);
    const batchResults = await migrateBatch(source, target, batch, cleanup);

    // Update results
    result.migratedCount += batchResults.migratedCount;
    result.failedCount += batchResults.failedCount;
    result.failedKeys.push(...batchResults.failedKeys);

    // Report progress if callback provided
    if (onProgress) {
      onProgress(i + batch.length, filteredKeys.length);
    }
  }

  return result;
}

/**
 * Migrate a batch of keys between persistences
 */
async function migrateBatch(
  source: CachePersistence,
  target: CachePersistence,
  keys: string[],
  cleanup: boolean,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalKeys: keys.length,
    migratedCount: 0,
    failedCount: 0,
    failedKeys: [],
  };

  // Process each key in the batch
  await Promise.all(
    keys.map(async key => {
      try {
        const entry = await source.get(key);
        if (entry) {
          await target.set(key, entry);

          // Remove from source if cleanup requested
          if (cleanup) {
            await source.delete(key);
          }

          result.migratedCount++;
        }
      } catch (error) {
        console.error(`Failed to migrate key: ${key}`, error);
        result.failedCount++;
        result.failedKeys.push(key);
      }
    }),
  );

  return result;
}

/**
 * Verify migration by comparing keys and values between source and target
 */
export async function verifyMigration(
  source: CachePersistence,
  target: CachePersistence,
  options: { keyFilter?: (key: string) => boolean } = {},
): Promise<{ success: boolean; missingKeys: string[]; mismatchedKeys: string[] }> {
  const { keyFilter = () => true } = options;

  // Get all keys from source that match the filter
  const sourceKeys = (await source.keys()).filter(keyFilter);
  const targetKeys = await target.keys();

  // Check for missing keys
  const missingKeys = sourceKeys.filter(key => !targetKeys.includes(key));

  // Check for mismatched values
  const mismatchedKeys: string[] = [];

  for (const key of sourceKeys) {
    if (!missingKeys.includes(key)) {
      const sourceEntry = await source.get(key);
      const targetEntry = await target.get(key);

      // Check if entries match by comparing JSON strings
      if (JSON.stringify(sourceEntry) !== JSON.stringify(targetEntry)) {
        mismatchedKeys.push(key);
      }
    }
  }

  return {
    success: missingKeys.length === 0 && mismatchedKeys.length === 0,
    missingKeys,
    mismatchedKeys,
  };
}
