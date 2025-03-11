# FetchKit Caching System

The FetchKit caching system implements the SWR (Stale-While-Revalidate) pattern to optimize data fetching performance while ensuring data freshness.

## Core Concepts

### SWR Pattern

The SWR pattern works as follows:

1. Return cached data immediately if available (even if stale)
2. If data is stale, trigger a background revalidation
3. If no data is available, fetch it and cache the result

This approach delivers several benefits:
- Immediate response from cache for better UX
- Automatic background updates to keep data fresh
- Resilience during network interruptions

### Cache Keys

Each request is uniquely identified by a cache key generated from:
- HTTP method
- URL
- Query parameters
- Request body (for POST/PUT/PATCH)

## Usage

### Basic Caching

By default, all GET requests are automatically cached:

```typescript
// First call fetches and caches
const users = await fk.get('/users');

// Second call uses cached data
const sameUsers = await fk.get('/users');
```

### Cache Configuration

Configure caching behavior globally:

```typescript
const fk = createFetchKit({
  cacheOptions: {
    staleTime: 60000,  // Data becomes stale after 1 minute
    cacheTime: 300000, // Remove from cache after 5 minutes
    revalidate: true   // Auto-revalidate stale data
  }
});
```

Or per-request:

```typescript
// Override cache settings for this request
const data = await fk.get('/users', {
  cacheOptions: {
    staleTime: 30000,
    cacheTime: 120000
  }
});

// Disable caching for this request
const freshData = await fk.get('/users', { cacheOptions: false });
```

### Cache Invalidation

Manually invalidate cache entries:

```typescript
// Invalidate specific cache entry
const cacheKey = fk.getCacheKey('/users');
fk.invalidateCache(cacheKey);

// Invalidate all cache entries
fk.invalidateCache();

// Invalidate cache entries by pattern
fk.invalidateCacheMatching(key => key.includes('/users'));
```

### Custom Cache Keys

Use custom cache keys for advanced scenarios:

```typescript
// Use a custom cache key
const data = await fk.get('/users', {
  cacheOptions: { cacheKey: 'my-custom-key' }
});

// Different URL, same data
const sameData = await fk.get('/users/fresh', {
  cacheOptions: { cacheKey: 'my-custom-key' }
});
```

## Configuration Options

| Option     | Description                                     | Default   |
|------------|-------------------------------------------------|-----------|
| staleTime  | Time (ms) until data becomes stale              | 0         |
| cacheTime  | Time (ms) until data is removed from cache      | 5 minutes |
| revalidate | Whether to auto-revalidate stale data           | true      |
| cacheKey   | Custom key to use instead of generated key      | undefined |

## Implementation Details

The caching system consists of several components:

1. **Cache Key Generation**: Creates unique keys for requests
2. **Cache Entry**: Stores data with metadata (creation time, staleness, etc.)
3. **Memory Cache**: In-memory storage with TTL support
4. **Cache Manager**: Implements SWR logic and background revalidation

## Best Practices

- Use appropriate staleTime based on how frequently your data changes
- Set cacheTime longer than staleTime to prevent unnecessary requests
- Consider disabling cache for frequently changing or sensitive data
- Use invalidateCache after mutations to ensure fresh data

## Note on Browser Cache vs FetchKit Cache

It's important to distinguish between two different caching mechanisms:

1. **Browser Cache**: Controlled via the standard `cache` option in RequestOptions (e.g., 'no-cache', 'force-cache')
2. **FetchKit SWR Cache**: Controlled via the `cacheOptions` property

These can be used independently or together:

```typescript
// Use both browser cache and FetchKit cache
const data = await fk.get('/users', {
  cache: 'force-cache',         // Browser cache setting
  cacheOptions: {               // FetchKit cache setting
    staleTime: 60000
  }
});
```
