// tests/cache/persistence/cache-persistence.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LocalStoragePersistence,
  MemoryPersistence,
  createPersistence,
} from '@cache/persistence/cache-persistence';
import { SessionStoragePersistence } from '@cache/persistence/session-storage-persistence';
import { IndexedDBPersistence } from '@cache/persistence/indexed-db-persistence';
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
    const originalSessionStorage = global.sessionStorage;
    const originalWindow = global.window;

    afterEach(() => {
      global.localStorage = originalLocalStorage;
      global.sessionStorage = originalSessionStorage;
      global.window = originalWindow;
    });

    it('should create LocalStoragePersistence when requested', () => {
      global.localStorage = mockLocalStorage as any;
      const persistence = createPersistence({ type: 'localStorage' });
      expect(persistence).toBeInstanceOf(LocalStoragePersistence);
    });

    it('should create SessionStoragePersistence when requested', () => {
      // Mock both storage types to ensure proper implementation
      global.localStorage = undefined as any;
      global.sessionStorage = mockLocalStorage as any;
      const persistence = createPersistence({ type: 'sessionStorage' });
      expect(persistence).toBeInstanceOf(SessionStoragePersistence);
    });

    it('should create IndexedDBPersistence when requested', () => {
      // Mock indexedDB and make sure localStorage is disabled
      global.localStorage = undefined as any;
      global.window = { indexedDB: {} } as any;
      const persistence = createPersistence({ type: 'indexedDB' });
      expect(persistence).toBeInstanceOf(IndexedDBPersistence);
    });

    it('should create MemoryPersistence when requested', () => {
      const persistence = createPersistence({ type: 'memory' });
      expect(persistence).toBeInstanceOf(MemoryPersistence);
    });

    it('should fallback to next persistence type when preferred type is unavailable', () => {
      // Make IndexedDB unavailable but localStorage available
      global.window = {} as any;
      global.localStorage = mockLocalStorage as any;

      // Request IndexedDB with fallback to localStorage
      const persistence = createPersistence({
        type: 'indexedDB',
        fallbackOrder: ['indexedDB', 'localStorage', 'memory'],
      });

      // Should fallback to localStorage
      expect(persistence).toBeInstanceOf(LocalStoragePersistence);
    });

    it('should fallback to memory persistence when all else fails', () => {
      // Make all browser storage unavailable
      global.window = {} as any;
      global.localStorage = undefined as any;
      global.sessionStorage = undefined as any;

      const persistence = createPersistence();
      expect(persistence).toBeInstanceOf(MemoryPersistence);
    });

    it('should respect custom options', () => {
      global.localStorage = mockLocalStorage as any;
      const persistence = createPersistence({
        type: 'localStorage',
        prefix: 'custom:',
        maxSize: 1000,
      });
      expect(persistence).toBeInstanceOf(LocalStoragePersistence);
    });

    it('should handle auto persistence type based on environment detection', () => {
      // Set up browser environment with all storage types available
      // Disable localStorage to ensure it chooses the correct one
      global.localStorage = undefined as any;
      global.sessionStorage = mockLocalStorage as any;
      global.window = { indexedDB: {} } as any;

      // With custom fallback order, should prefer sessionStorage after IndexedDB
      const persistence = createPersistence({
        type: 'auto',
        fallbackOrder: ['indexedDB', 'sessionStorage', 'localStorage', 'memory'],
      });
      expect(persistence).toBeInstanceOf(IndexedDBPersistence);
    });
  });
});
