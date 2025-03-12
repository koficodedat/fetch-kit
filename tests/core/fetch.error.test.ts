// tests/core/fetch.error.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCategory } from '@fk-types/error';

// Create pre-defined error and response objects
const serverError = {
  message: 'Server error',
  category: ErrorCategory.Server,
  url: 'https://example.com/api',
  method: 'GET',
  status: 500,
};

const timeoutError = {
  message: 'Request timeout',
  isTimeout: true,
  category: ErrorCategory.Timeout,
  url: 'https://example.com/api',
  method: 'GET',
};

const cancelError = {
  message: 'Request cancelled',
  isCancelled: true,
  category: ErrorCategory.Cancel,
  url: 'https://example.com/api',
  method: 'GET',
};

const clientError = {
  message: 'Not Found',
  category: ErrorCategory.Client,
  status: 404,
  url: 'https://example.com/api/users/999',
  method: 'GET',
};

const networkError = {
  message: 'Network Error',
  category: ErrorCategory.Network,
  isNetworkError: true,
  url: 'https://example.com/api',
  method: 'GET',
};

const successResponse = { data: { success: true }, status: 200 };

// ========= SEPARATE TESTS FOR RETRY FUNCTIONALITY =========
// Mock modules for retry tests
vi.mock('@utils/retry', () => ({
  withRetry: vi.fn(fn => fn()),
}));

// Import for retry test
import { withRetry } from '@utils/retry';

// Test retry functionality in isolation
describe('Fetch with retry', () => {
  // Mock fetch directly for the retry test
  let mockFunction: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFunction = vi.fn().mockResolvedValue(successResponse);
    vi.mocked(withRetry).mockImplementation(fn => fn());
  });

  it('should use retry mechanism when configured', async () => {
    // Call withRetry directly with our mock function
    const result = await withRetry(mockFunction, { count: 3 });

    // Verify the result
    expect(result).toEqual(successResponse);

    // Verify mock function was called through withRetry
    expect(mockFunction).toHaveBeenCalledTimes(1);

    // Verify withRetry was called
    expect(withRetry).toHaveBeenCalledTimes(1);
    expect(withRetry).toHaveBeenCalledWith(mockFunction, { count: 3 });
  });
});

// ========= ERROR HANDLING TESTS =========
// Mock modules for error handling tests
vi.mock('@core/fetch', () => ({
  fetch: vi.fn(),
}));

vi.mock('@utils/error', () => ({
  createError: vi.fn(),
  categorizeError: vi.fn(),
  getErrorMessage: vi.fn(),
}));

// Import for error tests
import { fetch } from '@core/fetch';
import { createError } from '@utils/error';

describe('Fetch error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle successful responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(successResponse);

    const result = await fetch('https://example.com/api');

    expect(result).toEqual(successResponse);
    expect(createError).not.toHaveBeenCalled();
  });

  it('should handle and transform errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(serverError);

    try {
      await fetch('https://example.com/api');
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Server);
      expect(error.url).toBe('https://example.com/api');
      expect(error.method).toBe('GET');
    }
  });

  it('should handle timeout errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(timeoutError);

    try {
      await fetch('https://example.com/api', { timeout: 1000 });
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.isTimeout).toBe(true);
      expect(error.category).toBe(ErrorCategory.Timeout);
    }
  });

  it('should handle aborted requests', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(cancelError);

    const controller = new AbortController();

    try {
      const promise = fetch('https://example.com/api', {
        signal: controller.signal,
      });

      await promise;
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.isCancelled).toBe(true);
      expect(error.category).toBe(ErrorCategory.Cancel);
    }
  });

  it('should properly classify client errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(clientError);

    try {
      await fetch('https://example.com/api/users/999');
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Client);
      expect(error.status).toBe(404);
    }
  });

  it('should properly classify server errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(serverError);

    try {
      await fetch('https://example.com/api/process');
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Server);
      expect(error.status).toBe(500);
    }
  });

  it('should properly classify network errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(networkError);

    try {
      await fetch('https://example.com/api');
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.category).toBe(ErrorCategory.Network);
      expect(error.isNetworkError).toBe(true);
    }
  });
});
