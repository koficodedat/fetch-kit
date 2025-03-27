// tests/cache/persistence/cache-persistence.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LocalStoragePersistence,
  MemoryPersistence,
  createPersistence,
} from '@cache/persistence/cache-persistence';
import { createCacheEntry } from '@cache/cache-entry';

describe('Cache Persistence', () => {
  // Mock localStorage
  const mockStorage = new Map<string, string>();
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => mockStorage.get(key)),
    setItem: vi.fn((key: string, value: string) => mockStorage.set(key, value)),
    removeItem: vi.fn((key: string) => mockStorage.delete(key)),
    clear: vi.fn(() => mockStorage.clear()),
    key: vi.fn((index: number) => Array.from(mockStorage.keys())[index]),
    length: 0,
  };

  beforeEach(() => {
    mockStorage.clear();
    Object.defineProperty(mockLocalStorage, 'length', {
      get: () => mockStorage.size,
    });
  });

  describe('LocalStoragePersistence', () => {
    let persistence: LocalStoragePersistence;
    const originalLocalStorage = global.localStorage;

    beforeEach(() => {
      global.localStorage = mockLocalStorage as any;
      persistence = new LocalStoragePersistence('test:');
    });

    afterEach(() => {
      global.localStorage = originalLocalStorage;
    });

    it('should store and retrieve cache entries', async () => {
      const entry = createCacheEntry('test-data');
      await persistence.set('key1', entry);

      const retrieved = await persistence.get('key1');
      expect(retrieved).toEqual(entry);
    });

    it('should handle non-existent keys', async () => {
      const result = await persistence.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should handle invalid JSON', async () => {
      mockStorage.set('test:key1', 'invalid-json');
      const result = await persistence.get('key1');
      expect(result).toBeUndefined();
    });

    it('should respect storage quota', async () => {
      const persistence = new LocalStoragePersistence('test:', 100);
      const largeData = 'x'.repeat(200);
      const entry = createCacheEntry(largeData);

      await expect(persistence.set('key1', entry)).rejects.toThrow('Storage quota exceeded');
    });

    it('should cleanup expired entries when quota exceeded', async () => {
      const persistence = new LocalStoragePersistence('test:', 1000);

      // Add expired entry
      const expiredEntry = createCacheEntry('old-data');
      expiredEntry.expiresAt = Date.now() - 1000;
      await persistence.set('expired', expiredEntry);

      // Add new entry that would exceed quota
      const entry = createCacheEntry('new-data');
      await persistence.set('key1', entry);

      // Verify expired entry was cleaned up
      const expiredResult = await persistence.get('expired');
      expect(expiredResult).toBeUndefined();
      const newResult = await persistence.get('key1');
      expect(newResult).toBeDefined();
    });

    it('should track storage size correctly', async () => {
      const data = 'test-data';
      const entry = createCacheEntry(data);
      await persistence.set('key1', entry);

      const size = await persistence.getSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('MemoryPersistence', () => {
    let persistence: MemoryPersistence;

    beforeEach(() => {
      persistence = new MemoryPersistence();
    });

    it('should store and retrieve cache entries', async () => {
      const entry = createCacheEntry('test-data');
      await persistence.set('key1', entry);

      const retrieved = await persistence.get('key1');
      expect(retrieved).toEqual(entry);
    });

    it('should respect memory quota', async () => {
      const persistence = new MemoryPersistence(100);
      const largeData = 'x'.repeat(200);
      const entry = createCacheEntry(largeData);

      await expect(persistence.set('key1', entry)).rejects.toThrow('Storage quota exceeded');
    });

    it('should handle clear operation', async () => {
      const entry = createCacheEntry('test-data');
      await persistence.set('key1', entry);
      await persistence.set('key2', entry);

      await persistence.clear();
      expect(await persistence.keys()).toHaveLength(0);
    });

    it('should track memory size correctly', async () => {
      const data = 'test-data';
      const entry = createCacheEntry(data);
      await persistence.set('key1', entry);

      const size = await persistence.getSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('createPersistence', () => {
    const originalLocalStorage = global.localStorage;

    afterEach(() => {
      global.localStorage = originalLocalStorage;
    });

    it('should create LocalStoragePersistence when available', () => {
      global.localStorage = mockLocalStorage as any;
      const persistence = createPersistence();
      expect(persistence).toBeInstanceOf(LocalStoragePersistence);
    });

    it('should fallback to MemoryPersistence when localStorage unavailable', () => {
      global.localStorage = undefined as any;
      const persistence = createPersistence();
      expect(persistence).toBeInstanceOf(MemoryPersistence);
    });

    it('should fallback to MemoryPersistence when localStorage throws', () => {
      global.localStorage = {
        ...mockLocalStorage,
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError');
        }),
      } as any;

      const persistence = createPersistence();
      expect(persistence).toBeInstanceOf(MemoryPersistence);
    });

    it('should respect custom options', () => {
      global.localStorage = mockLocalStorage as any;
      const persistence = createPersistence({ prefix: 'custom:', maxSize: 1000 });
      expect(persistence).toBeInstanceOf(LocalStoragePersistence);
    });
  });
});
