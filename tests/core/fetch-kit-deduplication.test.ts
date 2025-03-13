// tests/core/fetch-kit-deduplication.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFetchKit } from '@core/fetch-kit';
import * as fetchModule from '@core/fetch';

// Mock the fetch module
vi.mock('@core/fetch', () => ({
  fetch: vi.fn(),
}));

describe('FetchKit Deduplication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should deduplicate identical GET requests', async () => {
    const fk = createFetchKit();

    // Mock successful response
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });

    // Make two identical requests in parallel
    const promise1 = fk.get('/users');
    const promise2 = fk.get('/users');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Both requests should return the same result
    expect(result1).toEqual({ data: 'test' });
    expect(result2).toEqual({ data: 'test' });

    // But fetch should only be called once
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
  });

  it('should not deduplicate different GET requests', async () => {
    const fk = createFetchKit();

    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'users' })
      .mockResolvedValueOnce({ data: 'posts' });

    // Make two different requests in parallel
    const usersPromise = fk.get('/users');
    const postsPromise = fk.get('/posts');

    const [usersResult, postsResult] = await Promise.all([usersPromise, postsPromise]);

    // Each request should return its own result
    expect(usersResult).toEqual({ data: 'users' });
    expect(postsResult).toEqual({ data: 'posts' });

    // Fetch should be called twice
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
  });

  it('should not deduplicate requests with different query parameters', async () => {
    const fk = createFetchKit();

    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'page1' })
      .mockResolvedValueOnce({ data: 'page2' });

    // Make requests with different query parameters
    const page1Promise = fk.get('/users', { params: { page: 1 } });
    const page2Promise = fk.get('/users', { params: { page: 2 } });

    const [page1Result, page2Result] = await Promise.all([page1Promise, page2Promise]);

    // Each request should return its own result
    expect(page1Result).toEqual({ data: 'page1' });
    expect(page2Result).toEqual({ data: 'page2' });

    // Fetch should be called twice
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
  });

  it('should allow disabling deduplication globally', async () => {
    const fk = createFetchKit({ deduplicate: false });

    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });

    // Make two identical requests in parallel
    const promise1 = fk.get('/users');
    const promise2 = fk.get('/users');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Each request should have its own response
    expect(result1).toEqual({ data: 'response1' });
    expect(result2).toEqual({ data: 'response2' });

    // Fetch should be called twice
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
  });

  it('should allow disabling deduplication per request', async () => {
    const fk = createFetchKit();

    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });

    // Make two identical requests in parallel but disable deduplication for the second
    const promise1 = fk.get('/users');
    const promise2 = fk.get('/users', { deduplicate: false });

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Each request should have its own response
    expect(result1).toEqual({ data: 'response1' });
    expect(result2).toEqual({ data: 'response2' });

    // Fetch should be called twice
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
  });

  it('should allow enabling deduplication per request when globally disabled', async () => {
    const fk = createFetchKit({ deduplicate: false });

    // Mock successful response
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });

    // Make two identical requests in parallel but enable deduplication for both
    const promise1 = fk.get('/users', { deduplicate: true });
    const promise2 = fk.get('/users', { deduplicate: true });

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Both requests should return the same result
    expect(result1).toEqual({ data: 'test' });
    expect(result2).toEqual({ data: 'test' });

    // Fetch should only be called once
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);
  });

  it('should not deduplicate non-GET requests', async () => {
    const fk = createFetchKit();

    // Mock successful responses
    vi.mocked(fetchModule.fetch)
      .mockResolvedValueOnce({ data: 'response1' })
      .mockResolvedValueOnce({ data: 'response2' });

    // Make two identical POST requests in parallel
    const promise1 = fk.post('/users', { name: 'John' });
    const promise2 = fk.post('/users', { name: 'John' });

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Each request should have its own response
    expect(result1).toEqual({ data: 'response1' });
    expect(result2).toEqual({ data: 'response2' });

    // Fetch should be called twice
    expect(fetchModule.fetch).toHaveBeenCalledTimes(2);
  });

  it('should correctly track and expose in-flight requests', async () => {
    const fk = createFetchKit();

    // Mock a delayed response
    vi.mocked(fetchModule.fetch).mockImplementationOnce(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve({ data: 'test' }), 100);
      });
    });

    // Start a request but don't await it
    const promise = fk.get('/users');

    // Check that it's tracked as in-flight
    expect(fk.getInFlightRequestsCount()).toBe(1);

    const requestKey = fk.getCacheKey('/users');
    expect(fk.isRequestInFlight(requestKey)).toBe(true);
    expect(fk.getInFlightRequestKeys()).toContain(requestKey);

    // Complete the request
    await promise;

    // Should no longer be in-flight
    expect(fk.getInFlightRequestsCount()).toBe(0);
    expect(fk.isRequestInFlight(requestKey)).toBe(false);
  });

  it('should cancel in-flight requests', async () => {
    const fk = createFetchKit();

    // Mock a response that never resolves during the test
    vi.mocked(fetchModule.fetch).mockImplementationOnce(() => {
      return new Promise(resolve => {
        // This will not resolve during the test
        setTimeout(() => resolve({ data: 'test' }), 10000);
      });
    });

    // Start a request but don't await it
    fk.get('/users');

    // Check it's tracked
    expect(fk.getInFlightRequestsCount()).toBe(1);

    // Cancel all requests
    fk.cancelInFlightRequests();

    // Should no longer be tracking the request
    expect(fk.getInFlightRequestsCount()).toBe(0);
  });

  it('should work with both caching and deduplication', async () => {
    const fk = createFetchKit();

    // Mock successful response
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });

    // First request - should fetch
    await fk.get('/users');
    expect(fetchModule.fetch).toHaveBeenCalledTimes(1);

    // Clear the mock to verify if it's called again
    vi.mocked(fetchModule.fetch).mockClear();

    // Make two identical requests in parallel - should use cache
    const promise1 = fk.get('/users');
    const promise2 = fk.get('/users');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Both should return cached result
    expect(result1).toEqual({ data: 'test' });
    expect(result2).toEqual({ data: 'test' });

    // Fetch should not be called again
    expect(fetchModule.fetch).not.toHaveBeenCalled();
  });
});
