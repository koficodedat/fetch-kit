// src/core/fetch.ts

import { adapterRegistry } from '@adapters/adapter-registry';
import type { RequestOptions } from '@fk-types/core';
import type { RetryConfig } from '@fk-types/error';
import { createError, categorizeError, getErrorMessage } from '@utils/error';
import { buildUrl } from '@utils/url';
import { withRetry } from '@utils/retry';

/**
 * Core fetch wrapper function using the active adapter with enhanced error handling
 */
export async function fetch<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, timeout, retry, ...restOptions } = options;

  // Build URL with query parameters
  const fullUrl = params ? buildUrl(url, params) : url;

  // Get the active adapter
  const adapter = adapterRegistry.getActive();

  // Setup timeout handler
  let timeoutId: number | undefined;
  let timeoutController: AbortController | undefined;

  if (timeout && timeout > 0) {
    timeoutController = new AbortController();

    // Combine existing signal with timeout signal if present
    if (restOptions.signal) {
      const originalSignal = restOptions.signal;
      originalSignal.addEventListener('abort', () => {
        timeoutController?.abort(originalSignal.reason);
      });
    }

    // Set timeout to abort the controller after specified time
    timeoutId = window.setTimeout(() => {
      timeoutController?.abort('timeout');
    }, timeout);

    // Use the timeout controller's signal
    restOptions.signal = timeoutController.signal;
  }

  // Prepare request function
  const performRequest = async (): Promise<T> => {
    try {
      // Transform request using the adapter
      const request = adapter.transformRequest(fullUrl, {
        method,
        ...restOptions,
      });

      // Execute the request
      const response = await adapter.request(request);

      // Handle non-200 responses - safely check if originalResponse exists and has 'ok' property
      if (response.originalResponse && response.originalResponse.ok === false) {
        const error = createError(getErrorMessage(response.originalResponse || {}), {
          status: response.status,
          category: categorizeError(response.originalResponse || {}),
          response: response.originalResponse,
          url: fullUrl,
          method,
          data: response.data,
        });
        throw error;
      }

      return response.data;
    } catch (error: any) {
      // Transform and enhance error
      const category = categorizeError(error);
      const message = getErrorMessage(error);

      const fetchError = createError(message, {
        cause: error,
        category,
        status: error.status || (error.response && error.response.status),
        response: error.response,
        url: fullUrl,
        method,
        isTimeout: category === 'timeout',
        isCancelled: category === 'cancel',
        isNetworkError: category === 'network',
        data: error.data || (error.response && error.response.data),
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
