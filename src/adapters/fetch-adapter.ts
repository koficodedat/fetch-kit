// src/adapters/fetch-adapter.ts

import { Adapter, AdapterRequest, AdapterResponse } from '@fk-types/adapter';
import { RequestOptions } from '@fk-types/core';
import { buildUrl } from '@utils/url';

/**
 * Default adapter using the browser's native fetch API
 */
export const fetchAdapter: Adapter = {
  name: 'fetch',

  /**
   * Execute a request using fetch
   */
  async request<T>(request: AdapterRequest): Promise<AdapterResponse<T>> {
    const { url, method, headers, body, signal, ...restOptions } = request;

    // Create fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal,
      ...restOptions,
    };

    // Set body for non-GET requests
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body;
    }

    // Execute fetch request
    const response = await window.fetch(url, fetchOptions);

    // Transform the response
    return this.transformResponse<T>(response);
  },

  /**
   * Transform FetchKit options to a fetch request
   */
  transformRequest(url: string, options: RequestOptions): AdapterRequest {
    const { method = 'GET', body, params, headers, signal, ...restOptions } = options;

    // Build URL with query parameters
    const fullUrl = params ? buildUrl(url, params) : url;

    // Create the request object
    const request: AdapterRequest = {
      url: fullUrl,
      method,
      headers,
      signal,
      ...restOptions,
    };

    // Process body for JSON data
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (
        typeof body === 'object' &&
        !(body instanceof FormData) &&
        !(body instanceof Blob) &&
        !(body instanceof ArrayBuffer)
      ) {
        request.body = JSON.stringify(body);

        // Add content-type if not set
        if (headers && !Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
          request.headers = {
            ...headers,
            'Content-Type': 'application/json',
          };
        }
      } else {
        request.body = body;
      }
    }

    return request;
  },

  /**
   * Transform fetch response to standardized format
   */
  async transformResponse<T>(response: Response): Promise<AdapterResponse<T>> {
    // Extract headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse response data based on content type
    let data: any;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        data = await response.text();
      }
    } else if (contentType.includes('text/')) {
      data = await response.text();
    } else {
      // For binary data, return as blob by default
      data = await response.blob();
    }

    // Create standard response
    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers,
      originalResponse: response,
    };
  },
};
