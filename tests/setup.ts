// tests/setup.ts

import { vi } from 'vitest';

/**
 * Creates a mock for setTimeout that executes callbacks immediately
 * @returns Original setTimeout function for restoration
 */
export function mockImmediateTimeout() {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = vi.fn(callback => {
    callback();
    return 1;
  }) as unknown as typeof global.setTimeout;
  return originalSetTimeout;
}

/**
 * Creates a mock for setTimeout with a minimal delay
 * @param delayMs Minimal delay in ms (default: 10ms)
 * @returns Original setTimeout function for restoration
 */
export function mockFastTimeout(delayMs = 10) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = vi.fn(callback => {
    return originalSetTimeout(callback, delayMs);
  }) as unknown as typeof global.setTimeout;
  return originalSetTimeout;
}

/**
 * Creates a mock for Math.random that returns a fixed value
 * @param fixedValue The value to return (default: 0.5)
 * @returns Original Math.random function for restoration
 */
export function mockDeterministicRandom(fixedValue = 0.5) {
  const originalMathRandom = Math.random;
  Math.random = vi.fn().mockReturnValue(fixedValue);
  return originalMathRandom;
}

/**
 * Creates a mock AbortController for testing
 * @returns Mock AbortController with controllable properties
 */
export function mockAbortController() {
  const mockController = {
    signal: {
      aborted: false,
      addEventListener: vi.fn(() => {}),
    },
    abort: vi.fn(_ => {
      mockController.signal.aborted = true;
    }),
  };

  return mockController;
}
