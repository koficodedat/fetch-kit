// src/utils/url.ts

/**
 * Builds a URL with query parameters
 *
 * @param url - Base URL
 * @param params - Object of query parameters
 * @returns URL with query parameters
 */
export function buildUrl(url: string, params: Record<string, any>): string {
  // Use URL constructor for proper URL parsing and handling
  // For relative URLs, we need to provide a base
  const isAbsoluteUrl = url.startsWith('http://') || url.startsWith('https://');
  const urlObj = new URL(url, isAbsoluteUrl ? undefined : window.location.origin);

  // Add parameters to URL
  appendParamsToUrl(urlObj.searchParams, '', params);

  // Return the absolute URL, or just the path + query for relative URLs
  return isAbsoluteUrl ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;
}

/**
 * Recursively appends parameters to a URLSearchParams object
 *
 * @param searchParams - URLSearchParams object to append to
 * @param prefix - Prefix for nested parameters
 * @param params - Parameters to append
 */
function appendParamsToUrl(
  searchParams: URLSearchParams,
  prefix: string,
  params: Record<string, any>
): void {
  for (const [key, value] of Object.entries(params)) {
    const paramKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (Array.isArray(value)) {
      // Handle array parameters
      value.forEach((item) => {
        if (item !== null && item !== undefined) {
          searchParams.append(paramKey, serializeParam(item));
        }
      });
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      // Handle nested objects
      appendParamsToUrl(searchParams, paramKey, value);
    } else {
      // Handle primitive values
      searchParams.append(paramKey, serializeParam(value));
    }
  }
}

/**
 * Serializes a parameter value for URL inclusion
 *
 * @param value - Value to serialize
 * @returns Serialized value as string
 */
function serializeParam(value: any): string {
  if (value instanceof Date) {
    return value.toISOString();
  } else if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  } else {
    return String(value);
  }
}
