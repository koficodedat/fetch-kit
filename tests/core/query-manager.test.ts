// tests/core/query-manager.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryManager } from '@core/query-manager';
import { Query, QueryOptions } from '@core/query';
import { createFetchKit } from '@core/fetch-kit';

// Mock the fetch module
vi.mock('@core/fetch', () => ({
  fetch: vi.fn(),
}));

// Mock the Query class
vi.mock('@core/query', () => ({
  Query: vi.fn(),
}));

describe('QueryManager', () => {
  let fetchKit: ReturnType<typeof createFetchKit>;
  let queryManager: QueryManager;

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup FetchKit mock
    fetchKit = createFetchKit();
    fetchKit.getCacheKey = vi.fn((url, options) => {
      return `${url}|${JSON.stringify(options?.params || {})}`;
    });

    // Setup Query mock
    (Query as any).mockImplementation((_: any, url: string, options: QueryOptions) => {
      return {
        url,
        options,
        refetch: vi.fn().mockResolvedValue(undefined),
        markStale: vi.fn(),
        dispose: vi.fn(),
        getState: vi.fn().mockReturnValue({ data: { url } }),
      };
    });

    queryManager = new QueryManager(fetchKit);
  });

  it('should create a new query when one does not exist', () => {
    const query = queryManager.getQuery('/users');

    expect(Query).toHaveBeenCalledWith(fetchKit, '/users', {});
    expect(query).toBeDefined();
  });

  it('should return existing query when one already exists', () => {
    const query1 = queryManager.getQuery('/users');
    const query2 = queryManager.getQuery('/users');

    expect(Query).toHaveBeenCalledTimes(1);
    expect(query1).toBe(query2);
  });

  it('should differentiate queries based on URL and params', () => {
    const query1 = queryManager.getQuery('/users');
    const query2 = queryManager.getQuery('/users', { params: { id: 1 } });
    const query3 = queryManager.getQuery('/posts');

    expect(Query).toHaveBeenCalledTimes(3);
    expect(query1).not.toBe(query2);
    expect(query1).not.toBe(query3);
    expect(query2).not.toBe(query3);
  });

  it('should get all registered queries', () => {
    queryManager.getQuery('/users');
    queryManager.getQuery('/posts');

    const allQueries = queryManager.getAllQueries();

    expect(allQueries.length).toBe(2);
  });

  it('should invalidate a specific query', () => {
    const query = queryManager.getQuery('/users');

    queryManager.invalidateQuery('/users');

    expect(query.markStale).toHaveBeenCalled();
  });

  it('should invalidate queries matching a predicate', () => {
    const usersQuery = queryManager.getQuery('/users');
    const postsQuery = queryManager.getQuery('/posts');

    queryManager.invalidateQueries(query => query.url.includes('user'));

    expect(usersQuery.markStale).toHaveBeenCalled();
    expect(postsQuery.markStale).not.toHaveBeenCalled();
  });

  it('should invalidate all queries', () => {
    const usersQuery = queryManager.getQuery('/users');
    const postsQuery = queryManager.getQuery('/posts');

    queryManager.invalidateAllQueries();

    expect(usersQuery.markStale).toHaveBeenCalled();
    expect(postsQuery.markStale).toHaveBeenCalled();
  });

  it('should remove a specific query', () => {
    const query = queryManager.getQuery('/users');

    const removed = queryManager.removeQuery('/users');

    expect(removed).toBe(true);
    expect(query.dispose).toHaveBeenCalled();
    expect(queryManager.getAllQueries().length).toBe(0);
  });

  it('should remove queries matching a predicate', () => {
    queryManager.getQuery('/users');
    queryManager.getQuery('/users/1');
    queryManager.getQuery('/posts');

    const removedCount = queryManager.removeQueries(query => query.url.includes('user'));

    expect(removedCount).toBe(2);
    expect(queryManager.getAllQueries().length).toBe(1);
  });

  it('should remove all queries', () => {
    const query1 = queryManager.getQuery('/users');
    const query2 = queryManager.getQuery('/posts');

    queryManager.removeAllQueries();

    expect(query1.dispose).toHaveBeenCalled();
    expect(query2.dispose).toHaveBeenCalled();
    expect(queryManager.getAllQueries().length).toBe(0);
  });

  it('should refetch a specific query', async () => {
    const query = queryManager.getQuery('/users');

    await queryManager.refetchQuery('/users');

    expect(query.refetch).toHaveBeenCalled();
  });

  it('should refetch queries matching a predicate', async () => {
    const usersQuery = queryManager.getQuery('/users');
    const postsQuery = queryManager.getQuery('/posts');

    await queryManager.refetchQueries(query => query.url.includes('user'));

    expect(usersQuery.refetch).toHaveBeenCalled();
    expect(postsQuery.refetch).not.toHaveBeenCalled();
  });

  it('should refetch all queries', async () => {
    const usersQuery = queryManager.getQuery('/users');
    const postsQuery = queryManager.getQuery('/posts');

    await queryManager.refetchAllQueries();

    expect(usersQuery.refetch).toHaveBeenCalled();
    expect(postsQuery.refetch).toHaveBeenCalled();
  });

  it('should use getCacheKey from FetchKit when available', () => {
    queryManager.getQuery('/users', { params: { id: 1 } });

    expect(fetchKit.getCacheKey).toHaveBeenCalledWith('/users', { params: { id: 1 } });
  });
});
