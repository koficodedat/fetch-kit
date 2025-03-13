// src/core/request-deduper.ts

/**
 * RequestDeduper - Prevents duplicate in-flight requests by
 * tracking ongoing requests and sharing promises for identical requests
 */
export class RequestDeduper {
  /**
   * Map of in-flight requests by key
   */
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  /**
   * Execute a function with deduplication
   * @param key - Unique key identifying the request
   * @param fn - Function that returns a promise
   * @returns Promise resolving to the result of fn
   */
  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // If there's already an in-flight request with the same key, return it
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    // Create a new promise and track it
    const promise = fn().finally(() => {
      // Clean up the reference when the request completes or fails
      this.inFlightRequests.delete(key);
    });

    // Store the promise
    this.inFlightRequests.set(key, promise);

    return promise;
  }

  /**
   * Check if a request is currently in flight
   * @param key - The request key to check
   * @returns True if the request is in flight
   */
  isInFlight(key: string): boolean {
    return this.inFlightRequests.has(key);
  }

  /**
   * Get the total number of in-flight requests
   * @returns Number of in-flight requests
   */
  getInFlightCount(): number {
    return this.inFlightRequests.size;
  }

  /**
   * Get all in-flight request keys
   * @returns Array of request keys
   */
  getInFlightKeys(): string[] {
    return Array.from(this.inFlightRequests.keys());
  }

  /**
   * Cancel all in-flight requests by clearing the tracking map
   * Note: This does not actually abort the requests, it just removes
   * our references to them for deduplication purposes
   */
  clearInFlightRequests(): void {
    this.inFlightRequests.clear();
  }
}
