// src/core/fetch-kit.ts

import { fetch } from "@core/fetch";
import { adapterRegistry } from "@adapters/adapter-registry";
import { CacheManager } from "@cache/cache-manager";
import { generateCacheKey } from "@cache/cache-key";
import type { Adapter } from "@fk-types/adapter";
import type { CacheOptions } from "@fk-types/cache";
import type { RequestOptions } from "@fk-types/core";
import type {
  ExtendedFetchKitConfig,
  ExtendedRequestOptions,
  CacheMethods,
} from "@fk-types/core-extension";
import type { RetryConfig } from "@fk-types/error";

/**
 * Core FetchKit interface from original implementation
 */
export interface BaseFetchKit {
  fetch: <T>(url: string, options?: RequestOptions) => Promise<T>;
  get: <T>(url: string, options?: RequestOptions) => Promise<T>;
  post: <T>(url: string, data?: any, options?: RequestOptions) => Promise<T>;
  put: <T>(url: string, data?: any, options?: RequestOptions) => Promise<T>;
  delete: <T>(url: string, options?: RequestOptions) => Promise<T>;
  patch: <T>(url: string, data?: any, options?: RequestOptions) => Promise<T>;
  createAbortController: () => {
    controller: AbortController;
    abort: (reason?: any) => void;
    signal: AbortSignal;
  };

  // Adapter management
  setAdapter: (adapter: Adapter) => void;
  getAdapter: (name?: string) => Adapter;
  getAdapterNames: () => string[];
}

/**
 * Extended FetchKit interface with cache methods
 */
export type FetchKit = BaseFetchKit & CacheMethods;

/**
 * Creates a new FetchKit instance with the specified configuration
 */
export function createFetchKit(config: ExtendedFetchKitConfig = {}): FetchKit {
  const {
    baseUrl = "",
    defaultHeaders = {},
    timeout,
    retry,
    adapter,
    cacheOptions: globalCacheOptions,
  } = config;

  // Initialize cache manager
  const cacheManager = new CacheManager();

  // Set default cache options
  const defaultCacheOptions: CacheOptions = {
    staleTime: 0, // Stale immediately
    cacheTime: 5 * 60 * 1000, // 5 minutes
    revalidate: true, // Auto-revalidate stale data
    ...globalCacheOptions,
  };

  // Set custom adapter if provided
  if (adapter) {
    adapterRegistry.register(adapter);
    adapterRegistry.setActive(adapter.name);
  }

  /**
   * Normalizes a URL by ensuring it has the correct format
   * when combined with the base URL
   */
  const normalizeUrl = (url: string): string => {
    if (!baseUrl) return url;

    // If URL is absolute, return it as-is
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    // Ensure baseUrl ends with / and url doesn't start with / when combining
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const normalizedPath = url.startsWith("/") ? url.substring(1) : url;

    return `${normalizedBase}${normalizedPath}`;
  };

  /**
   * Process retry options from both global config and request options
   */
  const processRetryOptions = (
    requestRetry?: boolean | Partial<RetryConfig>
  ): Partial<RetryConfig> | undefined => {
    // If retry is explicitly disabled for this request
    if (requestRetry === false) {
      return undefined;
    }

    // If retry is enabled for this request (either true or config object)
    if (requestRetry) {
      // If it's just a boolean true, use the global config
      if (requestRetry === true) {
        return retry;
      }

      // Otherwise merge the global config with the request config
      return { ...retry, ...requestRetry };
    }

    // If retry is not specified for this request, use the global config
    return retry;
  };

  /**
   * Process cache options from both global config and request options
   */
  const processCacheOptions = (
    requestCacheOptions?: boolean | CacheOptions
  ): CacheOptions | undefined => {
    // If cache is explicitly disabled for this request
    if (requestCacheOptions === false) {
      return undefined;
    }

    // If cache is enabled for this request (either true or config object)
    if (requestCacheOptions) {
      // If it's just a boolean true, use the default options
      if (requestCacheOptions === true) {
        return defaultCacheOptions;
      }

      // Otherwise merge the default options with the request options
      return { ...defaultCacheOptions, ...requestCacheOptions };
    }

    // If cache is not specified for this request, use the default options
    return defaultCacheOptions;
  };

  /**
   * Main fetch method with caching support
   */
  const fetchMethod = async <T>(
    url: string,
    options: ExtendedRequestOptions = {}
  ): Promise<T> => {
    const fullUrl = normalizeUrl(url);
    const headers = { ...defaultHeaders, ...options.headers };
    const requestTimeout = options.timeout ?? timeout;
    const retryOptions = processRetryOptions(options.retry);
    const cacheOptions = processCacheOptions(options.cacheOptions);

    // Handle caching for GET requests
    if ((options.method === "GET" || !options.method) && cacheOptions) {
      const cacheKey = getCacheKey(fullUrl, { ...options, headers });

      return cacheManager.swr<T>(
        cacheKey,
        () =>
          executeRequest<T>(fullUrl, {
            ...options,
            headers,
            timeout: requestTimeout,
            retry: retryOptions,
          }),
        cacheOptions
      );
    }

    // For non-GET requests or when cache is disabled, bypass cache
    return executeRequest<T>(fullUrl, {
      ...options,
      headers,
      timeout: requestTimeout,
      retry: retryOptions,
    });
  };

  /**
   * Execute the actual fetch request (without caching)
   */
  const executeRequest = <T>(
    url: string,
    options: RequestOptions = {}
  ): Promise<T> => {
    return fetch<T>(url, options);
  };

  /**
   * Get cache key for a request
   */
  const getCacheKey = (
    url: string,
    options?: ExtendedRequestOptions
  ): string => {
    // Use custom cache key if provided
    if (
      options?.cacheOptions &&
      typeof options.cacheOptions === "object" &&
      options.cacheOptions.cacheKey
    ) {
      return options.cacheOptions.cacheKey;
    }

    return generateCacheKey(url, options);
  };

  /**
   * Creates an AbortController for request cancellation
   */
  const createAbortController = () => {
    const controller = new AbortController();
    return {
      controller,
      abort: (reason?: any) => controller.abort(reason),
      signal: controller.signal,
    };
  };

  // Build the FetchKit instance
  const fetchKit: FetchKit = {
    fetch: fetchMethod as <T>(
      url: string,
      options?: RequestOptions
    ) => Promise<T>,

    get: <T>(url: string, options: ExtendedRequestOptions = {}): Promise<T> => {
      return fetchMethod<T>(url, { ...options, method: "GET" });
    },

    post: <T>(
      url: string,
      data?: any,
      options: ExtendedRequestOptions = {}
    ): Promise<T> => {
      return fetchMethod<T>(url, {
        ...options,
        method: "POST",
        body: data,
      });
    },

    put: <T>(
      url: string,
      data?: any,
      options: ExtendedRequestOptions = {}
    ): Promise<T> => {
      return fetchMethod<T>(url, {
        ...options,
        method: "PUT",
        body: data,
      });
    },

    delete: <T>(
      url: string,
      options: ExtendedRequestOptions = {}
    ): Promise<T> => {
      return fetchMethod<T>(url, { ...options, method: "DELETE" });
    },

    patch: <T>(
      url: string,
      data?: any,
      options: ExtendedRequestOptions = {}
    ): Promise<T> => {
      return fetchMethod<T>(url, {
        ...options,
        method: "PATCH",
        body: data,
      });
    },

    createAbortController,

    // Adapter management methods
    setAdapter: (adapter: Adapter): void => {
      adapterRegistry.register(adapter);
      adapterRegistry.setActive(adapter.name);
    },

    getAdapter: (name?: string): Adapter => {
      if (name) {
        const adapter = adapterRegistry.get(name);
        if (!adapter) {
          throw new Error(`Adapter '${name}' not found`);
        }
        return adapter;
      }

      return adapterRegistry.getActive();
    },

    getAdapterNames: (): string[] => {
      return adapterRegistry.getAdapterNames();
    },

    // Cache management methods
    invalidateCache: (cacheKey?: string): void => {
      if (cacheKey) {
        cacheManager.invalidate(cacheKey);
      } else {
        cacheManager.clear();
      }
    },

    invalidateCacheMatching: (predicate: (key: string) => boolean): void => {
      cacheManager.invalidateMatching(predicate);
    },

    getCacheKey: (url: string, options?: ExtendedRequestOptions): string => {
      return getCacheKey(normalizeUrl(url), options);
    },
  };

  return fetchKit;
}
