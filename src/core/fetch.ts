// src/core/fetch.ts

import { adapterRegistry } from '@adapters/adapter-registry';
import type { RequestOptions } from '@fk-types/core';
import type { RetryConfig } from '@fk-types/error';
import { createError, categorizeError, getErrorMessage } from '@utils/error';
import { withRetry } from '@utils/retry';

/**
 * Core fetch wrapper function using the active adapter with enhanced error handling
 */
export async function fetch<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { timeout, responseType, retry, ...restOptions } = options;

  // Get the active adapter
  const adapter = adapterRegistry.getActive();

  // Setup timeout handler
  let timeoutId: number | undefined;
  let timeoutController: AbortController | undefined;

  if (timeout && timeout > 0) {
    timeoutController = new AbortController();

    // Combine existing signal with timeout signal if present
    if (restOptions.signal) {
      // Create a new signal that aborts if either original signal or timeout signal aborts
      const originalSignal = restOptions.signal;

      originalSignal.addEventListener('abort', () => {
        timeoutController?.abort(originalSignal.reason);
      });

      timeoutController.signal.addEventListener('abort', () => {
        // Only propagate timeout aborts
        if (timeoutController?.signal.reason === 'timeout') {
          const controller = new AbortController();
          controller.abort('timeout');
        }
      });
    }

    // Set timeout to abort the controller after specified time
    timeoutId = window.setTimeout(() => {
      timeoutController?.abort('timeout');
    }, timeout);

    // Use the timeout controller's signal
    restOptions.signal = timeoutController.signal;
  }

  // Create the request function
  const performRequest = async (): Promise<T> => {
    try {
      // Transform the request using the adapter
      const request = adapter.transformRequest(url, restOptions);

      // Execute the request
      const response = await adapter.request<T>(request);

      // Return the data directly
      return response.data;
    } catch (error: any) {
      // Get error category
      const category = categorizeError(error);

      // Create standard error message
      const message = getErrorMessage(error);

      // Create enhanced error object
      const fetchError = createError(message, {
        cause: error,
        category,
        status: error.status || error.response?.status,
        response: error.response,
        url,
        method: restOptions.method || 'GET',
        isTimeout: category === 'timeout',
        isCancelled: category === 'cancel',
        isNetworkError: category === 'network',
        data: error.data || error.response?.data,
      });

      throw fetchError;
    } finally {
      // Clear timeout if it was set
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  };

  // If retry is enabled, use withRetry utility
  if (retry) {
    return withRetry<T>(performRequest, retry as RetryConfig);
  }

  // Otherwise, just perform the request
  return performRequest();
}
