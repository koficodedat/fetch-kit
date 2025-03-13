// src/core/query-manager.ts

import { FetchKit } from './fetch-kit';
import { Query, QueryOptions } from './query';

/**
 * Manages a collection of queries
 */
export class QueryManager {
  /**
   * FetchKit instance used for making requests
   */
  private fetchKit: FetchKit;

  /**
   * Map of query keys to Query instances
   */
  private queries: Map<string, Query<any>> = new Map();

  /**
   * Create a new QueryManager
   */
  constructor(fetchKit: FetchKit) {
    this.fetchKit = fetchKit;
  }

  /**
   * Create or get an existing query
   */
  getQuery<T>(url: string, options: QueryOptions = {}): Query<T> {
    const queryKey = this.getQueryKey(url, options);

    // Return existing query if it exists
    if (this.queries.has(queryKey)) {
      return this.queries.get(queryKey) as Query<T>;
    }

    // Create and store new query
    const query = new Query<T>(this.fetchKit, url, options);
    this.queries.set(queryKey, query);

    return query;
  }

  /**
   * Get all registered queries
   */
  getAllQueries(): Query<any>[] {
    return Array.from(this.queries.values());
  }

  /**
   * Get a query key based on URL and options
   */
  private getQueryKey(url: string, options: QueryOptions = {}): string {
    // Use the FetchKit's cache key generation if available, otherwise create a simple key
    if (typeof this.fetchKit.getCacheKey === 'function') {
      return this.fetchKit.getCacheKey(url, options);
    }

    // Simple fallback for keys
    const paramsString = options.params ? JSON.stringify(options.params) : '';

    return `${url}|${paramsString}`;
  }

  /**
   * Invalidate a query by URL and options, causing it to refetch
   */
  invalidateQuery(url: string, options: QueryOptions = {}): void {
    const queryKey = this.getQueryKey(url, options);
    const query = this.queries.get(queryKey);

    if (query) {
      query.markStale();
    }
  }

  /**
   * Invalidate all queries that match a predicate
   */
  invalidateQueries(predicate: (query: Query<any>) => boolean): void {
    this.queries.forEach(query => {
      if (predicate(query)) {
        query.markStale();
      }
    });
  }

  /**
   * Invalidate all queries
   */
  invalidateAllQueries(): void {
    this.queries.forEach(query => query.markStale());
  }

  /**
   * Remove a query from management
   */
  removeQuery(url: string, options: QueryOptions = {}): boolean {
    const queryKey = this.getQueryKey(url, options);
    const query = this.queries.get(queryKey);

    if (query) {
      query.dispose();
      return this.queries.delete(queryKey);
    }

    return false;
  }

  /**
   * Remove all queries that match a predicate
   */
  removeQueries(predicate: (query: Query<any>) => boolean): number {
    let count = 0;

    this.queries.forEach((query, key) => {
      if (predicate(query)) {
        query.dispose();
        this.queries.delete(key);
        count++;
      }
    });

    return count;
  }

  /**
   * Remove all queries
   */
  removeAllQueries(): void {
    this.queries.forEach(query => query.dispose());
    this.queries.clear();
  }

  /**
   * Refetch a specific query
   */
  refetchQuery(url: string, options: QueryOptions = {}): Promise<void> {
    const queryKey = this.getQueryKey(url, options);
    const query = this.queries.get(queryKey);

    if (query) {
      return query.refetch();
    }

    return Promise.resolve();
  }

  /**
   * Refetch all queries that match a predicate
   */
  async refetchQueries(predicate: (query: Query<any>) => boolean): Promise<void> {
    const promises: Promise<void>[] = [];

    this.queries.forEach(query => {
      if (predicate(query)) {
        promises.push(query.refetch());
      }
    });

    await Promise.all(promises);
  }

  /**
   * Refetch all queries
   */
  async refetchAllQueries(): Promise<void> {
    const promises = Array.from(this.queries.values()).map(query => query.refetch());
    await Promise.all(promises);
  }
}
