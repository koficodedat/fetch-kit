// src/utils/retry.ts

import { RetryConfig, FetchKitError, ErrorCategory } from '@fk-types/error';

/**
 * Default configuration for retries
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  count: 3,
  delay: 1000,
  backoff: 'exponential',
  factor: 2,
  maxDelay: 30000,
};

/**
 * Default function to determine if a request should be retried
 */
export function defaultShouldRetry(error: FetchKitError, attempt: number): boolean {
  // Don't retry if we've reached the maximum number of attempts
  if (attempt >= DEFAULT_RETRY_CONFIG.count) {
    return false;
  }

  // Don't retry cancelled requests
  if (error.isCancelled) {
    return false;
  }

  // Retry server errors (5xx)
  if (error.category === ErrorCategory.Server) {
    return true;
  }

  // Retry timeout errors
  if (error.category === ErrorCategory.Timeout) {
    return true;
  }

  // Retry network errors
  if (error.category === ErrorCategory.Network) {
    return true;
  }

  // Don't retry client errors (4xx) except for 429 (Too Many Requests)
  if (error.category === ErrorCategory.Client && error.status !== 429) {
    return false;
  }

  // Retry 429 errors
  if (error.status === 429) {
    return true;
  }

  // By default, don't retry
  return false;
}

/**
 * Calculate delay for next retry based on retry config and attempt number
 */
export function calculateRetryDelay(config: RetryConfig, attempt: number): number {
  const { delay = 1000, backoff = 'exponential', factor = 2, maxDelay = 30000 } = config;

  let nextDelay: number;

  switch (backoff) {
    case 'linear':
      // Linear backoff: delay * attempt
      nextDelay = delay * attempt;
      break;

    case 'exponential':
      // Exponential backoff: delay * (factor ^ attempt)
      nextDelay = delay * Math.pow(factor, attempt - 1);
      break;

    case 'fixed':
    default:
      // Fixed delay
      nextDelay = delay;
      break;
  }

  // Add jitter to prevent all clients retrying simultaneously
  const jitter = 0.2; // 20% jitter
  const randomFactor = 1 - jitter + Math.random() * jitter * 2;
  nextDelay = Math.floor(nextDelay * randomFactor);

  // Ensure delay doesn't exceed maximum
  return Math.min(nextDelay, maxDelay);
}

/**
 * Performs a request with automatic retries on failure
 */
export async function withRetry<T>(
  requestFn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  // Merge with default config
  const retryConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  // Set default shouldRetry if not provided
  const shouldRetry = retryConfig.shouldRetry || defaultShouldRetry;

  let attempt = 0;

  while (true) {
    try {
      // Attempt the request
      return await requestFn();
    } catch (error) {
      // Enhance error with retry count
      const fetchKitError = error as FetchKitError;
      fetchKitError.retryCount = attempt;

      // Increment attempt counter
      attempt++;

      // Check if we should retry
      if (attempt < retryConfig.count && shouldRetry(fetchKitError, attempt)) {
        // Calculate delay for this attempt
        const delay = calculateRetryDelay(retryConfig, attempt);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // No more retries, re-throw the error
        throw error;
      }
    }
  }
}
