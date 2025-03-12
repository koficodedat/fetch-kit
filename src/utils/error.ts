// src/utils/error.ts

import { ErrorCategory, FetchKitError } from '@fk-types/error';

/**
 * Creates a standardized FetchKit error
 */
export function createError(message: string, options: Partial<FetchKitError> = {}): FetchKitError {
  const error = new Error(message) as FetchKitError;

  // Add standard Error properties
  if (options.cause) {
    error.cause = options.cause;
  }

  // Add FetchKit specific properties
  error.category = options.category || ErrorCategory.Unknown;
  error.status = options.status;
  error.response = options.response;
  error.url = options.url;
  error.method = options.method;
  error.isTimeout = options.isTimeout || false;
  error.isCancelled = options.isCancelled || false;
  error.isNetworkError = options.isNetworkError || false;
  error.data = options.data;
  error.retryCount = options.retryCount;

  // Preserve the stack trace
  if (Error.captureStackTrace) {
    Error.captureStackTrace(error, createError);
  }

  return error;
}

/**
 * Determines the error category based on status code and error type
 */
export function categorizeError(error: any): ErrorCategory {
  // First, check if it's a cancellation (either directly flagged or an AbortError that isn't a timeout)
  if (error.isCancelled || (error.name === 'AbortError' && error.isTimeout !== true)) {
    return ErrorCategory.Cancel;
  }

  // Handle timeout errors
  if (error.name === 'AbortError' && error.isTimeout === true) {
    return ErrorCategory.Timeout;
  }

  // Handle network errors (like CORS, offline, etc.)
  if (
    error.message &&
    (error.message.includes('network') ||
      error.message.includes('Network') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('cors') ||
      error.message.includes('CORS'))
  ) {
    return ErrorCategory.Network;
  }

  // Handle HTTP status code categories
  if (error.status) {
    if (error.status >= 400 && error.status < 500) {
      return ErrorCategory.Client;
    }
    if (error.status >= 500) {
      return ErrorCategory.Server;
    }
  }

  // Handle parsing errors (JSON parse errors, etc.)
  if (
    error instanceof SyntaxError ||
    error.message?.includes('parse') ||
    error.message?.includes('JSON')
  ) {
    return ErrorCategory.Parse;
  }

  // Default to unknown for anything else
  return ErrorCategory.Unknown;
}

/**
 * Creates an appropriate error message based on status code and error type
 */
export function getErrorMessage(error: any): string {
  // Return existing message if it's already well-formed
  if (
    error.message &&
    !error.message.includes('[object Object]') &&
    !error.message.includes('Error') &&
    error.message.length > 10
  ) {
    return error.message;
  }

  // Create a message based on status code
  if (error.status) {
    switch (error.status) {
      case 400:
        return 'Bad Request: The server could not understand the request';
      case 401:
        return 'Unauthorized: Authentication is required';
      case 403:
        return 'Forbidden: You do not have permission to access this resource';
      case 404:
        return 'Not Found: The requested resource was not found';
      case 408:
        return 'Request Timeout: The server timed out waiting for the request';
      case 409:
        return 'Conflict: The request conflicts with the current state of the server';
      case 413:
        return 'Payload Too Large: The request body is too large';
      case 429:
        return 'Too Many Requests: You have sent too many requests';
      case 500:
        return 'Internal Server Error: The server encountered an unexpected condition';
      case 502:
        return 'Bad Gateway: The server received an invalid response from the upstream server';
      case 503:
        return 'Service Unavailable: The server is currently unavailable';
      case 504:
        return 'Gateway Timeout: The server did not receive a timely response from the upstream server';
      default:
        if (error.status >= 400 && error.status < 500) {
          return `Client Error: The request failed with status code ${error.status}`;
        }
        if (error.status >= 500) {
          return `Server Error: The server failed to process the request with status code ${error.status}`;
        }
    }
  }

  // Handle specific error types
  if (error.isTimeout) {
    return 'Request Timeout: The request took too long to complete';
  }

  if (error.isCancelled) {
    return 'Request Cancelled: The request was cancelled';
  }

  if (error.isNetworkError) {
    return 'Network Error: The request failed due to a network issue';
  }

  // Default general error message
  return 'Request Failed: An error occurred while processing the request';
}
