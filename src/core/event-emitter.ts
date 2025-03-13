// src/core/event-emitter.ts

/**
 * Type for event listener functions
 */
export type Listener<T = any> = (data: T) => void;

/**
 * Unsubscribe function returned when subscribing to events
 */
export type Unsubscribe = () => void;

/**
 * Simple event emitter for implementing pub/sub pattern
 */
export class EventEmitter<EventMap extends Record<string, any> = Record<string, any>> {
  /**
   * Map of event names to arrays of listeners
   */
  private listeners: Map<keyof EventMap, Set<Listener<any>>> = new Map();

  /**
   * Subscribe to an event
   * @param event - The event name to subscribe to
   * @param listener - The listener function to call when the event is emitted
   * @returns A function to unsubscribe
   */
  on<E extends keyof EventMap>(event: E, listener: Listener<EventMap[E]>): Unsubscribe {
    // Get or create the set of listeners for this event
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event)!;
    eventListeners.add(listener);

    // Return unsubscribe function
    return () => {
      eventListeners.delete(listener);
      // Clean up if there are no more listeners
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Subscribe to an event, but only trigger once
   * @param event - The event name to subscribe to
   * @param listener - The listener function to call when the event is emitted
   * @returns A function to unsubscribe
   */
  once<E extends keyof EventMap>(event: E, listener: Listener<EventMap[E]>): Unsubscribe {
    const onceWrapper = (data: EventMap[E]) => {
      // Unsubscribe first then call listener to prevent
      // infinite loops if listener triggers the same event
      unsubscribe();
      listener(data);
    };

    const unsubscribe = this.on(event, onceWrapper);
    return unsubscribe;
  }

  /**
   * Emit an event with data
   * @param event - The event name to emit
   * @param data - The data to pass to listeners
   */
  emit<E extends keyof EventMap>(event: E, data: EventMap[E]): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    // Call all listeners with the data
    eventListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for event "${String(event)}":`, error);
      }
    });
  }

  /**
   * Remove a specific listener from an event
   * @param event - The event name
   * @param listener - The listener to remove
   * @returns True if the listener was removed
   */
  off<E extends keyof EventMap>(event: E, listener: Listener<EventMap[E]>): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return false;

    const result = eventListeners.delete(listener);

    // Clean up if there are no more listeners
    if (eventListeners.size === 0) {
      this.listeners.delete(event);
    }

    return result;
  }

  /**
   * Remove all listeners for an event, or all listeners if no event is specified
   * @param event - Optional event name to clear listeners for
   */
  removeAllListeners(event?: keyof EventMap): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param event - The event name
   * @returns The number of listeners
   */
  listenerCount(event: keyof EventMap): number {
    const eventListeners = this.listeners.get(event);
    return eventListeners ? eventListeners.size : 0;
  }
}
