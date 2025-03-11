// src/types/error.ts

/**
 * HTTP error status code categories
 */
export enum ErrorCategory {
  Client = 'client',      // 4xx errors - client side errors
  Server = 'server',      // 5xx errors - server side errors
  Timeout = 'timeout',    // Request timeout errors
  Network = 'network',    // Network connectivity errors
  Cancel = 'cancel',      // Cancelled requests
  Parse = 'parse',        // Response parsing errors
  Unknown = 'unknown'     // Unrecognized errors
}

/**
 * Enhanced error object for FetchKit errors
 */
export interface FetchKitError extends Error {
  /**
   * Original error that caused this error
   */
  cause?: Error;
  
  /**
   * HTTP status code if applicable
   */
  status?: number;
  
  /**
   * Error category for easier error handling
   */
  category: ErrorCategory;
  
  /**
   * Original response object if available
   */
  response?: Response;
  
  /**
   * Request URL that caused the error
   */
  url?: string;
  
  /**
   * Request method that caused the error
   */
  method?: string;
  
  /**
   * Whether the request timed out
   */
  isTimeout?: boolean;
  
  /**
   * Whether the request was cancelled
   */
  isCancelled?: boolean;
  
  /**
   * Whether the error is related to network connectivity
   */
  isNetworkError?: boolean;
  
  /**
   * Parsed response data if available
   */
  data?: any;
  
  /**
   * Retry count if this request was retried
   */
  retryCount?: number;
}

/**
 * Configuration for request retry behavior
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  count: number;
  
  /**
   * Delay between retries in milliseconds
   */
  delay?: number;
  
  /**
   * Backoff strategy for increasing delay between retries
   */
  backoff?: 'linear' | 'exponential' | 'fixed';
  
  /**
   * Factor to multiply delay by for each retry (used in exponential backoff)
   */
  factor?: number;
  
  /**
   * Maximum delay between retries in milliseconds
   */
  maxDelay?: number;
  
  /**
   * Function to determine if a request should be retried
   */
  shouldRetry?: (error: FetchKitError, attempt: number) => boolean;
}