# FetchKit

A frontend-agnostic, vanilla JavaScript-first library for fetching, updating, and managing asynchronous data.

## Features

- **🔄 Flexible Fetching**: Built on the native Fetch API with enhancements
- **🔌 Adapters**: Support for different HTTP clients with a consistent API
- **⏱️ Timeouts**: Configurable request timeouts with proper cancellation
- **🚫 Cancellation**: Easy request cancellation with AbortController
- **🔁 Retries**: Automatic retries with configurable backoff strategies
- **🔍 Type Safety**: First-class TypeScript support with proper generics
- **❌ Error Handling**: Comprehensive error categorization and messages
- **📦 Advanced Caching**: SWR caching with multiple eviction policies (LRU, LFU, TTL, FIFO)
- **🚀 Cache Warming**: Proactive data caching with configurable intervals
- **🔄 Smart Revalidation**: Throttling and debouncing for optimized refreshes

## Installation

```bash
yarn add fetchkit
```

## Basic Usage

```javascript
import { createFetchKit } from 'fetchkit';

// Create an instance with global configuration
const fk = createFetchKit({
  baseUrl: 'https://api.example.com',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  timeout: 5000,
});

// Make requests
async function fetchData() {
  try {
    // GET request
    const users = await fk.get('/users');

    // POST request with body
    const newUser = await fk.post('/users', {
      name: 'John Doe',
      email: 'john@example.com',
    });

    // PUT request
    await fk.put(`/users/${newUser.id}`, {
      name: 'John Updated',
    });

    // DELETE request
    await fk.delete(`/users/${newUser.id}`);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Category:', error.category);

    if (error.status) {
      console.error('Status:', error.status);
    }
  }
}
```

## Advanced Features

### Request Cancellation

```javascript
// Create an abort controller
const { signal, abort } = fk.createAbortController();

// Start a request with the signal
const userPromise = fk.get('/users', { signal });

// Cancel the request after 2 seconds
setTimeout(() => {
  abort();
}, 2000);

try {
  const users = await userPromise;
} catch (error) {
  if (error.isCancelled) {
    console.log('Request was cancelled');
  }
}
```

### Query Parameters

```javascript
// URL will be: /users?page=1&limit=10&sort=name&filter=active&filter=verified
const users = await fk.get('/users', {
  params: {
    page: 1,
    limit: 10,
    sort: 'name',
    filter: ['active', 'verified'],
    user: { role: 'admin' }, // Will be serialized as user[role]=admin
  },
});
```

### Error Handling

```javascript
import { ErrorCategory } from 'fetchkit';

try {
  const data = await fk.get('/api/users');
} catch (error) {
  switch (error.category) {
    case ErrorCategory.Client:
      console.error('Client error:', error.status, error.message);
      break;
    case ErrorCategory.Server:
      console.error('Server error:', error.message);
      break;
    case ErrorCategory.Timeout:
      console.error('Request timed out');
      break;
    case ErrorCategory.Network:
      console.error('Network error - check connection');
      break;
  }
}
```

### Automatic Retries

```javascript
// Global retry configuration
const fk = createFetchKit({
  retry: {
    count: 3,
    backoff: 'exponential',
    delay: 1000,
  },
});

// Per-request retry configuration
const data = await fk.get('/api/data', {
  retry: {
    count: 5,
    backoff: 'linear',
    shouldRetry: (error, attempt) => {
      // Only retry server errors (5xx) and network errors
      return error.category === ErrorCategory.Server || error.category === ErrorCategory.Network;
    },
  },
});
```

### Using Different Adapters

```javascript
import { createFetchKit, fetchAdapter } from 'fetchkit';

// Create a custom adapter
const myAdapter = {
  name: 'my-adapter',
  request: async request => {
    /* ... */
  },
  transformRequest: (url, options) => {
    /* ... */
  },
  transformResponse: response => {
    /* ... */
  },
};

// Use custom adapter
const fk = createFetchKit({
  adapter: myAdapter,
});

// Switch adapters at runtime
fk.setAdapter(fetchAdapter);
```

## TypeScript Support

```typescript
// Specify response types
interface User {
  id: number;
  name: string;
  email: string;
}

// Get a single user
const user = await fk.get<User>('/users/123');
console.log(user.name); // TypeScript-safe property access

// Get an array of users
const users = await fk.get<User[]>('/users');
users.forEach(user => console.log(user.email));

// Post with request and response types
interface CreateUserRequest {
  name: string;
  email: string;
}

interface CreateUserResponse {
  user: User;
  token: string;
}

const result = await fk.post<CreateUserResponse, CreateUserRequest>('/users', {
  name: 'John Doe',
  email: 'john@example.com',
});
```

## Configuration Options

### FetchKit Configuration

```javascript
const fk = createFetchKit({
  // Base URL prepended to all requests
  baseUrl: 'https://api.example.com',

  // Default headers included with every request
  defaultHeaders: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer token123',
  },

  // Default timeout in milliseconds
  timeout: 5000,

  // Default retry configuration
  retry: {
    count: 3,
    delay: 1000,
    backoff: 'exponential',
    factor: 2,
    maxDelay: 30000,
  },

  // Custom adapter
  adapter: myCustomAdapter,
});
```

### Request Options

```javascript
const options = {
  // HTTP method (set automatically by convenience methods)
  method: 'GET',

  // Request headers (merged with defaultHeaders)
  headers: {
    'X-Request-ID': '123',
  },

  // Query parameters appended to URL
  params: {
    page: 1,
    limit: 10,
  },

  // Request body (set automatically by POST/PUT/PATCH methods)
  body: { name: 'John' },

  // Request timeout in milliseconds
  timeout: 3000,

  // AbortSignal for cancellation
  signal: abortController.signal,

  // Response type expected
  responseType: 'json', // 'text', 'blob', 'arrayBuffer', 'formData'

  // Retry configuration
  retry: {
    count: 2,
    delay: 500,
  },
};

const data = await fk.get('/users', options);
```

## License

MIT
