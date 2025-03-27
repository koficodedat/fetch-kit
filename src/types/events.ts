// src/types/events.ts
// Defines event types and subscription interface for FetchKit

import { Listener, Unsubscribe } from '@core/event-emitter';
import { ExtendedRequestOptions } from './core-extension';
import { FetchKitError } from './error';

/**
 * Events that FetchKit can emit
 */
export interface FetchKitEvents {
  // Request lifecycle events
  'request:start': { url: string; method: string; options: ExtendedRequestOptions };
  'request:success': { url: string; method: string; data: any; duration: number };
  'request:error': { url: string; method: string; error: FetchKitError; duration: number };
  'request:complete': { url: string; method: string; success: boolean; duration: number };

  // Cache-related events
  'cache:hit': { key: string; data: any; isStale: boolean };
  'cache:miss': { key: string };
  'cache:set': { key: string; data: any };
  'cache:invalidate': { key: string | null };

  // Cache warming events
  'cache:warm:register': { key: string };
  'cache:warm:unregister': { key: string };
  'cache:warm:refresh': { key: string; success: boolean; error?: Error };

  // Revalidation events
  'cache:revalidate:start': { key: string; priority?: number };
  'cache:revalidate:success': { key: string; data: any };
  'cache:revalidate:error': { key: string; error: Error; attempt: number };
  'cache:revalidate:throttled': { key: string; nextAttemptTime: number };
  'cache:revalidate:debounced': { key: string; delayTime: number };

  // Eviction events
  'cache:evict': { key: string; reason: 'size_limit' | 'count_limit' | 'ttl' | 'manual' };
  'cache:stats': { size: number; count: number; hits: number; misses: number; hitRatio: number };

  // Global events
  error: Error;
  debug: { message: string; data?: any };
}

/**
 * Subscription-related methods for FetchKit
 */
export interface SubscriptionMethods {
  /**
   * Subscribe to an event
   */
  on<E extends keyof FetchKitEvents>(event: E, listener: Listener<FetchKitEvents[E]>): Unsubscribe;

  /**
   * Subscribe to an event once
   */
  once<E extends keyof FetchKitEvents>(
    event: E,
    listener: Listener<FetchKitEvents[E]>,
  ): Unsubscribe;

  /**
   * Unsubscribe from an event
   */
  off<E extends keyof FetchKitEvents>(event: E, listener: Listener<FetchKitEvents[E]>): boolean;

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: keyof FetchKitEvents): number;
}
