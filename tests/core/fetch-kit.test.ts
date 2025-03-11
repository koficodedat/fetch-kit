// tests/core/fetch-kit.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFetchKit } from '@core/fetch-kit';
import * as fetchModule from '@core/fetch';

// Mock the fetch module
vi.mock('@core/fetch', () => ({
  fetch: vi.fn(),
}));

describe('FetchKit factory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should create a FetchKit instance with default options', () => {
    const fk = createFetchKit();
    
    expect(fk).toHaveProperty('fetch');
    expect(fk).toHaveProperty('get');
    expect(fk).toHaveProperty('post');
    expect(fk).toHaveProperty('put');
    expect(fk).toHaveProperty('delete');
    expect(fk).toHaveProperty('patch');
    expect(fk).toHaveProperty('createAbortController');
  });

  it('should prepend baseUrl to request URLs', async () => {
    const fk = createFetchKit({ baseUrl: 'https://api.example.com' });
    
    // Mock successful response
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });
    
    await fk.get('/users');
    
    expect(fetchModule.fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('should handle baseUrl without trailing slash', async () => {
    const fk = createFetchKit({ baseUrl: 'https://api.example.com' });
    
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });
    
    await fk.get('users');
    
    expect(fetchModule.fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.any(Object)
    );
  });

  it('should include default headers in requests', async () => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token123'
    };
    
    const fk = createFetchKit({ defaultHeaders });
    
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });
    
    await fk.get('/users');
    
    expect(fetchModule.fetch).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        headers: defaultHeaders,
      })
    );
  });

  it('should merge request headers with default headers', async () => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token123'
    };
    
    const requestHeaders = {
      'X-Custom-Header': 'custom-value',
      'Authorization': 'Bearer override-token'
    };
    
    const fk = createFetchKit({ defaultHeaders });
    
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });
    
    await fk.get('/users', { headers: requestHeaders });
    
    expect(fetchModule.fetch).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer override-token',
          'X-Custom-Header': 'custom-value'
        },
      })
    );
  });

  it('should pass default timeout to fetch', async () => {
    const fk = createFetchKit({ timeout: 5000 });
    
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });
    
    await fk.get('/users');
    
    expect(fetchModule.fetch).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        timeout: 5000,
      })
    );
  });

  it('should override default timeout with request timeout', async () => {
    const fk = createFetchKit({ timeout: 5000 });
    
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ data: 'test' });
    
    await fk.get('/users', { timeout: 2000 });
    
    expect(fetchModule.fetch).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        timeout: 2000,
      })
    );
  });

  it('should create an AbortController', () => {
    const fk = createFetchKit();
    const { controller, abort, signal } = fk.createAbortController();
    
    expect(controller).toBeInstanceOf(AbortController);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(typeof abort).toBe('function');
    
    abort();
    expect(signal.aborted).toBe(true);
  });

  it('should pass the request body as JSON for object data', async () => {
    const fk = createFetchKit();
    const data = { id: 123, name: 'Test User' };
    
    vi.mocked(fetchModule.fetch).mockResolvedValueOnce({ success: true });
    
    await fk.post('/users', data);
    
    expect(fetchModule.fetch).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        method: 'POST',
        body: data
      })
    );
  });
});