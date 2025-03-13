// tests/core/event-emitter.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '@core/event-emitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it('should subscribe to events and receive emitted data', () => {
    const listener = vi.fn();
    emitter.on('test', listener);

    const data = { value: 'test-data' };
    emitter.emit('test', data);

    expect(listener).toHaveBeenCalledWith(data);
  });

  it('should allow unsubscribing from events using returned function', () => {
    const listener = vi.fn();
    const unsubscribe = emitter.on('test', listener);

    unsubscribe();
    emitter.emit('test', 'data');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should handle subscribing to the same event multiple times', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('test', listener1);
    emitter.on('test', listener2);

    emitter.emit('test', 'data');

    expect(listener1).toHaveBeenCalledWith('data');
    expect(listener2).toHaveBeenCalledWith('data');
  });

  it('should not call listeners for other events', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('event1', listener1);
    emitter.on('event2', listener2);

    emitter.emit('event1', 'data1');

    expect(listener1).toHaveBeenCalledWith('data1');
    expect(listener2).not.toHaveBeenCalled();
  });

  it('should handle unsubscribing a specific listener', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('test', listener1);
    emitter.on('test', listener2);

    emitter.off('test', listener1);
    emitter.emit('test', 'data');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledWith('data');
  });

  it('should trigger a once listener only one time', () => {
    const listener = vi.fn();
    emitter.once('test', listener);

    emitter.emit('test', 'data1');
    emitter.emit('test', 'data2');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('data1');
  });

  it('should remove all listeners for an event', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    emitter.on('event1', listener1);
    emitter.on('event1', listener2);
    emitter.on('event2', listener3);

    emitter.removeAllListeners('event1');

    emitter.emit('event1', 'data1');
    emitter.emit('event2', 'data2');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
    expect(listener3).toHaveBeenCalledWith('data2');
  });

  it('should remove all listeners when called without event', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('event1', listener1);
    emitter.on('event2', listener2);

    emitter.removeAllListeners();

    emitter.emit('event1', 'data1');
    emitter.emit('event2', 'data2');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('should count listeners correctly', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    expect(emitter.listenerCount('test')).toBe(0);

    emitter.on('test', listener1);
    expect(emitter.listenerCount('test')).toBe(1);

    emitter.on('test', listener2);
    expect(emitter.listenerCount('test')).toBe(2);

    emitter.off('test', listener1);
    expect(emitter.listenerCount('test')).toBe(1);

    emitter.removeAllListeners('test');
    expect(emitter.listenerCount('test')).toBe(0);
  });

  it('should handle errors in listeners gracefully', () => {
    const errorListener = vi.fn(() => {
      throw new Error('Test error');
    });
    const normalListener = vi.fn();

    // Mock console.error to prevent test output noise
    const originalConsoleError = console.error;
    console.error = vi.fn();

    try {
      emitter.on('test', errorListener);
      emitter.on('test', normalListener);

      // Should not throw despite error in first listener
      emitter.emit('test', 'data');

      expect(errorListener).toHaveBeenCalledWith('data');
      expect(normalListener).toHaveBeenCalledWith('data');
      expect(console.error).toHaveBeenCalled();
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  });

  it('should support typed events with proper type safety', () => {
    // Define typed events for a user management system
    interface UserEvents {
      userCreated: { id: number; name: string; email: string };
      userDeleted: number; // just the user ID
      statusChanged: { userId: number; online: boolean };
    }

    const typedEmitter = new EventEmitter<UserEvents>();

    // Track processed data to verify type safety
    const processedData = {
      createdUserNames: [] as string[],
      deletedUserIds: [] as number[],
      userStatuses: [] as Array<{ id: number; status: string }>,
    };

    // Create listeners that actually process the typed data
    const userCreatedListener = vi.fn((user: UserEvents['userCreated']) => {
      processedData.createdUserNames.push(user.name.toUpperCase());
    });

    const userDeletedListener = vi.fn((userId: UserEvents['userDeleted']) => {
      processedData.deletedUserIds.push(userId * 2); // Some transformation
    });

    const statusChangedListener = vi.fn((data: UserEvents['statusChanged']) => {
      processedData.userStatuses.push({
        id: data.userId,
        status: data.online ? 'ONLINE' : 'OFFLINE',
      });
    });

    // Subscribe to events
    typedEmitter.on('userCreated', userCreatedListener);
    typedEmitter.on('userDeleted', userDeletedListener);
    typedEmitter.on('statusChanged', statusChangedListener);

    // Emit events with typed data
    typedEmitter.emit('userCreated', { id: 1, name: 'john', email: 'john@example.com' });
    typedEmitter.emit('userDeleted', 42);
    typedEmitter.emit('statusChanged', { userId: 5, online: true });
    typedEmitter.emit('statusChanged', { userId: 8, online: false });

    // Verify listeners were called with correct data
    expect(userCreatedListener).toHaveBeenCalledWith({
      id: 1,
      name: 'john',
      email: 'john@example.com',
    });
    expect(userDeletedListener).toHaveBeenCalledWith(42);
    expect(statusChangedListener).toHaveBeenCalledTimes(2);

    // Verify data was processed correctly according to its type
    expect(processedData.createdUserNames).toEqual(['JOHN']);
    expect(processedData.deletedUserIds).toEqual([84]);
    expect(processedData.userStatuses).toEqual([
      { id: 5, status: 'ONLINE' },
      { id: 8, status: 'OFFLINE' },
    ]);
  });
});
