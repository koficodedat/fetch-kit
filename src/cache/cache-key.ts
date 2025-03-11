// src/cache/cache-key.ts

import { RequestOptions } from '@fk-types/core';

/**
 * Generates a cache key for a request based on URL, method, and parameters
 * @param url The request URL
 * @param options Request options containing method, params, etc.
 * @returns A unique string key for identifying the request in cache
 */
export function generateCacheKey(url: string, options?: RequestOptions): string {
  const method = options?.method || 'GET';
  const params = options?.params || {};

  // Create a string representation of params
  const paramsString = Object.keys(params).length > 0 ? JSON.stringify(sortObjectKeys(params)) : '';

  // For POST/PUT/PATCH requests, include the body in the cache key
  const bodyString =
    ['POST', 'PUT', 'PATCH'].includes(method) && options?.body ? JSON.stringify(options.body) : '';

  // Combine all components to create a unique key
  return `${method}:${url}:${paramsString}:${bodyString}`;
}

/**
 * Sort object keys for consistent serialization
 * This ensures the same object with differently ordered keys
 * produces the same string representation
 */
function sortObjectKeys(obj: Record<string, any>): Record<string, any> {
  return Object.keys(obj)
    .sort()
    .reduce(
      (result, key) => {
        const value = obj[key];

        // Recursively sort nested objects
        result[key] =
          value && typeof value === 'object' && !Array.isArray(value)
            ? sortObjectKeys(value)
            : value;

        return result;
      },
      {} as Record<string, any>,
    );
}
