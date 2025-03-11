// tests/utils/error.test.ts

import { describe, it, expect } from 'vitest';
import { createError, categorizeError, getErrorMessage } from '@utils/error';
import { ErrorCategory } from '@fk-types/error';

describe('Error utilities', () => {
  describe('createError', () => {
    it('should create a FetchKit error with default values', () => {
      const error = createError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.category).toBe(ErrorCategory.Unknown);
      expect(error.isTimeout).toBe(false);
      expect(error.isCancelled).toBe(false);
      expect(error.isNetworkError).toBe(false);
    });

    it('should create a FetchKit error with custom values', () => {
      const originalError = new Error('Original error');
      const error = createError('Test error', {
        cause: originalError,
        category: ErrorCategory.Server,
        status: 500,
        url: 'https://example.com/api',
        method: 'GET',
        isTimeout: true,
        data: { message: 'Server error' },
      });

      expect(error.message).toBe('Test error');
      expect(error.cause).toBe(originalError);
      expect(error.category).toBe(ErrorCategory.Server);
      expect(error.status).toBe(500);
      expect(error.url).toBe('https://example.com/api');
      expect(error.method).toBe('GET');
      expect(error.isTimeout).toBe(true);
      expect(error.data).toEqual({ message: 'Server error' });
    });
  });

  describe('categorizeError', () => {
    it('should categorize timeout errors', () => {
      const error = { name: 'AbortError', isTimeout: true };
      expect(categorizeError(error)).toBe(ErrorCategory.Timeout);
    });

    it('should categorize cancelled requests', () => {
      const error = { isCancelled: true };
      expect(categorizeError(error)).toBe(ErrorCategory.Cancel);

      const abortError = { name: 'AbortError', isTimeout: false };
      expect(categorizeError(abortError)).toBe(ErrorCategory.Cancel);
    });

    it('should categorize network errors', () => {
      const error1 = { message: 'Failed to fetch' };
      expect(categorizeError(error1)).toBe(ErrorCategory.Network);

      const error2 = { message: 'Network error occurred' };
      expect(categorizeError(error2)).toBe(ErrorCategory.Network);

      const error3 = { message: 'CORS error' };
      expect(categorizeError(error3)).toBe(ErrorCategory.Network);
    });

    it('should categorize client errors', () => {
      const error = { status: 404 };
      expect(categorizeError(error)).toBe(ErrorCategory.Client);

      const error2 = { status: 429 };
      expect(categorizeError(error2)).toBe(ErrorCategory.Client);
    });

    it('should categorize server errors', () => {
      const error = { status: 500 };
      expect(categorizeError(error)).toBe(ErrorCategory.Server);

      const error2 = { status: 503 };
      expect(categorizeError(error2)).toBe(ErrorCategory.Server);
    });

    it('should categorize parsing errors', () => {
      const error = new SyntaxError('Unexpected token in JSON');
      expect(categorizeError(error)).toBe(ErrorCategory.Parse);

      const error2 = { message: 'JSON parsing error' };
      expect(categorizeError(error2)).toBe(ErrorCategory.Parse);
    });

    it('should default to unknown for other errors', () => {
      const error = new Error('Some other error');
      expect(categorizeError(error)).toBe(ErrorCategory.Unknown);
    });
  });

  describe('getErrorMessage', () => {
    it('should return the existing message if well-formed', () => {
      const error = { message: 'A well-formed error message that is detailed' };
      expect(getErrorMessage(error)).toBe('A well-formed error message that is detailed');
    });

    it('should provide status-specific messages', () => {
      expect(getErrorMessage({ status: 404 })).toContain('Not Found');
      expect(getErrorMessage({ status: 401 })).toContain('Unauthorized');
      expect(getErrorMessage({ status: 500 })).toContain('Internal Server Error');
    });

    it('should provide general category messages for unknown status codes', () => {
      expect(getErrorMessage({ status: 418 })).toContain('Client Error');
      expect(getErrorMessage({ status: 522 })).toContain('Server Error');
    });

    it('should provide specific error type messages', () => {
      expect(getErrorMessage({ isTimeout: true })).toContain('Timeout');
      expect(getErrorMessage({ isCancelled: true })).toContain('Cancelled');
      expect(getErrorMessage({ isNetworkError: true })).toContain('Network Error');
    });

    it('should provide a default message if no specific condition is met', () => {
      expect(getErrorMessage({})).toContain('Request Failed');
    });
  });
});
