// src/adapters/adapter-registry.ts

import { Adapter } from '@fk-types/adapter';
import { fetchAdapter } from './fetch-adapter';

/**
 * Registry to manage HTTP client adapters
 */
export class AdapterRegistry {
  /**
   * Map of registered adapters
   */
  private adapters: Map<string, Adapter> = new Map();

  /**
   * Name of the current active adapter
   */
  private activeAdapterName: string;

  /**
   * Creates a new adapter registry with the default fetch adapter
   */
  constructor() {
    // Register the default fetch adapter
    this.register(fetchAdapter);

    // Set it as the active adapter
    this.activeAdapterName = fetchAdapter.name;
  }

  /**
   * Register an adapter
   */
  register(adapter: Adapter): void {
    if (!adapter.name) {
      throw new Error('Adapter must have a name');
    }

    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get an adapter by name
   */
  get(name: string): Adapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get the current active adapter
   */
  getActive(): Adapter {
    const adapter = this.adapters.get(this.activeAdapterName);

    if (!adapter) {
      throw new Error(`Active adapter '${this.activeAdapterName}' not found`);
    }

    return adapter;
  }

  /**
   * Set the active adapter by name
   */
  setActive(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Adapter '${name}' not registered`);
    }

    this.activeAdapterName = name;
  }

  /**
   * Check if an adapter is registered
   */
  has(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Remove an adapter from the registry
   */
  unregister(name: string): boolean {
    // Don't allow removing the active adapter
    if (name === this.activeAdapterName) {
      throw new Error(`Cannot unregister the active adapter '${name}'`);
    }

    return this.adapters.delete(name);
  }

  /**
   * Get names of all registered adapters
   */
  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * Create singleton instance of the adapter registry
 */
export const adapterRegistry = new AdapterRegistry();
