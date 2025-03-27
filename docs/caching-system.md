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
    // Basic options
    staleTime: 60000, // Data becomes stale after 1 minute
    cacheTime: 300000, // Remove from cache after 5 minutes
    revalidate: true, // Auto-revalidate stale data

    // Cache size limits
    maxEntries: 100, // Maximum number of entries in cache
    maxBytes: 5 * 1024 * 1024, // Maximum cache size (5MB)

    // Eviction policy
    evictionPolicy: 'lru', // Least Recently Used eviction policy

    // Advanced revalidation
    throttleTime: 10000, // Min time between re-validations (10s)
    debounceTime: 500, // Wait for inactivity before re-validating (500ms)
  },
});
```

Or per-request:

```typescript
// Override cache settings for this request
const data = await fk.get('/users', {
  cacheOptions: {
    staleTime: 30000,
    cacheTime: 120000,
  },
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
  cacheOptions: { cacheKey: 'my-custom-key' },
});

// Different URL, same data
const sameData = await fk.get('/users/fresh', {
  cacheOptions: { cacheKey: 'my-custom-key' },
});
```

## Configuration Options

| Option          | Description                                    | Default   |
| --------------- | ---------------------------------------------- | --------- |
| staleTime       | Time (ms) until data becomes stale             | 0         |
| cacheTime       | Time (ms) until data is removed from cache     | 5 minutes |
| revalidate      | Whether to auto-revalidate stale data          | true      |
| cacheKey        | Custom key to use instead of generated key     | undefined |
| maxEntries      | Maximum number of entries in cache             | Infinity  |
| maxBytes        | Maximum size of cache in bytes                 | Infinity  |
| evictionPolicy  | Policy for removing entries when limit reached | 'lru'     |
| throttleTime    | Minimum time between re-validations (ms)       | 0         |
| debounceTime    | Wait for inactivity before re-validating (ms)  | 0         |
| sizeCalculation | Function to calculate size of cached items     | Built-in  |
| priority        | Priority for re-validation (higher = sooner)   | 0         |
| warmingInterval | Interval for cache warming (ms)                | 5 minutes |

## Implementation Details

The caching system consists of several components:

1. **Cache Key Generation**: Creates unique keys for requests
2. **Cache Entry**: Stores data with metadata (creation time, access patterns, size, etc.)
3. **Memory Cache**: In-memory storage with comprehensive TTL support
4. **Cache Manager**: Implements SWR logic and background revalidation
5. **Eviction Policies**: Multiple strategies for cache size management
6. **Cache Warming**: Proactive data refreshing mechanism
7. **Revalidation Control**: Throttling and debouncing mechanisms

## Best Practices

- Use appropriate staleTime based on how frequently your data changes
- Set cacheTime longer than staleTime to prevent unnecessary requests
- Consider disabling cache for frequently changing or sensitive data
- Use invalidateCache after mutations to ensure fresh data
- Choose the appropriate eviction policy for your data access patterns
- Use cache warming for critical data that needs to be always fresh
- Apply throttling for frequently accessed resources to reduce network load
- Implement debouncing for rapidly changing user inputs

## Advanced Caching Features

### Cache Warming

Proactively keep critical data fresh with cache warming:

```typescript
// Register a resource for automatic refreshing
fk.registerCacheWarming('/critical-data', {
  warmingInterval: 120000, // Refresh every 2 minutes
  warmingOptions: {
    staleTime: 60000, // Consider stale after 1 minute
    cacheTime: 300000, // Keep in cache for 5 minutes
  },
});

// Unregister when no longer needed
fk.unregisterCacheWarming('/critical-data');

// Get all warmed cache keys
const warmedKeys = fk.getWarmedCacheKeys();
```

### Eviction Policies

FetchKit supports multiple eviction policies to optimize cache performance:

| Policy | Description                                                             |
| ------ | ----------------------------------------------------------------------- |
| `lru`  | Least Recently Used - Removes least recently accessed entries first     |
| `lfu`  | Least Frequently Used - Removes least frequently accessed entries first |
| `ttl`  | Time To Live - Removes oldest entries first based on creation time      |
| `fifo` | First In First Out - Removes entries in the order they were added       |

```typescript
// Configure eviction policy globally
const fk = createFetchKit({
  cacheOptions: {
    evictionPolicy: 'lfu',
    maxEntries: 100,
  },
});

// Or per-request
const data = await fk.get('/users', {
  cacheOptions: {
    evictionPolicy: 'ttl',
  },
});
```

### Advanced Revalidation Control

Fine-tune revalidation behavior with throttling and debouncing:

```typescript
// Throttle: Limit frequency of re-validations
const data = await fk.get('/frequently-accessed', {
  cacheOptions: {
    throttleTime: 5000, // Max one re-validation per 5 seconds
  },
});

// Debounce: Wait for inactivity before re-validating
const searchResults = await fk.get(`/search?q=${query}`, {
  cacheOptions: {
    debounceTime: 500, // Wait 500ms of inactivity before re-validating
  },
});

// Manual re-validation when needed
await fk.revalidateCache('/important-data');
```

### Cache Statistics and Monitoring

Track cache performance metrics:

```typescript
// Get cache statistics
const stats = fk.getCacheStatistics();
console.log(stats);
// {
//   hits: 243,
//   misses: 57,
//   size: 1458302, // bytes
//   entryCount: 32,
//   evictions: 5,
//   expirations: 12
// }
```

## Note on Browser Cache vs FetchKit Cache

It's important to distinguish between two different caching mechanisms:

1. **Browser Cache**: Controlled via the standard `cache` option in RequestOptions (e.g., 'no-cache', 'force-cache')
2. **FetchKit SWR Cache**: Controlled via the `cacheOptions` property

These can be used independently or together:

```typescript
// Use both browser cache and FetchKit cache
const data = await fk.get('/users', {
  cache: 'force-cache', // Browser cache setting
  cacheOptions: {
    // FetchKit cache setting
    staleTime: 60000,
    evictionPolicy: 'lfu', // Least Frequently Used policy
    throttleTime: 5000, // Throttle re-validations
  },
});
```
