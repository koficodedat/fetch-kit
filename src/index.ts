// src/index.ts

/**
 * FetchKit - A frontend-agnostic, vanilla JavaScript-first library for fetching data
 * @packageDocumentation
 */

// Core functionality
export { createFetchKit } from '@core/fetch-kit';
export { RequestDeduper } from '@core/request-deduper';

// Adapters
export { fetchAdapter } from '@adapters/fetch-adapter';
export { adapterRegistry } from '@adapters/adapter-registry';

// Cache
export { CacheManager } from '@cache/cache-manager';
export { MemoryCache } from '@cache/memory-cache';
export { generateCacheKey } from '@cache/cache-key';
export { createCacheEntry, isEntryStale, isEntryExpired } from '@cache/cache-entry';

// Publisher/Subscriber
export { EventEmitter } from '@core/event-emitter';
export type { Listener, Unsubscribe } from '@core/event-emitter';
export type { FetchKitEvents, SubscriptionMethods } from '@fk-types/events';

// Utilities
export { withRetry, DEFAULT_RETRY_CONFIG } from '@utils/retry';
export { createError, categorizeError, getErrorMessage } from '@utils/error';

// Type definitions
export type { BaseFetchKit, FetchKit } from '@core/fetch-kit';

export type { FetchKitConfig, RequestOptions } from '@fk-types/core';

export type { Adapter, AdapterRequest, AdapterResponse } from '@fk-types/adapter';

export type { FetchKitError, RetryConfig, ErrorCategory } from '@fk-types/error';

export type { CacheOptions, CacheEntry, CacheStorage } from '@fk-types/cache';

export type {
  ExtendedRequestOptions,
  ExtendedFetchKitConfig,
  CacheMethods,
  DeduplicationMethods,
} from '@fk-types/core-extension';
