# FetchKit (FK) Documentation

## Introduction

FetchKit is a frontend-agnostic, vanilla JavaScript-first library for fetching, updating, and managing asynchronous data. It builds upon the browser's native Fetch API while providing advanced caching, state management, and request orchestration capabilities.

## Core Principles

- **Vanilla JavaScript First**: FetchKit is built and optimized for vanilla JavaScript environments without framework dependencies. This ensures maximum compatibility and flexibility.
- **Framework Agnostic**: While optimized for vanilla JavaScript, FetchKit can be used with any framework without adaptation.
- **Extensible Architecture**: Rather than building framework-specific features, FetchKit provides extension points that allow developers and library authors to adapt FetchKit to their specific needs.
- **Progressive Enhancement**: Features are designed to be adopted incrementally without breaking existing functionality.

## Problems Solved

FetchKit addresses common challenges in modern web development:

- **Request Redundancy**: Duplicate network calls for the same data
- **Stale Data**: Outdated information displayed to users
- **Loading States**: Complex loading state management
- **Dependent Requests**: Cumbersome chaining of API calls
- **Error Handling**: Inconsistent error recovery strategies
- **Data Synchronization**: Keeping UI in sync with server state
- **Framework Lock-in**: Dependency on specific UI frameworks

## Key Features

### Core Capabilities
- **Flexible Caching Strategies**: SWR, Cache-First, Network-First, etc.
- **Request Deduplication**: Automatic prevention of duplicate requests
- **Direct State Access**: Reactive state properties without subscriptions
- **Type Safety**: First-class TypeScript support

### Advanced Features
- **Data Flow Orchestration**: Chain dependent requests with transformations
- **Optimistic Updates**: Update UI before server confirmation
- **Request Batching**: Combine multiple requests for efficiency
- **File Operations**: Upload/download with progress tracking
- **Offline Support**: Queue operations when offline
- **CORS Handling**: Streamlined Cross-Origin request management
- **Security Features**: CSRF protection, content security policies
- **Plugin System**: Extensibility architecture for custom features
- **SSR Support**: Server-side rendering capabilities
- **Real-time Protocol Support**: WebSocket and SSE integration

## Usage Primer

### Basic Usage

```javascript
// Create instance with global config
const fk = createFetchKit({
  baseUrl: 'https://api.example.com',
  defaultHeaders: { 'Content-Type': 'application/json' }
});

// Simple fetch (returns a promise)
const data = await fk.fetch('/users/123');
```

### Queries with Caching

```javascript
// Create a query with caching
const usersQuery = fk.createQuery('/users', {
  cacheStrategy: 'swr',
  refreshInterval: 5000
});

// Access state directly
console.log(usersQuery.data);
console.log(usersQuery.isLoading);

// Or subscribe to changes
const unsubscribe = usersQuery.subscribe(({ data, error, isLoading }) => {
  // Update UI with new state
});

// Manually control the query
await usersQuery.refetch();
usersQuery.invalidate();
```

### Advanced Data Flows

```javascript
// Define a complex data flow
const userDashboard = fk.createFlow({
  // Parallel independent requests
  user: fk.get('/users/current'),
  notifications: fk.get('/notifications'),
  
  // Dependent requests with auto-transformations
  posts: ({ user }) => fk.get(`/users/${user.id}/posts`),
  
  // Multi-level dependencies
  comments: ({ posts }) => fk.batch(posts.map(post => `/posts/${post.id}/comments`)),
  
  // Final transformation
  dashboard: ({ user, notifications, posts, comments }) => ({
    userData: user,
    notificationCount: notifications.length,
    recentActivity: combinePostsAndComments(posts, comments)
  })
});

// Execute entire flow with one call
const result = await userDashboard.execute();
```

### Error Handling

```javascript
try {
  const data = await fk.fetch('/users/123');
} catch (error) {
  if (error.status === 404) {
    // Handle not found
  } else if (error.status >= 500) {
    // Handle server error
  }
}

// Retry configuration
fk.fetch('/endpoint', { 
  retry: { count: 3, backoff: 'exponential', delay: 1000 }
});
```

### Customization & Extension

```javascript
// Custom adapter for different HTTP client
fk.setAdapter({
  fetch: async (url, options) => {
    // Custom implementation using axios, etc.
    return { data, status, headers };
  }
});

// Middleware
fk.use(async (request, next) => {
  // Before request
  console.log('Request:', request.url);
  
  const response = await next(request);
  
  // After response
  console.log('Response:', response.status);
  return response;
});

// Plugin registration
fk.use(myPlugin, { 
  // Plugin options
});
```

## Implementation Roadmap

### Phase 1: MVP Core (Weeks 1-10)
1. **Fetch Wrapper** - Core API around fetch with consistent interface
   - Request/response abstraction
   - Method helpers (get, post, put, delete)
   - URL handling and parameter serialization
2. **Adapter Interface** - Support for alternative HTTP clients
   - Standardized adapter shape
   - Default fetch implementation
   - Documentation for custom adapters
3. **SWR Caching** - Basic stale-while-revalidate implementation
   - In-memory cache store
   - Request key generation
   - Background revalidation
4. **Request Deduplication** - Prevent duplicate in-flight requests
   - Request tracking
   - Promise sharing
   - Request key normalization
5. **Error Handling** - Standardized error objects and handling
   - Error object structure
   - Status code categorization
   - Error serialization/deserialization
6. **Basic Subscriptions** - Simple pub/sub for data changes
   - Subscription management
   - Event triggering
   - Unsubscribe handling
7. **Type Inference** - Strongly typed responses with TypeScript
   - Generic type parameters
   - Response type inference
   - Method-specific types

### Phase 2: Request Control (Weeks 11-18)
1. **Multiple Cache Strategies** - Cache-First, Network-First options
   - Strategy pattern implementation
   - Configurable strategies
   - Per-request strategy override
2. **Retry Mechanism** - Configurable retry with exponential backoff
   - Retry count configuration
   - Backoff algorithms (linear, exponential, custom)
   - Condition-based retry
3. **Request Cancellation** - AbortController integration
   - Signal propagation
   - Cleanup handling
   - Timeout implementation
4. **Basic Middleware System** - Request/response interception hooks
   - Middleware chain execution
   - Registration API
   - Pre/post request hooks
5. **Request Timeouts** - Automatic cancellation after timeout period
   - Timeout configuration
   - AbortController integration
   - Global and per-request settings
6. **Request/Response Transformation** - Data transformation pipelines
   - Transform functions
   - Pipeline execution
   - Error handling in transformations
7. **Context Propagation** - Pass context through request chains
   - Context container
   - Context merging
   - Access patterns
8. **CORS Handling** - Streamlined Cross-Origin request management
   - Preflight request handling
   - Credentials configuration
   - Origin policy management
9. **Basic Security Features** - Foundation for secure requests
   - CSRF token management
   - Content security policies
   - XSS prevention headers

### Phase 3: Data Management (Weeks 19-26)
1. **Optimistic Updates** - Update UI before server confirmation
   - Temporary cache updates
   - Rollback on error
   - Conflict resolution
2. **Advanced Subscriptions** - Fine-grained data change notifications
   - Selective subscriptions
   - Filtered events
   - Throttled notifications
3. **Direct State Access** - Reactive state getters without subscription
   - Reactive properties
   - State snapshot creation
   - Access patterns
4. **Query Invalidation** - Manual and automatic cache invalidation
   - Targeted invalidation
   - Pattern matching
   - Predicate-based invalidation
5. **Dependency Tracking** - Auto-refetch when dependencies change
   - Dependency registration
   - Change detection
   - Circular dependency handling
6. **Cache Persistence** - Save/restore cache across sessions
   - Storage adapters
   - Serialization/deserialization
   - TTL and expiration
7. **Schema Validation** - Validate response data against schemas
   - Schema definition
   - Validation errors
   - Automatic type conversion
8. **Basic SSR Support** - Server-side rendering foundations
   - Environment detection
   - Server-specific caching strategies
   - State serialization/hydration

### Phase 4: Advanced Request Features (Weeks 27-34)
1. **Request Batching** - Combine multiple requests into single calls
   - Batch strategy
   - Response mapping
   - Error handling
2. **Data Flow Orchestration** - Chain dependent requests with transformations
   - Flow definition
   - Dependency resolution
   - Execution engine
3. **Flow Resumability** - Checkpoint and resume complex request flows
   - State serialization
   - Checkpoint creation
   - Partial execution
4. **Debouncing/Throttling** - Limit request frequency
   - Time-based throttling
   - Leading/trailing edge options
   - Queue management
5. **Pagination Helpers** - Support for pagination approaches
   - Offset pagination
   - Cursor pagination
   - Infinite loading
6. **Fallback Patterns** - Define backup data sources
   - Fallback chain
   - Conditional fallbacks
   - Default values
7. **Request Prioritization** - Critical vs non-critical handling
   - Priority levels
   - Queue management
   - Preemption options
8. **Request Queueing** - Sequential processing of requests
   - Queue management
   - Concurrency limits
   - Priority handling
9. **Rate Limiting** - Client-side throttling to prevent API abuse
   - Rate calculation
   - Token bucket implementation
   - Per-endpoint limits
10. **Real-time Protocol Support** - WebSocket and event source integration
    - Protocol adapters
    - Connection management
    - Cache integration with real-time events

### Phase 5: Extended Features (Weeks 35-44)
1. **File Upload** - Progress tracking and chunked uploads
   - Progress events
   - Chunked upload strategy
   - Resumable uploads
2. **File Download** - Resumable downloads with progress reporting
   - Stream handling
   - Progress tracking
   - Pause/resume capability
3. **Offline Support** - Queue operations when offline, sync later
   - Connection detection
   - Request queueing
   - Conflict resolution
4. **Authentication Flows** - Token refresh and session management
   - Auth interceptors
   - Token storage
   - Refresh handling
5. **Network Detection** - Adapt behavior based on connectivity
   - Connection monitoring
   - Adaptive strategies
   - Recovery patterns
6. **WebSocket Integration** - Abstraction for WebSocket connections
   - Connection management
   - Message handling
   - Reconnection strategy
7. **Server-Sent Events (SSE)** - Wrapper for SSE connections
   - Connection handling
   - Event parsing
   - Reconnection logic
8. **State Synchronization** - Keep multiple clients in sync
   - Change detection
   - Synchronization protocol
   - Conflict resolution
9. **Plugin System** - Extensibility architecture
   - Plugin registration API
   - Extension points
   - Method enhancement capabilities
   - Lifecycle hooks
10. **Advanced Security Features** - Extended protection mechanisms
    - Auto-refresh of security tokens
    - Content validation
    - Request/response sanitization

### Phase 6: Finalization (Weeks 45-52)
1. **Documentation** - Comprehensive API docs and usage guides
   - API reference
   - Cookbook examples
   - Best practices
2. **Examples** - Demo applications showing various usage patterns
   - Simple examples
   - Complex workflows
   - Framework integrations
3. **Performance Optimizations** - Memory and speed improvements
   - Memory profiling
   - CPU profiling
   - Optimization implementation
4. **Testing** - Complete test coverage and edge case handling
   - Unit tests
   - Integration tests
   - Browser compatibility tests
5. **Bundling** - Multiple distribution formats
   - ESM build
   - CommonJS build
   - UMD build
6. **Developer Tools** - Logging, performance tracking, request history
   - Debug mode
   - Request inspector
   - Performance metrics
7. **API Mocking** - Test utilities for simulating API responses
   - Mock definition
   - Response generation
   - Network condition simulation
8. **Request/Response Compression** - Automatic compression handling
   - Content-encoding support
   - Automatic decompression
   - Compression options
9. **Metrics Collection** - Usage statistics and performance monitoring
   - Timing metrics
   - Usage patterns
   - Performance analysis