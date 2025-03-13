// tests/core/query.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Query } from '@core/query';
import { createFetchKit } from '@core/fetch-kit';

describe('Query', () => {
  let fetchKit: ReturnType<typeof createFetchKit>;
  const originalWindow = global.window;

  beforeEach(() => {
    fetchKit = createFetchKit();
    // Mock the fetchKit.get method directly
    fetchKit.get = vi.fn();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it('should fetch data on creation', async () => {
    const mockData = { id: 1, name: 'Test' };
    vi.mocked(fetchKit.get).mockResolvedValueOnce(mockData);

    const query = new Query<typeof mockData>(fetchKit, '/data');

    // Initial state should show loading
    expect(query.getState().isLoading).toBe(true);

    // Wait for fetch to complete
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));

    // Check final state
    expect(query.getState()).toMatchObject({
      data: mockData,
      isSuccess: true,
      isError: false,
      isLoading: false,
    });

    // Fetch should have been called once
    expect(fetchKit.get).toHaveBeenCalledTimes(1);
  });

  it('should use initialData until fetch completes', async () => {
    const initialData = { id: 0, name: 'Initial' };
    const mockData = { id: 1, name: 'Fetched' };

    vi.mocked(fetchKit.get).mockResolvedValueOnce(mockData);

    const query = new Query<typeof mockData>(fetchKit, '/data', {
      initialData,
    });

    // Initial state should have initialData
    expect(query.getState()).toMatchObject({
      data: initialData,
      isSuccess: true,
      isLoading: true,
    });

    // Wait for fetch to complete
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));

    // Final state should have fetched data
    expect(query.getState().data).toEqual(mockData);
  });

  it('should handle fetch errors', async () => {
    const mockError = new Error('Fetch failed');
    vi.mocked(fetchKit.get).mockRejectedValueOnce(mockError);

    const query = new Query(fetchKit, '/data');

    // Wait for fetch to complete
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));

    // Check error state
    expect(query.getState()).toMatchObject({
      error: mockError,
      isError: true,
      isSuccess: false,
      isLoading: false,
    });
  });

  it('should notify subscribers on state changes', async () => {
    const mockData = { id: 1, name: 'Test' };
    vi.mocked(fetchKit.get).mockResolvedValueOnce(mockData);

    const query = new Query<typeof mockData>(fetchKit, '/data');

    // Create subscribers
    const stateListener = vi.fn();
    const successListener = vi.fn();
    const errorListener = vi.fn();

    query.subscribe(stateListener);
    query.onSuccess(successListener);
    query.onError(errorListener);

    // Wait for fetch to complete
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));

    // Subscribers should be notified
    expect(stateListener).toHaveBeenCalled();
    expect(successListener).toHaveBeenCalledWith(mockData);
    expect(errorListener).not.toHaveBeenCalled();
  });

  it('should support manual refetching', async () => {
    const mockData1 = { id: 1, name: 'First' };
    const mockData2 = { id: 1, name: 'Updated' };

    vi.mocked(fetchKit.get).mockResolvedValueOnce(mockData1).mockResolvedValueOnce(mockData2);

    const query = new Query<typeof mockData1>(fetchKit, '/data');

    // Wait for initial fetch
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));
    expect(query.getState().data).toEqual(mockData1);

    // Refetch
    const refetchPromise = query.refetch();

    // Should be loading again
    expect(query.getState().isLoading).toBe(true);

    // Wait for refetch to complete
    await refetchPromise;

    // Should have updated data
    expect(query.getState().data).toEqual(mockData2);
    expect(fetchKit.get).toHaveBeenCalledTimes(2);
  });

  it('should update data directly with setData', async () => {
    const mockData = { id: 1, name: 'Test' };
    const newData = { id: 1, name: 'Updated' };

    vi.mocked(fetchKit.get).mockResolvedValueOnce(mockData);

    const query = new Query<typeof mockData>(fetchKit, '/data');

    // Wait for initial fetch
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));

    // Create subscribers
    const stateListener = vi.fn();
    const successListener = vi.fn();

    query.subscribe(stateListener);
    query.onSuccess(successListener);

    // Update data
    query.setData(newData);

    // Check state and notifications
    expect(query.getState().data).toEqual(newData);
    expect(stateListener).toHaveBeenCalled();
    expect(successListener).toHaveBeenCalledWith(newData);

    // No additional network request
    expect(fetchKit.get).toHaveBeenCalledTimes(1);
  });

  it('should mark data as stale and refetch if configured', async () => {
    const mockData1 = { id: 1, name: 'First' };
    const mockData2 = { id: 1, name: 'Updated' };

    vi.mocked(fetchKit.get).mockResolvedValueOnce(mockData1).mockResolvedValueOnce(mockData2);

    const query = new Query<typeof mockData1>(fetchKit, '/data', {
      refetchOnStale: true,
    });

    // Wait for initial fetch
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));

    // Mark as stale, which should trigger refetch
    query.markStale();

    // Should be stale and loading
    expect(query.getState().isStale).toBe(true);
    expect(query.getState().isLoading).toBe(true);

    // Wait for refetch to complete
    await vi.waitFor(() => expect(query.getState().isLoading).toBe(false));

    // Should have updated data and no longer be stale
    expect(query.getState().data).toEqual(mockData2);
    expect(query.getState().isStale).toBe(false);
    expect(fetchKit.get).toHaveBeenCalledTimes(2);
  });

  it('should clean up resources when disposed', async () => {
    // Mock window
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    global.window = {
      addEventListener,
      removeEventListener,
    } as any;

    const query = new Query(fetchKit, '/data', {
      refetchOnWindowFocus: true,
    });

    // Focus handler should be registered
    expect(addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));

    // Dispose query
    query.dispose();

    // Focus handler should be removed
    expect(removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });
});
