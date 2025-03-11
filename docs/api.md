# FetchKit API Documentation

## Table of Contents

1. [Core API](#core-api)
   - [createFetchKit](#createfetchkit)
   - [HTTP Methods](#http-methods)
   - [Request Cancellation](#request-cancellation)
   
2. [Adapter System](#adapter-system)
   - [Using Built-in Adapters](#using-built-in-adapters)
   - [Switching Adapters](#switching-adapters)
   - [Creating Custom Adapters](#creating-custom-adapters)

3. [Error Handling](#error-handling)
   - [Error Categories](#error-categories)
   - [Handling Different Error Types](#handling-different-error-types)
   - [Retry Configuration](#retry-configuration)

4. [TypeScript Support](#typescript-support)
   - [Request/Response Types](#requestresponse-types)
   - [Error Types](#error-types)
   - [Configuration Types](#configuration-types)

## Core API

FetchKit provides a simple yet powerful API for making HTTP requests with advanced capabilities.

### createFetchKit

The main entry point for creating a FetchKit instance with custom configuration.

```typescript
import { createFetchKit } from 'fetchkit';

const fk = createFetchKit({
  baseUrl: 'https://api.example.com',
  defaultHeaders: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token123'
  },
  timeout: 5000,
  retry: {
    count: 3,
    backoff: 'exponential'
  }
});
```

#### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `baseUrl` | `string` | Base URL prepended to all request URLs |
| `defaultHeaders` | `Record<string, string>` | Default headers included with every request |
| `timeout` | `number` | Default timeout in milliseconds |
| `retry` | `RetryConfig` | Default retry configuration |
| `adapter` | `Adapter` | Custom adapter to use for requests |

### HTTP Methods

FetchKit provides convenience methods for common HTTP verbs.

```typescript
// GET request
const users = await fk.get('/users');

// POST request with body
const newUser = await fk.post('/users', {
  name: 'John Doe',
  email: 'john@example.com'
});

// PUT request with body
await fk.put('/users/123', {
  name: 'John Updated'
});

// DELETE request
await fk.delete('/users/123');

// PATCH request with body
await fk.patch('/users/123', {
  status: 'inactive'
});
```

#### Request Options

Each method accepts an optional `options` object with the following properties:

```typescript
// Example with options
const users = await fk.get('/users', {
  headers: { 'X-Custom-Header': 'value' },
  params: { limit: 10, offset: 20 },
  timeout: 3000,
  signal: abortController.signal,
  retry: { count: 2 }
});
```

| Option | Type | Description |
|--------|------|-------------|
| `method` | `string` | HTTP method (automatically set by convenience methods) |
| `headers` | `Record<string, string>` | Headers to include with this request |
| `body` | `any` | Request body (automatically set by POST/PUT/PATCH methods) |
| `params` | `Record<string, any>` | Query parameters to append to URL |
| `timeout` | `number` | Request timeout in milliseconds |
| `signal` | `AbortSignal` | AbortSignal for cancellation |
| `responseType` | `string` | Expected response type ('json', 'text', etc.) |
| `retry` | `RetryConfig \| boolean` | Retry configuration for this request |

### Request Cancellation

FetchKit provides utilities for cancelling requests using the AbortController API.

```typescript
// Create an abort controller
const { signal, abort } = fk.createAbortController();

// Start a request with the signal
const fetchPromise = fk.get('/users', { signal });

// Cancel the request when needed
abort();

// Handle the cancellation
try {
  const data = await fetchPromise;
} catch (error) {
  if (error.isCancelled) {
    console.log('Request was cancelled');
  }
}
```

## Adapter System

The adapter system allows FetchKit to work with different HTTP clients while maintaining a consistent API.

### Using Built-in Adapters

FetchKit comes with a default fetch adapter that uses the browser's native fetch API.

```typescript
import { fetchAdapter } from 'fetchkit';

// The default adapter is used automatically
const fk = createFetchKit();

// You can explicitly set it if needed
fk.setAdapter(fetchAdapter);
```

### Switching Adapters

You can switch between registered adapters at runtime.

```typescript
// Get all registered adapter names
const adapterNames = fk.getAdapterNames();
console.log('Available adapters:', adapterNames);

// Get the active adapter
const activeAdapter = fk.getAdapter();
console.log('Active adapter:', activeAdapter.name);

// Get a specific adapter by name
const fetchAdapter = fk.getAdapter('fetch');
```

### Creating Custom Adapters

You can create custom adapters to use alternative HTTP clients.

```typescript
import { createFetchKit, Adapter } from 'fetchkit';

// Example adapter using a hypothetical HTTP client
const myCustomAdapter: Adapter = {
  name: 'custom-client',
  
  // Make a request using your client
  async request(request) {
    const response = await customClient.request({
      url: request.url,
      method: request.method,
      // Map other options...
    });
    
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      originalResponse: response
    };
  },
  
  // Transform FetchKit options to your client's format
  transformRequest(url, options) {
    return {
      url,
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      // Map other options...
    };
  },
  
  // Transform your client's response to FetchKit format
  transformResponse(response) {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      originalResponse: response
    };
  }
};

// Use your custom adapter
const fk = createFetchKit({
  adapter: myCustomAdapter
});
```

## Error Handling

FetchKit provides a comprehensive error handling system with categorization and retry capabilities.

### Error Categories

Errors are automatically categorized for easier handling:

| Category | Description | Status Codes |
|----------|-------------|--------------|
| `Client` | Client-side errors | 400-499 |
| `Server` | Server-side errors | 500-599 |
| `Timeout` | Request timeout errors | Usually 408 |
| `Network` | Network connectivity errors | N/A |
| `Cancel` | Cancelled requests | N/A |
| `Parse` | Response parsing errors | N/A |
| `Unknown` | Unrecognized errors | N/A |

### Handling Different Error Types

```typescript
import { ErrorCategory } from 'fetchkit';

try {
  const data = await fk.get('/api/users');
} catch (error) {
  switch (error.category) {
    case ErrorCategory.Client:
      if (error.status === 404) {
        console.error('Resource not found');
      } else if (error.status === 401) {
        console.error('Authentication required');
      } else {
        console.error('Client error:', error.message);
      }
      break;
      
    case ErrorCategory.Server:
      console.error('Server error:', error.message);
      // Maybe show a "try again later" message
      break;
      
    case ErrorCategory.Timeout:
      console.error('Request timed out');
      // Maybe offer to retry
      break;
      
    case ErrorCategory.Network:
      console.error('Network error');
      // Maybe check connectivity
      break;
      
    case ErrorCategory.Cancel:
      console.log('Request was cancelled');
      break;
      
    default:
      console.error('Unknown error:', error.message);
  }
}
```

### Retry Configuration

FetchKit can automatically retry failed requests with configurable backoff strategies.

```typescript
// Global retry configuration
const fk = createFetchKit({
  retry: {
    count: 3,
    delay: 1000,
    backoff: 'exponential',
    factor: 2,
    maxDelay: 30000
  }
});

// Per-request retry configuration
const data = await fk.get('/api/data', {
  retry: {
    count: 5,
    backoff: 'linear',
    shouldRetry: (error, attempt) => {
      // Only retry server errors and network errors
      return error.category === ErrorCategory.Server ||
             error.category === ErrorCategory.Network;
    }
  }
});

// Disable retry for a specific request
const data = await fk.get('/api/data', {
  retry: false
});
```

#### Retry Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `count` | `number` | Maximum number of retry attempts |
| `delay` | `number` | Delay between retries in milliseconds |
| `backoff` | `'fixed' \| 'linear' \| 'exponential'` | Backoff strategy for increasing delay |
| `factor` | `number` | Factor to multiply delay by for each retry (used in exponential backoff) |
| `maxDelay` | `number` | Maximum delay between retries in milliseconds |
| `shouldRetry` | `function` | Function to determine if a request should be retried |

## TypeScript Support

FetchKit provides first-class TypeScript support with comprehensive type definitions.

### Request/Response Types

You can specify the expected response type for type-safe requests:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Typed responses
const user = await fk.get<User>('/users/123');
console.log(user.name); // TypeScript knows this is a string

const users = await fk.get<User[]>('/users');
users.forEach(user => console.log(user.email));

// POST with typed request and response
interface CreateUserRequest {
  name: string;
  email: string;
}

interface CreateUserResponse {
  user: User;
  token: string;
}

const result = await fk.post<CreateUserResponse, CreateUserRequest>(
  '/users',
  { name: 'John Doe', email: 'john@example.com' }
);

console.log(result.user.id);
console.log(result.token);
```

### Error Types

FetchKit errors are fully typed with the `FetchKitError` interface:

```typescript
import { FetchKitError, ErrorCategory } from 'fetchkit';

try {
  await fk.get('/users');
} catch (error) {
  const fetchError = error as FetchKitError;
  
  console.log(fetchError.category); // ErrorCategory
  console.log(fetchError.status);   // HTTP status code
  console.log(fetchError.url);      // Request URL
  console.log(fetchError.method);   // Request method
  console.log(fetchError.data);     // Error response data
}
```

### Configuration Types

Configuration objects are also fully typed:

```typescript
import { 
  FetchKitConfig, 
  RequestOptions, 
  RetryConfig 
} from 'fetchkit';

const config: FetchKitConfig = {
  baseUrl: 'https://api.example.com',
  timeout: 5000
};

const options: RequestOptions = {
  headers: { 'X-Custom-Header': 'value' },
  timeout: 3000,
  retry: true
};

const retryConfig: RetryConfig = {
  count: 3,
  delay: 1000,
  backoff: 'exponential'
};
```
