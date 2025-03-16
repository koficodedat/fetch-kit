// src/utils/stream.ts

/**
 * Stream handling utilities for FetchKit
 */

/**
 * Options for stream handling
 */
export interface StreamOptions {
  /** Chunk size for reading streams (in bytes) */
  chunkSize?: number;
  /** Whether to transform the stream */
  transform?: boolean;
  /** Progress callback for reading streams */
  onProgress?: (progress: number) => void;
  /** Abort signal for cancelling stream processing */
  signal?: AbortSignal;
  /** Timeout for stream operations (in ms) */
  timeout?: number;
}

/**
 * Stream result containing data and metadata
 */
export interface StreamResult<T = any> {
  /** The processed data */
  data: T;
  /** Total bytes processed */
  bytesRead: number;
  /** Whether the stream was fully consumed */
  complete: boolean;
  /** Duration of stream processing in ms */
  duration: number;
}

/**
 * Transformer function for stream processing
 */
export type StreamTransformer<I = any, O = any> = (chunk: I) => O | Promise<O>;

/**
 * Reads a ReadableStream completely and returns its contents
 */
export async function readStream<T = Uint8Array>(
  stream: ReadableStream<T>,
  options: StreamOptions = {},
): Promise<StreamResult<T[]>> {
  const { onProgress, signal, timeout = 0 } = options;

  const startTime = Date.now();
  const reader = stream.getReader();
  const chunks: T[] = [];
  let bytesRead = 0;
  let complete = false;

  // Set up timeout if specified
  let timeoutId: number | undefined;
  let timeoutPromise: Promise<never> | undefined;

  if (timeout > 0) {
    timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reader.releaseLock(); // Release lock on timeout
        reject(new Error(`Stream reading timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  try {
    while (true) {
      // If abort signal is triggered, abort reading
      if (signal?.aborted) {
        reader.releaseLock(); // Release lock on abort
        throw new Error('Stream reading was aborted');
      }

      // Set up read with optional timeout
      const readPromise = reader.read();
      const result = (await (timeoutPromise
        ? Promise.race([readPromise, timeoutPromise])
        : readPromise)) as { done: boolean; value: T };

      if (result.done) {
        complete = true;
        break;
      }

      chunks.push(result.value);

      // Calculate bytes read for progress tracking
      if (result.value instanceof Uint8Array) {
        bytesRead += (result.value as unknown as Uint8Array).byteLength;
      } else if (typeof result.value === 'string') {
        bytesRead += (result.value as unknown as string).length;
      } else if (result.value && typeof result.value === 'object') {
        bytesRead += JSON.stringify(result.value).length;
      }

      // Call progress callback if provided
      if (onProgress) {
        onProgress(bytesRead);
      }
    }
  } catch (error) {
    // Make sure to release the reader lock on error
    reader.releaseLock();
    throw error;
  } finally {
    // Clean up timeout if it was set
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    // Always release the reader lock, even on successful completion
    reader.releaseLock();
  }

  const duration = Date.now() - startTime;

  return {
    data: chunks,
    bytesRead,
    complete,
    duration,
  };
}

/**
 * Transforms a stream using a provided transformer function
 */
export function transformStream<I, O>(
  stream: ReadableStream<I>,
  transformer: StreamTransformer<I, O>,
  options: StreamOptions = {},
): ReadableStream<O> {
  const { onProgress, signal } = options;
  let bytesProcessed = 0;

  return new ReadableStream<O>({
    async start(controller) {
      const reader = stream.getReader();

      try {
        while (true) {
          // Check for cancellation
          if (signal?.aborted) {
            reader.releaseLock(); // Release lock on abort
            controller.error(new Error('Stream transformation was aborted'));
            break;
          }

          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            break;
          }

          // Apply transformation
          const transformedValue = await transformer(value);
          controller.enqueue(transformedValue);

          // Update progress
          if (onProgress) {
            // Estimate bytes processed for progress tracking
            if (value instanceof Uint8Array) {
              bytesProcessed += (value as unknown as Uint8Array).byteLength;
            } else if (typeof value === 'string') {
              bytesProcessed += (value as unknown as string).length;
            } else if (value && typeof value === 'object') {
              bytesProcessed += JSON.stringify(value).length;
            }

            onProgress(bytesProcessed);
          }
        }
      } catch (error) {
        // Make sure to release the reader lock on error
        reader.releaseLock();
        controller.error(error);
      } finally {
        // Ensure reader lock is released
        reader.releaseLock();
      }
    },

    cancel(reason) {
      // The stream was cancelled by the consumer
      if (signal && !signal.aborted) {
        const abortController = new AbortController();
        abortController.abort(reason);
      }
    },
  });
}

/**
 * Creates a download stream from a URL with progress tracking
 */
export function createDownloadStream(
  url: string,
  options: StreamOptions & { headers?: Record<string, string> } = {},
): { stream: ReadableStream<Uint8Array>; contentLength?: number; contentType?: string } {
  const { signal, headers, onProgress } = options;
  let contentLength: number | undefined;
  let contentType: string | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const response = await fetch(url, { headers, signal });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        // Parse content-length and content-type headers
        const contentLengthHeader = response.headers.get('content-length');
        contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;
        contentType = response.headers.get('content-type') || undefined;

        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error('Response body is not a readable stream');
        }

        let bytesReceived = 0;

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            break;
          }

          bytesReceived += value.byteLength;
          controller.enqueue(value);

          // Call progress callback if provided
          if (onProgress) {
            if (contentLength) {
              const progress = Math.round((bytesReceived / contentLength) * 100);
              onProgress(progress);
            } else {
              onProgress(bytesReceived);
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return { stream, contentLength, contentType };
}

/**
 * Concatenates multiple Uint8Array chunks into a single array
 */
export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

/**
 * Converts a stream to different formats
 */
export async function streamToFormat<T>(
  stream: ReadableStream<Uint8Array>,
  format: 'text' | 'json' | 'blob' | 'arrayBuffer' | 'uint8Array',
  options: StreamOptions = {},
): Promise<T> {
  const { data: chunks } = await readStream(stream, options);
  const concatenated = concatUint8Arrays(chunks as unknown as Uint8Array[]);

  switch (format) {
    case 'text':
      return new TextDecoder().decode(concatenated) as unknown as T;
    case 'json':
      return JSON.parse(new TextDecoder().decode(concatenated)) as T;
    case 'blob':
      return new Blob([concatenated]) as unknown as T;
    case 'arrayBuffer':
      return concatenated.buffer as unknown as T;
    case 'uint8Array':
    default:
      return concatenated as unknown as T;
  }
}

/**
 * Checks if a stream is supported in the current environment
 */
export function isStreamSupported(): boolean {
  return (
    typeof ReadableStream !== 'undefined' &&
    typeof WritableStream !== 'undefined' &&
    typeof TransformStream !== 'undefined'
  );
}

/**
 * Creates a progress-tracking wrapper around a ReadableStream
 */
export function trackStreamProgress<T>(
  stream: ReadableStream<T>,
  onProgress: (progress: number) => void,
  totalSize?: number,
): ReadableStream<T> {
  let bytesProcessed = 0;

  return transformStream(stream, chunk => {
    // Update bytes processed
    if (chunk instanceof Uint8Array) {
      bytesProcessed += (chunk as unknown as Uint8Array).byteLength;
    } else if (typeof chunk === 'string') {
      bytesProcessed += (chunk as unknown as string).length;
    }

    // Calculate progress
    if (totalSize) {
      const progress = Math.min(Math.round((bytesProcessed / totalSize) * 100), 100);
      onProgress(progress);
    } else {
      // If total size is unknown, just report bytes processed
      onProgress(bytesProcessed);
    }

    return chunk;
  });
}
