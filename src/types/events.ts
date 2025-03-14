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
