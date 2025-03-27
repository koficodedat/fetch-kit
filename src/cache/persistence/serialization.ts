// src/cache/persistence/serialization.ts

import { CacheEntry } from '../cache-entry';

/**
 * Serialize a cache entry to a string
 */
export function serializeEntry<T>(entry: CacheEntry<T>): string {
  try {
    return JSON.stringify(entry);
  } catch (error) {
    throw new Error(
      `Failed to serialize cache entry: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Deserialize a string to a cache entry
 */
export function deserializeEntry<T>(serialized: string): CacheEntry<T> {
  try {
    return JSON.parse(serialized) as CacheEntry<T>;
  } catch (error) {
    throw new Error(
      `Failed to deserialize cache entry: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Estimate the size of a serialized entry in bytes
 */
export function estimateSize<T>(entry: CacheEntry<T>): number {
  try {
    return JSON.stringify(entry).length * 2; // UTF-16 uses 2 bytes per character
  } catch {
    // If we can't stringify, provide a reasonable default estimate
    return 1024;
  }
}

/**
 * Serialize cache metadata for storage
 */
export function serializeMetadata(metadata: Record<string, any>): string {
  try {
    return JSON.stringify(metadata);
  } catch (error) {
    throw new Error(
      `Failed to serialize metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Deserialize metadata from storage
 */
export function deserializeMetadata(serialized: string): Record<string, any> {
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new Error(
      `Failed to deserialize metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
