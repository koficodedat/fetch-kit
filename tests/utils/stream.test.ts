// tests/utils/stream.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readStream,
  transformStream,
  createDownloadStream,
  concatUint8Arrays,
  streamToFormat,
  isStreamSupported,
  trackStreamProgress,
} from '@utils/stream';

describe('stream utilities', () => {
  // Mock window.fetch if needed
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('readStream', () => {
    it('should read a stream completely', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([3, 4]) })
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const onProgress = vi.fn();
      const result = await readStream(mockStream as unknown as ReadableStream, { onProgress });

      // Verify the stream was fully read
      expect(result.complete).toBe(true);
      expect(result.bytesRead).toBe(4); // 2 chunks × 2 bytes
      expect(result.data).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Progress should have been called 2 times
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle stream abort', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: false, value: new Uint8Array([1, 2]) }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const abortController = new AbortController();
      abortController.abort();

      await expect(
        readStream(mockStream as unknown as ReadableStream, { signal: abortController.signal }),
      ).rejects.toThrow('Stream reading was aborted');

      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle stream timeout', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockImplementation(
            () =>
              new Promise(resolve =>
                setTimeout(() => resolve({ done: false, value: new Uint8Array([1, 2]) }), 100),
              ),
          ),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      await expect(
        readStream(mockStream as unknown as ReadableStream, { timeout: 50 }),
      ).rejects.toThrow('Stream reading timed out');

      expect(mockReader.releaseLock).toHaveBeenCalled();
    });
  });

  describe('transformStream', () => {
    it('should transform each chunk of a stream', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: 1 })
          .mockResolvedValueOnce({ done: false, value: 2 })
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      // Transform function that doubles each number
      const transformer = (chunk: number) => chunk * 2;

      const transformedStream = transformStream(
        mockStream as unknown as ReadableStream,
        transformer,
      );
      const reader = transformedStream.getReader();
      const result: number[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result.push(value);
      }

      expect(result).toEqual([2, 4]);
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle transformation errors', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: 'valid' })
          .mockResolvedValueOnce({ done: false, value: 'error' })
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      // Transformer that throws on specific input
      const transformer = (chunk: string) => {
        if (chunk === 'error') {
          throw new Error('Transformation error');
        }
        return chunk.toUpperCase();
      };

      const transformedStream = transformStream(
        mockStream as unknown as ReadableStream,
        transformer,
      );
      const reader = transformedStream.getReader();

      // First chunk should transform successfully
      const result1 = await reader.read();
      expect(result1.value).toBe('VALID');

      // Second chunk should cause an error
      await expect(reader.read()).rejects.toThrow('Transformation error');
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });
  });

  describe('createDownloadStream', () => {
    it('should create a download stream and process data correctly', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5, 6]) })
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-length': '6',
          'content-type': 'application/octet-stream',
        }),
        body: mockStream as unknown as ReadableStream,
      };

      // Mock fetch to return our mockResponse
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const onProgress = vi.fn();

      // Only test the stream functionality, not the metadata which is set asynchronously
      const { stream } = createDownloadStream('https://example.com/file', { onProgress });

      // Read the stream
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Verify the stream content
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
      expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]));

      // Check progress was called
      expect(onProgress).toHaveBeenCalled();

      // Verify fetch was called correctly
      expect(fetch).toHaveBeenCalledWith('https://example.com/file', {
        headers: undefined,
        signal: undefined,
      });
    });

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const { stream } = createDownloadStream('https://example.com/not-found');
      const reader = stream.getReader();

      await expect(reader.read()).rejects.toThrow('HTTP error 404');
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { stream } = createDownloadStream('https://example.com/file');
      const reader = stream.getReader();

      await expect(reader.read()).rejects.toThrow('Network error');
    });
  });

  describe('concatUint8Arrays', () => {
    it('should concatenate multiple Uint8Array chunks', () => {
      const chunks = [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5]),
        new Uint8Array([6, 7, 8, 9]),
      ];

      const result = concatUint8Arrays(chunks);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.byteLength).toBe(9);
      expect([...result]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle empty arrays', () => {
      expect(concatUint8Arrays([])).toEqual(new Uint8Array(0));
    });

    it('should handle single chunk', () => {
      const chunk = new Uint8Array([1, 2, 3]);
      expect(concatUint8Arrays([chunk])).toEqual(chunk);
    });
  });

  describe('streamToFormat', () => {
    it('should convert stream to text', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([72, 101, 108, 108, 111]) }) // 'Hello'
          .mockResolvedValueOnce({
            done: false,
            value: new Uint8Array([44, 32, 119, 111, 114, 108, 100, 33]),
          }) // ', world!'
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const result = await streamToFormat<string>(mockStream as unknown as ReadableStream, 'text');
      expect(result).toBe('Hello, world!');
    });

    it('should convert stream to JSON', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new Uint8Array([
              123, 34, 110, 97, 109, 101, 34, 58, 34, 74, 111, 104, 110, 34, 44, 34, 97, 103, 101,
              34, 58, 51, 48, 125,
            ]),
          }) // '{"name":"John","age":30}'
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const result = await streamToFormat<{ name: string; age: number }>(
        mockStream as unknown as ReadableStream,
        'json',
      );
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should convert stream to Blob', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const result = await streamToFormat<Blob>(mockStream as unknown as ReadableStream, 'blob');
      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBe(3);
    });

    it('should convert stream to ArrayBuffer', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const result = await streamToFormat<ArrayBuffer>(
        mockStream as unknown as ReadableStream,
        'arrayBuffer',
      );
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(3);
    });
  });

  describe('isStreamSupported', () => {
    it('should detect stream support', () => {
      // In Node.js or modern browsers, streams should be supported
      expect(isStreamSupported()).toBe(true);

      // Mock an environment without streams
      const origReadableStream = global.ReadableStream;
      global.ReadableStream = undefined as any;

      expect(isStreamSupported()).toBe(false);

      // Restore
      global.ReadableStream = origReadableStream;
    });
  });

  describe('trackStreamProgress', () => {
    it('should track progress for known total size', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) }) // 3 bytes
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5, 6, 7]) }) // 4 bytes
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const onProgress = vi.fn();
      const totalSize = 7; // 3 + 4 bytes

      const trackedStream = trackStreamProgress(
        mockStream as unknown as ReadableStream,
        onProgress,
        totalSize,
      );
      const reader = trackedStream.getReader();

      // Read first chunk
      await reader.read();
      expect(onProgress).toHaveBeenLastCalledWith(43); // ~3/7 = 43%

      // Read second chunk
      await reader.read();
      expect(onProgress).toHaveBeenLastCalledWith(100); // 7/7 = 100%

      // Finish stream
      const { done } = await reader.read();
      expect(done).toBe(true);
    });

    it('should track progress for unknown total size', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) }) // 3 bytes
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5, 6, 7]) }) // 4 bytes
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const onProgress = vi.fn();

      const trackedStream = trackStreamProgress(
        mockStream as unknown as ReadableStream,
        onProgress,
      );
      const reader = trackedStream.getReader();

      // Read first chunk
      await reader.read();
      expect(onProgress).toHaveBeenLastCalledWith(3); // 3 bytes

      // Read second chunk
      await reader.read();
      expect(onProgress).toHaveBeenLastCalledWith(7); // 7 bytes total

      // Finish stream
      const { done } = await reader.read();
      expect(done).toBe(true);
    });
  });
});
