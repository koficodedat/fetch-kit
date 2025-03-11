// tests/cache/cache-key.test.ts

import { describe, it, expect } from 'vitest';
import { generateCacheKey } from '@cache/cache-key';

describe('Cache Key Generation', () => {
  it('generates unique keys for different URLs', () => {
    const key1 = generateCacheKey('/users');
    const key2 = generateCacheKey('/posts');

    expect(key1).not.toEqual(key2);
  });

  it('generates unique keys for different methods', () => {
    const key1 = generateCacheKey('/users', { method: 'GET' });
    const key2 = generateCacheKey('/users', { method: 'POST' });

    expect(key1).not.toEqual(key2);
  });

  it('generates unique keys for different params', () => {
    const key1 = generateCacheKey('/users', { params: { page: 1 } });
    const key2 = generateCacheKey('/users', { params: { page: 2 } });

    expect(key1).not.toEqual(key2);
  });

  it('generates consistent keys regardless of param order', () => {
    const key1 = generateCacheKey('/users', { params: { a: 1, b: 2 } });
    const key2 = generateCacheKey('/users', { params: { b: 2, a: 1 } });

    expect(key1).toEqual(key2);
  });

  it('handles nested objects in params', () => {
    const key1 = generateCacheKey('/users', {
      params: { filter: { status: 'active', role: 'admin' } },
    });

    const key2 = generateCacheKey('/users', {
      params: { filter: { role: 'admin', status: 'active' } },
    });

    expect(key1).toEqual(key2);
  });

  it('includes body in key for mutation methods', () => {
    const key1 = generateCacheKey('/users', {
      method: 'POST',
      body: { name: 'John' },
    });

    const key2 = generateCacheKey('/users', {
      method: 'POST',
      body: { name: 'Jane' },
    });

    expect(key1).not.toEqual(key2);
  });

  it('ignores body in key for GET requests', () => {
    const key1 = generateCacheKey('/users', {
      method: 'GET',
      body: { some: 'data' },
    });

    const key2 = generateCacheKey('/users', {
      method: 'GET',
    });

    expect(key1).toEqual(key2);
  });
});
