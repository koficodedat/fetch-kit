// src/core/query.ts

import { EventEmitter, Listener, Unsubscribe } from './event-emitter';
import type { ExtendedRequestOptions } from '@fk-types/core-extension';
import type { FetchKit } from './fetch-kit';

/**
 * Query state object
 */
export interface QueryState<T> {
  /** The data returned from the query */
  data: T | undefined;
  /** Error object if the query failed */
  error: Error | null;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether the query has successfully loaded data at least once */
  isSuccess: boolean;
  /** Whether the query has failed */
  isError: boolean;
  /** Whether the data is potentially stale and being re-fetched */
  isStale: boolean;
  /** Timestamp of when the data was last fetched */
  lastFetchedAt: number | null;
}

/**
 * Base query options
 */
export interface QueryOptions extends ExtendedRequestOptions {
  /**
   * Automatically refetch data when it becomes stale
   */
  refetchOnStale?: boolean;

  /**
   * Refetch data when the window regains focus
   */
  refetchOnWindowFocus?: boolean;

  /**
   * Initial data to use until first fetch completes
   */
  initialData?: any;
}

/**
 * Subscription event map for Query
 */
interface QueryEvents<T> {
  /**
   * Fired when query state changes
   */
  stateChange: QueryState<T>;

  /**
   * Fired when data is successfully fetched
   */
  success: T;

  /**
   * Fired when an error occurs during fetching
   */
  error: Error;
}

/**
 * A Query represents a fetchable resource with subscription capabilities
 */
export class Query<T = unknown> {
  /**
   * The URL to fetch
   */
  private url: string;

  /**
   * The FetchKit instance to use for fetching
   */
  private fetchKit: FetchKit;

  /**
   * Options for this query
   */
  private options: QueryOptions;

  /**
   * Current state of the query
   */
  private state: QueryState<T> = {
    data: undefined,
    error: null,
    isLoading: false,
    isSuccess: false,
    isError: false,
    isStale: false,
    lastFetchedAt: null,
  };

  /**
   * Event emitter for subscriptions
   */
  private emitter = new EventEmitter<QueryEvents<T>>();

  /**
   * Window focus event cleanup function
   */
  private windowFocusCleanup: (() => void) | null = null;

  /**
   * Create a new Query
   */
  constructor(fetchKit: FetchKit, url: string, options: QueryOptions = {}) {
    this.fetchKit = fetchKit;
    this.url = url;
    this.options = options;

    // Set initial data if provided
    if (options.initialData !== undefined) {
      this.state = {
        ...this.state,
        data: options.initialData,
        isSuccess: true,
      };
    }

    // Set up window focus handler if needed
    if (options.refetchOnWindowFocus && typeof window !== 'undefined') {
      const handler = () => {
        if (this.state.isStale || this.options.refetchOnStale === false) {
          this.refetch();
        }
      };

      window.addEventListener('focus', handler);
      this.windowFocusCleanup = () => window.removeEventListener('focus', handler);
    }

    // Perform initial fetch
    this.fetch();
  }

  /**
   * Get the current state
   */
  getState(): QueryState<T> {
    return { ...this.state };
  }

  /**
   * Subscribe to all state changes
   */
  subscribe(listener: Listener<QueryState<T>>): Unsubscribe {
    return this.emitter.on('stateChange', listener);
  }

  /**
   * Subscribe only to successful fetches
   */
  onSuccess(listener: Listener<T>): Unsubscribe {
    return this.emitter.on('success', listener);
  }

  /**
   * Subscribe only to errors
   */
  onError(listener: Listener<Error>): Unsubscribe {
    return this.emitter.on('error', listener);
  }

  /**
   * Update query state and notify subscribers
   */
  private setState(newState: Partial<QueryState<T>>): void {
    this.state = { ...this.state, ...newState };
    this.emitter.emit('stateChange', this.state);
  }

  /**
   * Perform the actual fetch
   */
  private async fetch(): Promise<void> {
    // Don't fetch if already loading
    if (this.state.isLoading) return;

    this.setState({ isLoading: true });

    try {
      const data = await this.fetchKit.get<T>(this.url, this.options);

      this.setState({
        data,
        error: null,
        isLoading: false,
        isSuccess: true,
        isError: false,
        isStale: false,
        lastFetchedAt: Date.now(),
      });

      this.emitter.emit('success', data);
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));

      this.setState({
        error: typedError,
        isLoading: false,
        isError: true,
        isStale: false,
      });

      this.emitter.emit('error', typedError);
    }
  }

  /**
   * Manually refetch data
   */
  async refetch(): Promise<void> {
    return this.fetch();
  }

  /**
   * Mark data as stale, triggering a refetch if refetchOnStale is true
   */
  markStale(): void {
    this.setState({ isStale: true });

    if (this.options.refetchOnStale !== false) {
      this.refetch();
    }
  }

  /**
   * Update data without fetching
   */
  setData(data: T): void {
    this.setState({
      data,
      isSuccess: true,
      isError: false,
      lastFetchedAt: Date.now(),
    });

    this.emitter.emit('success', data);
  }

  /**
   * Clean up resources used by this query
   */
  dispose(): void {
    this.emitter.removeAllListeners();

    if (this.windowFocusCleanup) {
      this.windowFocusCleanup();
      this.windowFocusCleanup = null;
    }
  }
}
