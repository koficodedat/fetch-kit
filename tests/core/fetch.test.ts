// tests/core/fetch.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetch } from '@core/fetch';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetch wrapper', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should make a simple GET request', async () => {
    // Mock response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      json: () => Promise.resolve({ data: 'test' }),
    });

    const result = await fetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'GET',
      headers: undefined,
      signal: expect.any(AbortSignal),
    });

    expect(result).toEqual({ data: 'test' });
  });

  it('should handle error responses', async () => {
    // Mock error response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: {
        get: () => 'application/json',
      },
    });

    try {
      await fetch('https://example.com/api');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain('Request failed with status 404');
      expect(error.status).toBe(404);
    }
  });

  it('should handle timeouts correctly', async () => {
    vi.useFakeTimers();

    // Mock never-resolving fetch
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    const fetchPromise = fetch('https://example.com/api', { timeout: 1000 });

    // Fast-forward time
    vi.advanceTimersByTime(1100);

    try {
      await fetchPromise;
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toBe('Request timeout');
      expect(error.isTimeout).toBe(true);
    }

    vi.useRealTimers();
  });

  it('should support request cancellation', async () => {
    // Mock response that won't complete until we choose
    const fetchResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      json: () => Promise.resolve({ data: 'test' }),
    };

    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

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
    } catch (error: any) {
      expect(error.message).toBe('Request aborted');
    }
  });

  it('should serialize query parameters correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      json: () => Promise.resolve({ data: 'test' }),
    });

    await fetch('https://example.com/api', {
      params: {
        id: 123,
        filter: ['active', 'pending'],
        nested: { key: 'value' },
      },
    });

    // Get the URL that was passed to fetch
    const calledUrl = mockFetch.mock.calls[0][0];
    const url = new URL(calledUrl);

    // Verify params were serialized correctly
    expect(url.searchParams.get('id')).toBe('123');
    expect(url.searchParams.getAll('filter')).toEqual(['active', 'pending']);
    expect(url.searchParams.get('nested[key]')).toBe('value');
  });

  it('should support different response types', async () => {
    const textResponse = 'plain text response';
    const blobContent = new Blob(['test blob'], { type: 'text/plain' });

    // Mock for text response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'text/plain',
      },
      text: () => Promise.resolve(textResponse),
      json: () => Promise.reject(new Error('Invalid JSON')),
    });

    const textResult = await fetch('https://example.com/api', {
      responseType: 'text',
    });
    expect(textResult).toBe(textResponse);

    // Mock for blob response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/octet-stream',
      },
      blob: () => Promise.resolve(blobContent),
    });

    const blobResult = await fetch('https://example.com/api', {
      responseType: 'blob',
    });
    expect(blobResult).toBe(blobContent);
  });
});
