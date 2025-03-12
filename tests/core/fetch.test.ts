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
    isJson = true,
  } = options;

  // Create a headers map with proper methods
  const headersMap = new Map();
  headersMap.set('content-type', contentType);

  const responseHeaders = {
    get: name => headersMap.get(name.toLowerCase()),
    has: name => headersMap.has(name.toLowerCase()),
    forEach: callback => headersMap.forEach((value, key) => callback(value, key)),
    entries: () => headersMap.entries(),
    keys: () => headersMap.keys(),
    values: () => headersMap.values(),
  };

  // Create response methods based on content type
  const responseMethods = {
    json: vi.fn().mockResolvedValue(isJson ? body : Promise.reject(new Error('Invalid JSON'))),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)])),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    formData: vi.fn().mockResolvedValue(new FormData()),
  };

  return {
    ok,
    status,
    statusText,
    headers: responseHeaders,
    ...responseMethods,
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
    } catch (error) {
      expect(error.status).toBe(404);
      expect(error.message).toContain('Not Found');
    }
  });

  it('should handle timeouts correctly', async () => {
    vi.useFakeTimers();

    // Mock a never-resolving fetch
    mockGlobalFetch.mockImplementationOnce(() => new Promise(() => {}));

    const fetchPromise = fetch('https://example.com/api', { timeout: 1000 });

    // Fast-forward time
    vi.advanceTimersByTime(1100);

    try {
      await fetchPromise;
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.isTimeout).toBe(true);
    }

    vi.useRealTimers();
  });

  it('should support request cancellation', async () => {
    // Mock a never-resolving fetch
    mockGlobalFetch.mockImplementationOnce(() => new Promise(() => {}));

    // Create abort controller
    const controller = new AbortController();

    // Start fetch
    const fetchPromise = fetch('https://example.com/api', {
      signal: controller.signal,
    });

    // Abort the request
    controller.abort();

    try {
      await fetchPromise;
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.isCancelled).toBe(true);
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

    expect(textResult).toBe('plain text response');
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
