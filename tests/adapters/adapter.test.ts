// tests/adapters/adapter.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAdapter } from "@adapters/fetch-adapter";
import { adapterRegistry } from "@adapters/adapter-registry";
import { createFetchKit } from "@core/fetch-kit";
import { Adapter } from "@fk-types/adapter";

describe("Adapter interface", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should have the default fetch adapter registered", () => {
    expect(adapterRegistry.getActive().name).toBe("fetch");
  });

  it("should allow registering a custom adapter", () => {
    // Create a mock adapter
    const mockAdapter: Adapter = {
      name: "mock",

      request: vi.fn().mockResolvedValue({
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
      }),

      transformRequest: vi.fn().mockReturnValue({
        url: "https://example.com",
        method: "GET",
      }),

      transformResponse: vi.fn().mockReturnValue({
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
      }),
    };

    // Register the adapter
    adapterRegistry.register(mockAdapter);

    // Check that it was registered
    expect(adapterRegistry.has("mock")).toBe(true);

    // Set it as active
    adapterRegistry.setActive("mock");

    // Check that it's the active adapter
    expect(adapterRegistry.getActive().name).toBe("mock");
  });

  it("should allow setting an adapter via FetchKit", async () => {
    // Create a mock adapter
    const mockAdapter: Adapter = {
      name: "test-adapter",

      request: vi.fn().mockResolvedValue({
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
      }),

      transformRequest: vi.fn().mockReturnValue({
        url: "https://example.com",
        method: "GET",
      }),

      transformResponse: vi.fn().mockReturnValue({
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
      }),
    };

    // Create FetchKit instance
    const fk = createFetchKit();

    // Set the adapter
    fk.setAdapter(mockAdapter);

    // Check that it's the active adapter
    expect(fk.getAdapter().name).toBe("test-adapter");

    // Make a request to test the adapter
    await fk.get("/api/test");

    // The adapter's transformRequest should have been called
    expect(mockAdapter.transformRequest).toHaveBeenCalled();

    // The adapter's request should have been called
    expect(mockAdapter.request).toHaveBeenCalled();
  });

  it("should pass the correct parameters to the adapter", async () => {
    // Create a mock adapter that logs the request
    const requestLog: any[] = [];

    const loggerAdapter: Adapter = {
      name: "logger",

      request: vi.fn().mockImplementation(async (request) => {
        requestLog.push(request);
        return {
          data: { logged: true },
          status: 200,
          statusText: "OK",
          headers: {},
        };
      }),

      transformRequest: vi.fn().mockImplementation((url, options) => {
        return {
          url,
          method: options.method || "GET",
          headers: options.headers,
          body: options.body,
        };
      }),

      transformResponse: vi.fn().mockImplementation((response) => {
        return response;
      }),
    };

    // Create FetchKit instance with the logger adapter
    const fk = createFetchKit({
      baseUrl: "https://api.example.com",
      defaultHeaders: { "X-API-Key": "test-key" },
    });

    fk.setAdapter(loggerAdapter);

    // Make a request
    await fk.post(
      "/users",
      { name: "John" },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    // Check the request that was passed to the adapter
    expect(requestLog.length).toBe(1);
    expect(requestLog[0].url).toContain("https://api.example.com/users");
    expect(requestLog[0].method).toBe("POST");
    expect(requestLog[0].headers).toHaveProperty("X-API-Key", "test-key");
    expect(requestLog[0].headers).toHaveProperty(
      "Content-Type",
      "application/json"
    );
    expect(requestLog[0].body).toEqual({ name: "John" });
  });

  it("should be able to initialize FetchKit with a custom adapter", () => {
    // Create a mock adapter
    const mockAdapter: Adapter = {
      name: "init-adapter",

      request: vi.fn(),
      transformRequest: vi.fn(),
      transformResponse: vi.fn(),
    };

    // Create FetchKit with the adapter
    const fk = createFetchKit({
      adapter: mockAdapter,
    });

    // Check that it's the active adapter
    expect(fk.getAdapter().name).toBe("init-adapter");
  });

  it("should transform fetch responses correctly", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock response
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Map([["content-type", "application/json"]]),
      json: vi.fn().mockResolvedValue({ name: "Test User" }),
    };
    mockResponse.headers.get = (key) =>
      mockResponse.headers.get(key.toLowerCase());
    mockResponse.headers.forEach = (callback) => {
      mockResponse.headers.forEach((value, key) => callback(value, key));
    };

    mockFetch.mockResolvedValue(mockResponse);

    // Test the fetch adapter
    const result = await fetchAdapter.request({
      url: "https://example.com/api/users",
      method: "GET",
    });

    // Verify the response was transformed correctly
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ name: "Test User" });
  });

  it("should handle fetch errors correctly", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock error response
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Map([["content-type", "application/json"]]),
      json: vi.fn().mockResolvedValue({ error: "User not found" }),
    };
    mockResponse.headers.get = (key) =>
      mockResponse.headers.get(key.toLowerCase());
    mockResponse.headers.forEach = (callback) => {
      mockResponse.headers.forEach((value, key) => callback(value, key));
    };

    mockFetch.mockResolvedValue(mockResponse);

    // Test the fetch adapter with error
    try {
      await fetchAdapter.request({
        url: "https://example.com/api/users/999",
        method: "GET",
      });

      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.status).toBe(404);
      expect(error.data).toEqual({ error: "User not found" });
    }
  });
});
