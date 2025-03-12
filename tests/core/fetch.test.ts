// tests/core/fetch.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetch } from '@core/fetch';

// Helper to create a proper mock response
function createMockResponse(options = {}) {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'application/json',
    body = { data: 'test' },
  } = options;

  const headersMap = new Map([['content-type', contentType]]);

  return {
    ok,
    status,
    statusText,
    headers: {
      get: name => headersMap.get(name.toLowerCase()),
      has: name => headersMap.has(name.toLowerCase()),
      forEach: callback => headersMap.forEach((value, key) => callback(value, key)),
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
    vi.useFakeTimers();

    // Create a controller to simulate timeout
    const controller = new AbortController();

    // Mock a never-resolving fetch
    mockGlobalFetch.mockImplementationOnce(
      () =>
        new Promise(() => {
          // Intentionally never resolves
        }),
    );

    const fetchPromise = fetch('https://example.com/api', {
      timeout: 1000,
      signal: controller.signal,
    });

    // Fast-forward time past timeout
    vi.advanceTimersByTime(1100);

    try {
      await fetchPromise;
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.isTimeout).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // it('should support request cancellation', async () => {
  //   // Create abort controller
  //   const controller = new AbortController();

  //   // Mock a never-resolving fetch
  //   mockGlobalFetch.mockImplementationOnce(
  //     () =>
  //       new Promise(() => {
  //         // Intentionally never resolves
  //       }),
  //   );

  //   // Start fetch
  //   const fetchPromise = fetch('https://example.com/api', {
  //     signal: controller.signal,
  //   });

  //   // Abort the request
  //   controller.abort();

  //   try {
  //     await fetchPromise;
  //     // Should not reach here
  //     expect(true).toBe(false);
  //   } catch (error: any) {
  //     expect(error.isCancelled).toBe(true);
  //   }
  // });

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
