// src/types/core.ts

import { Adapter } from "./adapter";
import { RetryConfig } from "./error";

/**
 * Configuration options for creating a FetchKit instance
 */
export interface FetchKitConfig {
  /**
   * Base URL to be prepended to all request URLs
   */
  baseUrl?: string;

  /**
   * Default headers to include with every request
   */
  defaultHeaders?: Record<string, string>;

  /**
   * Default timeout in milliseconds
   */
  timeout?: number;

  /**
   * Custom adapter to use for requests
   */
  adapter?: Adapter;

  /**
   * Default retry configuration
   */
  retry?: Partial<RetryConfig>;
}

/**
 * Options for individual requests
 */
export interface RequestOptions {
  /**
   * HTTP method for the request
   */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

  /**
   * Headers to include with the request
   */
  headers?: Record<string, string>;

  /**
   * Request body
   */
  body?: any;

  /**
   * Query parameters
   */
  params?: Record<string, any>;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * AbortSignal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Expected response type
   */
  responseType?: "json" | "text" | "blob" | "arrayBuffer" | "formData";

  /**
   * Whether to include credentials in cross-origin requests
   */
  credentials?: RequestCredentials;

  /**
   * Cache mode for the request
   */
  cache?: RequestCache;

  /**
   * Redirect mode for the request
   */
  redirect?: RequestRedirect;

  /**
   * Referrer policy for the request
   */
  referrerPolicy?: ReferrerPolicy;

  /**
   * Retry configuration for the request
   */
  retry?: boolean | Partial<RetryConfig>;
}
