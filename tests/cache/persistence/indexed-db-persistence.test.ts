// tests/cache/persistence/indexed-db-persistence.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexedDBPersistence } from '@cache/persistence/indexed-db-persistence';
import { createCacheEntry } from '@cache/cache-entry';

// Mock IndexedDB
class MockIDBFactory {
  private databases: Record<string, MockIDBDatabase> = {};

  // Add missing methods required by IDBFactory interface
  cmp(): number {
    return 0; // Mock implementation - not used in tests
  }

  deleteDatabase(name: string): IDBOpenDBRequest {
    delete this.databases[name];
    const request = new MockIDBOpenDBRequest();

    // Simulate successful deletion
    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess(null as any);
      }
    }, 0);

    return request as unknown as IDBOpenDBRequest;
  }

  open(name: string, version?: number): MockIDBOpenDBRequest {
    const request = new MockIDBOpenDBRequest();

    if (!this.databases[name]) {
      this.databases[name] = new MockIDBDatabase(name, version || 1);
      request._result = this.databases[name];

      // Simulate onupgradeneeded event
      setTimeout(() => {
        if (request.onupgradeneeded) {
          const event = { target: request } as any;
          request.onupgradeneeded(event);
        }

        // Then simulate onsuccess event
        if (request.onsuccess) {
          request.onsuccess(null as any);
        }
      }, 0);
    } else {
      request._result = this.databases[name];

      // Simulate onsuccess event
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess(null as any);
        }
      }, 0);
    }

    return request;
  }
}

class MockIDBDatabase {
  objectStoreNames: { contains: (name: string) => boolean } = {
    contains: () => false,
  };
  private stores: Record<string, MockIDBObjectStore> = {};

  constructor(
    public name: string,
    public version: number,
  ) {}

  createObjectStore(name: string, options: any): MockIDBObjectStore {
    this.stores[name] = new MockIDBObjectStore(name, options);
    this.objectStoreNames.contains = storeName =>
      storeName === name || Object.keys(this.stores).includes(storeName);
    return this.stores[name];
  }

  transaction(storeNames: string | string[]): MockIDBTransaction {
    const transaction = new MockIDBTransaction(storeNames);
    return transaction;
  }

  close(): void {}
}

class MockIDBTransaction {
  oncomplete: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(private storeNames: string | string[]) {
    // Auto-complete the transaction after a short delay
    setTimeout(() => {
      if (this.oncomplete) {
        this.oncomplete(null as any);
      }
    }, 10);
  }

  objectStore(): MockIDBObjectStore {
    const storeName = Array.isArray(this.storeNames) ? this.storeNames[0] : this.storeNames;
    return new MockIDBObjectStore(storeName, { keyPath: 'key' });
  }
}

// Shared data store to simulate a real database that persists across all store instances
const mockDBStore = new Map<string, Map<string, any>>();

class MockIDBObjectStore {
  constructor(
    public name: string,
    private options: any,
  ) {
    // Ensure store exists in shared database
    if (!mockDBStore.has(name)) {
      mockDBStore.set(name, new Map());
    }
  }

  private get data(): Map<string, any> {
    return mockDBStore.get(this.name) || new Map();
  }

  createIndex(name: string): MockIDBIndex {
    return new MockIDBIndex(name);
  }

  index(name: string): MockIDBIndex {
    return new MockIDBIndex(name);
  }

  put(value: any): MockIDBRequest<any> {
    const key = value[this.options.keyPath];
    this.data.set(key, value);

    const request = new MockIDBRequest<any>();
    request._result = key;

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess(null as any);
      }
    }, 0);

    return request;
  }

  get(key: string): MockIDBRequest<any> {
    const request = new MockIDBRequest<any>();
    request._result = this.data.get(key);

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess(null as any);
      }
    }, 0);

    return request;
  }

  delete(key: string): MockIDBRequest<any> {
    const exists = this.data.has(key);
    this.data.delete(key);

    const request = new MockIDBRequest<any>();
    request._result = exists;

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess(null as any);
      }
    }, 0);

    return request;
  }

  clear(): MockIDBRequest<any> {
    this.data.clear();

    const request = new MockIDBRequest<any>();
    request._result = undefined;

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess(null as any);
      }
    }, 0);

    return request;
  }

  getAllKeys(): MockIDBRequest<any[]> {
    const request = new MockIDBRequest<any[]>();
    request._result = Array.from(this.data.keys());

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess(null as any);
      }
    }, 0);

    return request;
  }

  getAll(): MockIDBRequest<any[]> {
    const request = new MockIDBRequest<any[]>();
    request._result = Array.from(this.data.values());

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess(null as any);
      }
    }, 0);

    return request;
  }
}

class MockIDBIndex {
  constructor(public name: string) {}

  openCursor(_range?: any): MockIDBRequest<any> {
    const request = new MockIDBRequest<any>();

    // Create a mock cursor that will just return null to indicate no more entries
    request._result = {
      continue: function () {
        // When continue is called, call onsuccess with null result
        setTimeout(() => {
          if (request.onsuccess) {
            request._result = null;
            request.onsuccess({ target: request } as any);
          }
        }, 0);
      },
      delete: function () {
        // Simulate successful deletion
        return {
          onsuccess: null,
          onerror: null,
        };
      },
      value: { key: 'test-key', expiresAt: Date.now() - 1000 }, // Expired entry
    };

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess({ target: request } as any);
      }
    }, 0);

    return request;
  }
}

class MockIDBRequest<T> {
  onsuccess: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  _result: T | undefined;

  get result(): T {
    return this._result as T;
  }

  // Add properties needed for IDBRequest compatibility
  readonly error: DOMException | null = null;
  readonly readyState: IDBRequestReadyState = 'done';
  readonly source: IDBObjectStore | IDBIndex | IDBCursor | null = null;
  readonly transaction: IDBTransaction | null = null;
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => true);
}

class MockIDBOpenDBRequest extends MockIDBRequest<MockIDBDatabase> {
  onupgradeneeded: ((event: any) => void) | null = null;
}

// Add mock for IDBKeyRange
class MockIDBKeyRange {
  static upperBound(value: any) {
    return { upper: value, lowerOpen: false, upperOpen: false, includes: () => true };
  }

  static lowerBound(value: any) {
    return { lower: value, lowerOpen: false, upperOpen: false, includes: () => true };
  }

  static bound(lower: any, upper: any) {
    return { lower, upper, lowerOpen: false, upperOpen: false, includes: () => true };
  }

  // Static properties needed for IDBKeyRange compatibility
  static readonly only = (value: any) => ({ only: value, includes: () => true });
}

// Setup global mock
const mockIndexedDB = new MockIDBFactory();

describe('IndexedDBPersistence', () => {
  let persistence: IndexedDBPersistence;
  const originalIndexedDB = global.indexedDB;
  const originalWindow = global.window;
  const originalIDBKeyRange = global.IDBKeyRange;

  beforeEach(() => {
    // Set up the mock window with indexedDB
    global.window = { indexedDB: mockIndexedDB } as any;
    // Cast mock to IDBFactory to avoid TypeScript errors
    global.indexedDB = mockIndexedDB as unknown as IDBFactory;
    global.IDBKeyRange = MockIDBKeyRange as unknown as typeof IDBKeyRange;

    persistence = new IndexedDBPersistence({
      dbName: 'test-db',
      storeName: 'cache-store',
    });
  });

  afterEach(() => {
    global.window = originalWindow;
    global.indexedDB = originalIndexedDB;
    global.IDBKeyRange = originalIDBKeyRange;
  });

  it('should store and retrieve cache entries', async () => {
    const entry = createCacheEntry('test-data');
    await persistence.set('key1', entry);

    const retrieved = await persistence.get('key1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.data).toEqual(entry.data);
  });

  it('should handle non-existent keys', async () => {
    const result = await persistence.get('non-existent');
    expect(result).toBeUndefined();
  });

  it('should check if a key exists', async () => {
    const entry = createCacheEntry('test-data');
    await persistence.set('key1', entry);

    expect(await persistence.has('key1')).toBe(true);
    expect(await persistence.has('key2')).toBe(false);
  });

  it('should delete entries correctly', async () => {
    const entry = createCacheEntry('test-data');
    await persistence.set('key1', entry);

    expect(await persistence.has('key1')).toBe(true);

    const result = await persistence.delete('key1');
    expect(result).toBe(true);
    expect(await persistence.has('key1')).toBe(false);
  });

  it('should clear all entries', async () => {
    await persistence.set('key1', createCacheEntry('data1'));
    await persistence.set('key2', createCacheEntry('data2'));

    await persistence.clear();

    expect(await persistence.has('key1')).toBe(false);
    expect(await persistence.has('key2')).toBe(false);
  });

  it('should track storage size', async () => {
    // Initial size should be 0
    expect(await persistence.getSize()).toBe(0);

    // Add some data
    await persistence.set('key1', createCacheEntry('test-data'));

    // Size should be greater than 0
    expect(await persistence.getSize()).toBeGreaterThan(0);
  });

  it('should handle cache size limits', async () => {
    // Skip overriding methods and directly test the expected behavior
    const smallPersistence = new IndexedDBPersistence({
      maxSize: 50, // Very small size limit
    });

    // Override the getAllEntries method to simulate a full storage
    const originalGetAllEntries = smallPersistence['getAllEntries'];
    const fakeLargeEntries = [{ size: 1000000 }]; // Already over the limit

    // We need to properly stub the internal method to return large entries
    smallPersistence['getAllEntries'] = async function () {
      return fakeLargeEntries as any[];
    };

    try {
      // This should throw because the storage is already "full"
      // from our faked getAllEntries response
      await expect(async () => {
        await smallPersistence.set('key2', createCacheEntry('test'));
      }).rejects.toThrow();
    } finally {
      // Restore original method to avoid affecting other tests
      if (originalGetAllEntries) {
        smallPersistence['getAllEntries'] = originalGetAllEntries;
      }
    }
  });

  it('should close the database connection', async () => {
    // Spy on the close method
    const closeSpy = vi.spyOn(MockIDBDatabase.prototype, 'close');

    // Set some data to ensure connection is open
    await persistence.set('key1', createCacheEntry('test-data'));

    // Close the connection
    await persistence.close();

    // The close method should have been called
    expect(closeSpy).toHaveBeenCalled();
  });
});
