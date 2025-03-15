// src/utils/url.ts

import {
  serializeParams,
  deserializeParams,
  type SerializationOptions,
} from './parameter-serializer';

/**
 * Options for URL building
 */
export interface UrlOptions extends SerializationOptions {
  /** Base URL for relative paths */
  baseUrl?: string;
  /** Whether to strip the base URL from the result */
  stripBase?: boolean;
  /** Whether to preserve existing query parameters */
  preserveQuery?: boolean;
}

/**
 * Get a safe default base URL that works in both browser and Node environments
 */
function getDefaultBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'http://localhost'; // Safe default for Node environments
}

/**
 * Safely creates a URL object with proper error handling
 */
function createUrlSafely(url: string, base?: string): URL {
  // Validate URL format before attempting to construct
  const validUrlPattern =
    /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i;

  // If the URL is absolute and doesn't match the pattern, it's likely invalid
  if (url.startsWith('http') && !validUrlPattern.test(url)) {
    throw new Error(`Invalid URL format: ${url}`);
  }

  try {
    return new URL(url, base);
  } catch (error) {
    // If URL is invalid with the provided base, try with a default base
    try {
      // Only try with default base if the URL is relative
      if (!url.includes('://')) {
        return new URL(url, getDefaultBaseUrl());
      }
      throw error; // Re-throw if absolute URL is invalid
    } catch (fallbackError) {
      throw new Error(`Invalid URL: ${url}. ${(fallbackError as Error)?.message || ''}`);
    }
  }
}

/**
 * Builds a URL with query parameters
 *
 * @param url - Base URL or path
 * @param params - Object of query parameters
 * @param options - URL building options
 * @returns URL with query parameters
 */
export function buildUrl(
  url: string,
  params?: Record<string, any>,
  options: UrlOptions = {},
): string {
  const {
    baseUrl = getDefaultBaseUrl(),
    stripBase = false,
    preserveQuery = true,
    ...serializationOptions
  } = options;

  // Check if the URL is absolute (has protocol)
  const isAbsoluteUrl = /^https?:\/\//i.test(url);

  // Parse the URL
  const urlObj = createUrlSafely(url, isAbsoluteUrl ? undefined : baseUrl);

  // Get existing query parameters if preserving
  const existingParams = preserveQuery
    ? deserializeParams(urlObj.search, serializationOptions)
    : {};

  // Merge existing and new parameters
  const mergedParams = {
    ...existingParams,
    ...(params || {}),
  };

  // Generate query string
  const queryString =
    Object.keys(mergedParams).length > 0 ? serializeParams(mergedParams, serializationOptions) : '';

  // Create the final URL path component
  const finalPath = `${urlObj.pathname}${queryString}${urlObj.hash}`;

  // Return based on the stripBase option
  if (stripBase) {
    return finalPath;
  }

  // Return full URL
  return `${urlObj.protocol}//${urlObj.host}${finalPath}`;
}

/**
 * Parses a URL into its components and parameters
 *
 * @param url - URL to parse
 * @param options - Parsing options
 * @returns Parsed URL object with components and parameters
 */
export function parseUrl(
  url: string,
  options: SerializationOptions = {},
): {
  protocol: string;
  host: string;
  pathname: string;
  params: Record<string, any>;
  hash: string;
} {
  // Use a safe base URL if the provided URL is relative
  const urlObj = createUrlSafely(url, getDefaultBaseUrl());

  return {
    protocol: urlObj.protocol.replace(':', ''),
    host: urlObj.host,
    pathname: urlObj.pathname,
    params: deserializeParams(urlObj.search, options),
    hash: urlObj.hash.replace('#', ''),
  };
}
