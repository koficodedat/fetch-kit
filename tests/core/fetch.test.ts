// tests/core/fetch.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCategory } from '@fk-types/error';

// Mock the error module
vi.mock('@utils/error', () => ({
  createError: vi.fn((message, options) => {
    // Create an error object with all the options as properties
    const error = new Error(message);
    return Object.assign(error, options);
  }),
  categorizeError: vi.fn(error => {
    // If the error has name 'AbortError' and isTimeout is true, return timeout category
    if (error.name === 'AbortError' && error.isTimeout === true) {
      return ErrorCategory.Timeout;
    }
    // Check HTTP status codes
    if (error.status) {
      if (error.status >= 400 && error.status < 500) {
        return ErrorCategory.Client;
      }
      if (error.status >= 500) {
        return ErrorCategory.Server;
      }
    }
    // Default to unknown
    return ErrorCategory.Unknown;
  }),
  getErrorMessage: vi.fn(error => {
    // Return appropriate messages based on status code
    if (error.status) {
      switch (error.status) {
        case 404:
          return 'Not Found: The requested resource was not found';
        case 400:
          return 'Bad Request: The server could not understand the request';
        case 401:
          return 'Unauthorized: Authentication is required';
        case 403:
          return 'Forbidden: You do not have permission to access this resource';
        case 500:
          return 'Internal Server Error: The server encountered an unexpected condition';
        default:
          if (error.status >= 400 && error.status < 500) {
            return `Client Error: The request failed with status code ${error.status}`;
          }
          if (error.status >= 500) {
            return `Server Error: The server failed to process the request with status code ${error.status}`;
          }
      }
    }

    // Handle specific error types
    if (error.isTimeout) {
      return 'Request Timeout: The request took too long to complete';
    }

    return error.message || 'Unknown error';
  }),
}));

// Import after the mocks
import { fetch } from '@core/fetch';

// Helper to create a proper mock response
function createMockResponse(options = {}) {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'application/json',
    body = { data: 'test' },
  } = options as any;

  const headersMap = new Map([['content-type', contentType]]);

  return {
    ok,
    status,
    statusText,
    headers: {
      get: (name: any) => headersMap.get(name.toLowerCase()),
      has: (name: any) => headersMap.has(name.toLowerCase()),
      forEach: (callback: any) => headersMap.forEach((value, key) => callback(value, key)),
    },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)])),
  };
}

describe('fetch wrapper', () => {
  // Mock global fetch
  const mockGlobalFetch = vi.fn();
  global.fetch = mockGlobalFetch;

  beforeEach(() => {
    mockGlobalFetch.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should make a simple GET request', async () => {
    // Create a proper mock response
    const mockResponse = createMockResponse();
    mockGlobalFetch.mockResolvedValueOnce(mockResponse);

    const result = await fetch('https://example.com/api');

    expect(mockGlobalFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        method: 'GET',
      }),
    );

    expect(result).toEqual({ data: 'test' });
  });

  it('should handle error responses', async () => {
    // Create an error response
    const mockResponse = createMockResponse({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      body: { error: 'Resource not found' },
    });

    mockGlobalFetch.mockResolvedValueOnce(mockResponse);

    try {
      await fetch('https://example.com/api');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.status).toBe(404);
      expect(error.message).toContain('Not Found');
    }
  });

  it('should handle timeouts correctly', async () => {
    // Create an abort error that will trigger the timeout logic
    const abortError = new DOMException('The operation was aborted', 'AbortError');

    // Set isTimeout to true which will make categorizeError return Timeout category
    Object.defineProperty(abortError, 'isTimeout', {
      value: true,
      configurable: true,
    });

    // Make fetch throw our abort error
    mockGlobalFetch.mockRejectedValueOnce(abortError);

    try {
      await fetch('https://example.com/api', { timeout: 1000 });
      // If we reach here, the test fails
      expect(true).toBe(false);
    } catch (error: any) {
      // Verify error category and timeout flag
      expect(error.category).toBe(ErrorCategory.Timeout);
      expect(error.isTimeout).toBe(true);
    }
  });

  it('should serialize query parameters correctly', async () => {
    const mockResponse = createMockResponse();
    mockGlobalFetch.mockResolvedValueOnce(mockResponse);

    await fetch('https://example.com/api', {
      params: {
        id: 123,
        filter: ['active', 'pending'],
        nested: { key: 'value' },
      },
    });

    // Get the URL that was passed to fetch
    const calledUrl = mockGlobalFetch.mock.calls[0][0];
    const url = new URL(calledUrl);

    // Verify params were serialized correctly
    expect(url.searchParams.get('id')).toBe('123');
    expect(url.searchParams.getAll('filter')).toEqual(['active', 'pending']);
    expect(url.searchParams.get('nested[key]')).toBe('value');
  });

  it('should support different response types', async () => {
    // Test text response
    const textResponse = createMockResponse({
      contentType: 'text/plain',
      body: 'plain text response',
      isJson: false,
    });

    mockGlobalFetch.mockResolvedValueOnce(textResponse);

    const textResult = await fetch('https://example.com/api', {
      responseType: 'text',
    });

    expect(textResult).toBe('"plain text response"');
    expect(textResponse.text).toHaveBeenCalled();

    // Test blob response
    const blobResponse = createMockResponse({
      contentType: 'application/octet-stream',
    });

    mockGlobalFetch.mockResolvedValueOnce(blobResponse);

    await fetch('https://example.com/api', {
      responseType: 'blob',
    });

    expect(blobResponse.blob).toHaveBeenCalled();
  });
});
