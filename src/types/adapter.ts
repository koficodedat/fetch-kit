// src/types/adapter.ts

import { RequestOptions } from './core';

/**
 * Standard request object passed to adapters
 */
export interface AdapterRequest {
  /**
   * The URL to request
   */
  url: string;

  /**
   * HTTP method
   */
  method: string;

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Request body
   */
  body?: any;

  /**
   * AbortSignal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Additional options specific to the adapter
   */
  [key: string]: any;
}

/**
 * Standard response object returned from adapters
 */
export interface AdapterResponse<T = any> {
  /**
   * Response data (already parsed)
   */
  data: T;

  /**
   * HTTP status code
   */
  status: number;

  /**
   * Status text
   */
  statusText: string;

  /**
   * Response headers
   */
  headers: Record<string, string>;

  /**
   * Original response object from the underlying client
   */
  originalResponse?: any;
}

/**
 * The adapter interface
 */
export interface Adapter {
  /**
   * The name of the adapter
   */
  name: string;

  /**
   * Execute a request with the adapter
   */
  request<T>(request: AdapterRequest): Promise<AdapterResponse<T>>;

  /**
   * Transform FetchKit request options to adapter-specific request
   */
  transformRequest(url: string, options: RequestOptions): AdapterRequest;

  /**
   * Transform adapter response to a standard format
   */
  transformResponse<T>(response: any): AdapterResponse<T>;
}
