// tests/core/request-deduper.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestDeduper } from '@core/request-deduper';

describe('RequestDeduper', () => {
  let requestDeduper: RequestDeduper;

  beforeEach(() => {
    requestDeduper = new RequestDeduper();
  });

  it('should deduplicate identical requests', async () => {
    // Create a mock function that counts calls
    let callCount = 0;
    const mockFn = vi.fn(() => {
      callCount++;
      return Promise.resolve(`data-${callCount}`);
    });

    // Execute the same request twice in parallel
    const promise1 = requestDeduper.dedupe('test-key', mockFn);
    const promise2 = requestDeduper.dedupe('test-key', mockFn);

    // Both promises should resolve to the same result
    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe('data-1');
    expect(result2).toBe('data-1');
    expect(mockFn).toHaveBeenCalledTimes(1); // Function should only be called once
  });

  it('should allow different requests to proceed independently', async () => {
    // Create a mock function that counts calls
    let callCount = 0;
    const mockFn = vi.fn(() => {
      callCount++;
      return Promise.resolve(`data-${callCount}`);
    });

    // Execute different requests in parallel
    const result1 = await requestDeduper.dedupe('key1', mockFn);
    const result2 = await requestDeduper.dedupe('key2', mockFn);

    expect(result1).toBe('data-1');
    expect(result2).toBe('data-2');
    expect(mockFn).toHaveBeenCalledTimes(2); // Function should be called twice
  });

  it('should clean up references after requests complete', async () => {
    const mockFn = vi.fn(() => Promise.resolve('data'));

    // Execute a request
    await requestDeduper.dedupe('test-key', mockFn);

    // Reference should be cleaned up
    expect(requestDeduper.isInFlight('test-key')).toBe(false);
    expect(requestDeduper.getInFlightCount()).toBe(0);
  });

  it('should clean up references after requests fail', async () => {
    const mockFn = vi.fn(() => Promise.reject(new Error('test error')));

    // Execute a request that will fail
    try {
      await requestDeduper.dedupe('test-key', mockFn);
    } catch {
      // Expected to fail
    }

    // Reference should be cleaned up despite the failure
    expect(requestDeduper.isInFlight('test-key')).toBe(false);
    expect(requestDeduper.getInFlightCount()).toBe(0);
  });

  it('should track in-flight requests correctly', async () => {
    // Create a promise that resolves after a delay
    const delayedPromise = () => new Promise(resolve => setTimeout(() => resolve('data'), 50));

    // Start a request but don't await it
    const promise = requestDeduper.dedupe('test-key', () => delayedPromise());

    // Check if it's tracked correctly
    expect(requestDeduper.isInFlight('test-key')).toBe(true);
    expect(requestDeduper.getInFlightCount()).toBe(1);
    expect(requestDeduper.getInFlightKeys()).toEqual(['test-key']);

    // Wait for it to complete
    await promise;

    // Should be cleaned up
    expect(requestDeduper.getInFlightCount()).toBe(0);
  });

  it('should clear all in-flight requests', async () => {
    // Create promises that never resolve during the test
    const neverResolve = () => new Promise(() => {});

    // Start multiple requests
    requestDeduper.dedupe('key1', neverResolve);
    requestDeduper.dedupe('key2', neverResolve);
    requestDeduper.dedupe('key3', neverResolve);

    expect(requestDeduper.getInFlightCount()).toBe(3);

    // Clear all requests
    requestDeduper.clearInFlightRequests();

    expect(requestDeduper.getInFlightCount()).toBe(0);
  });
});
