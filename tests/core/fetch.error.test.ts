// tests/core/fetch-error.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetch } from '@core/fetch';
import { ErrorCategory } from '@fk-types/error';
import * as errorUtils from '@utils/error';
import * as retryUtils from '@utils/retry';

// Mock the adapter registry
vi.mock('@adapters/adapter-registry', () => ({
  adapterRegistry: {
    getActive: vi.fn().mockReturnValue({
      transformRequest: vi.fn().mockImplementation((url, options) => ({
        url,
        method: options.method || 'GET',
      })),
      request: vi.fn(),
    }),
  },
}));

describe('Fetch error handling', () => {
  const mockAdapter = {
    transformRequest: vi.fn().mockImplementation((url, options) => ({
      url,
      method: options.method || 'GET',
    })),
    request: vi.fn(),
  };

  // Mock the adapterRegistry.getActive
  const getActiveMock = vi.fn().mockReturnValue(mockAdapter);
  vi.mocked(require('@adapters/adapter-registry').adapterRegistry.getActive).mockImplementation(
    getActiveMock,
  );

  // Spy on error utility functions
  const createErrorSpy = vi.spyOn(errorUtils, 'createError');
  const categorizeErrorSpy = vi.spyOn(errorUtils, 'categorizeError');
  const withRetrySpy = vi.spyOn(retryUtils, 'withRetry');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle successful responses', async () => {
    // Mock successful response
    mockAdapter.request.mockResolvedValueOnce({
      data: { success: true },
      status: 200,
    });

    const result = await fetch('https://example.com/api');

    expect(result).toEqual({ success: true });
    expect(createErrorSpy).not.toHaveBeenCalled();
    expect(withRetrySpy).not.toHaveBeenCalled();
  });

  it('should handle and transform errors', async () => {
    // Mock error
    const mockError = new Error('Request failed');
    mockAdapter.request.mockRejectedValueOnce(mockError);

    // Mock categorize to return Server error
    categorizeErrorSpy.mockReturnValueOnce(ErrorCategory.Server);

    try {
      await fetch('https://example.com/api');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Server);
      expect(error.url).toBe('https://example.com/api');
      expect(error.method).toBe('GET');
      expect(createErrorSpy).toHaveBeenCalled();
    }
  });

  it('should use retry mechanism when configured', async () => {
    // Setup withRetry to return success
    withRetrySpy.mockImplementationOnce(fn => fn());

    // Mock adapter to succeed
    mockAdapter.request.mockResolvedValueOnce({
      data: { success: true },
      status: 200,
    });

    const result = await fetch('https://example.com/api', {
      retry: { count: 3 },
    });

    expect(result).toEqual({ success: true });
    expect(withRetrySpy).toHaveBeenCalledTimes(1);
  });

  it('should handle timeout errors', async () => {
    // Setup timeouts and abort controller
    vi.useFakeTimers();

    // Mock adapter to never resolve
    mockAdapter.request.mockImplementationOnce(() => new Promise(() => {}));

    // Use shorter timeout for test
    const fetchPromise = fetch('https://example.com/api', { timeout: 1000 });

    // Advance time to trigger timeout
    vi.advanceTimersByTime(1500);

    try {
      await fetchPromise;
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.isTimeout).toBe(true);
      expect(error.category).toBe(ErrorCategory.Timeout);
    }

    vi.useRealTimers();
  });

  it('should handle aborted requests', async () => {
    // Setup abort controller
    const controller = new AbortController();

    // Mock adapter to never resolve
    mockAdapter.request.mockImplementationOnce(() => new Promise(() => {}));

    // Start request
    const fetchPromise = fetch('https://example.com/api', {
      signal: controller.signal,
    });

    // Abort the request
    controller.abort();

    try {
      await fetchPromise;
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.isCancelled).toBe(true);
      expect(error.category).toBe(ErrorCategory.Cancel);
    }
  });

  it('should properly classify error types', async () => {
    // Test client error (404)
    mockAdapter.request.mockRejectedValueOnce({
      status: 404,
      data: { message: 'Not found' },
    });
    categorizeErrorSpy.mockReturnValueOnce(ErrorCategory.Client);

    try {
      await fetch('https://example.com/api/users/999');
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Client);
      expect(error.status).toBe(404);
    }

    // Reset mocks
    vi.clearAllMocks();

    // Test server error (500)
    mockAdapter.request.mockRejectedValueOnce({
      status: 500,
      data: { message: 'Server error' },
    });
    categorizeErrorSpy.mockReturnValueOnce(ErrorCategory.Server);

    try {
      await fetch('https://example.com/api/process');
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Server);
      expect(error.status).toBe(500);
    }

    // Reset mocks
    vi.clearAllMocks();

    // Test network error
    mockAdapter.request.mockRejectedValueOnce(new Error('Failed to fetch'));
    categorizeErrorSpy.mockReturnValueOnce(ErrorCategory.Network);

    try {
      await fetch('https://example.com/api');
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Network);
      expect(error.isNetworkError).toBe(true);
    }
  });
});
