// tests/core/fetch-kit-cache.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchKit } from '@core/fetch-kit';
import * as fetchModule from '@core/fetch';

// Mock the fetch module
vi.mock('@core/fetch', () => ({
  fetch: vi.fn(),
}));

describe('FetchKit caching', () => {
  // Mock Date.now for predictable testing
  const originalDateNow = Date.now;
  let mockNow = 1609459200000; // 2021-01-01
  
  beforeEach(() => {
    vi.resetAllMocks();
    Date.now = vi.fn(() => mockNow);
  });
  
  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('should cache GET requests by default', async () => {
    const fk = createFetchKit();
    
    // Mock successful response
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });
    
    // First request should fetch
    const result1 = await fk.get('/users');
    expect(result1).toEqual({ data: 'test' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    
    // Second request should use cache
    const result2 = await fk.get('/users');
    expect(result2).toEqual({ data: 'test' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1); // No additional fetch
  });
  
  it('should not cache POST requests', async () => {
    const fk = createFetchKit();
    
    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });
    
    // First POST request
    const result1 = await fk.post('/users', { name: 'User 1' });
    expect(result1).toEqual({ data: 'response1' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    
    // Second POST request
    const result2 = await fk.post('/users', { name: 'User 2' });
    expect(result2).toEqual({ data: 'response2' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2); // Additional fetch
  });
  
  it('should cache GET requests with different params separately', async () => {
    const fk = createFetchKit();
    
    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'page1' })
      .mockResolvedValueOnce({ data: 'page2' });
    
    // Request page 1
    const page1 = await fk.get('/users', { params: { page: 1 } });
    expect(page1).toEqual({ data: 'page1' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    
    // Request page 2
    const page2 = await fk.get('/users', { params: { page: 2 } });
    expect(page2).toEqual({ data: 'page2' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2); // New request
    
    // Request page 1 again (should use cache)
    const page1Again = await fk.get('/users', { params: { page: 1 } });
    expect(page1Again).toEqual({ data: 'page1' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2); // No additional fetch
  });
  
  it('should return stale data while revalidating', async () => {
    const fk = createFetchKit({
      cacheOptions: {
        staleTime: 5000, // 5 seconds
        cacheTime: 60000, // 1 minute
      }
    });
    
    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });
    
    // First request
    const result1 = await fk.get('/users');
    expect(result1).toEqual({ data: 'response1' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    
    // Advance time to make data stale
    mockNow += 10000; // 10 seconds later
    
    // Second request should return stale data immediately and revalidate
    const result2 = await fk.get('/users');
    expect(result2).toEqual({ data: 'response1' }); // Still returns stale data
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1); // Background fetch in progress
    
    // Wait for revalidation
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2); // Revalidation complete
    
    // Third request should return fresh data
    const result3 = await fk.get('/users');
    expect(result3).toEqual({ data: 'response2' }); // Updated data
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2); // No additional fetch
  });
  
  it('should bypass cache when explicitly disabled', async () => {
    const fk = createFetchKit();
    
    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });
    
    // First request with cache
    const result1 = await fk.get('/users');
    expect(result1).toEqual({ data: 'response1' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    
    // Second request with cache disabled
    const result2 = await fk.get('/users', { cacheOptions: false });
    expect(result2).toEqual({ data: 'response2' });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2); // New request
  });
  
  it('should invalidate cache correctly', async () => {
    const fk = createFetchKit();
    
    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });
    
    // First request
    await fk.get('/users');
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    
    // Get cache key
    const cacheKey = fk.getCacheKey('/users');
    
    // Invalidate specific cache entry
    fk.invalidateCache(cacheKey);
    
    // Second request should fetch again
    await fk.get('/users');
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
  });
  
  it('should invalidate matching cache entries', async () => {
    const fk = createFetchKit();
    
    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'users1' })
      .mockResolvedValueOnce({ data: 'posts1' })
      .mockResolvedValueOnce({ data: 'users2' })
      .mockResolvedValueOnce({ data: 'posts2' });
    
    // Create multiple cache entries
    await fk.get('/users');
    await fk.get('/posts');
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
    
    // Invalidate all user-related entries
    fk.invalidateCacheMatching(key => key.includes('users'));
    
    // Fetch again
    await fk.get('/users'); // Should fetch
    await fk.get('/posts'); // Should use cache
    expect(fetchModule.fetch).toHaveBeenCalledTimes(3);
  });
  
  it('should support custom cache keys', async () => {
    const fk = createFetchKit();
    
    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });
    
    // First request with custom cache key
    await fk.get('/users', { 
      cacheOptions: { cacheKey: 'custom-key' } 
    });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
    
    // Second request with same custom cache key but different URL
    await fk.get('/different-url', { 
      cacheOptions: { cacheKey: 'custom-key' } 
    });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1); // Uses cache
    
    // Invalidate by custom key
    fk.invalidateCache('custom-key');
    
    // Third request should fetch again
    await fk.get('/users', { 
      cacheOptions: { cacheKey: 'custom-key' } 
    });
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
  });
});