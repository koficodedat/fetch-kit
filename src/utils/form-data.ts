// src/utils/form-data.ts

/**
 * Options for FormData handling
 */
export interface FormDataOptions {
  /** Whether to automatically detect and handle File objects */
  handleFiles?: boolean;
  /** Whether to automatically detect and handle Blob objects */
  handleBlobs?: boolean;
  /** Custom content type for the form data */
  contentType?: string;
  /** Progress callback for file uploads */
  onProgress?: (progress: number) => void;
}

/**
 * FormData entry value type
 */
type FormDataEntryValue = File | Blob | string;

/**
 * FormData entry with additional metadata
 */
interface FormDataEntry {
  value: FormDataEntryValue;
  filename?: string;
  contentType?: string;
}

/**
 * Creates FormData from an object with enhanced handling of files and blobs
 */
export function createFormData(data: Record<string, any>, options: FormDataOptions = {}): FormData {
  const formData = new FormData();

  // Process each entry
  for (const [key, value] of Object.entries(data)) {
    appendToFormData(formData, key, value, options);
  }

  return formData;
}

/**
 * Recursively appends values to FormData
 */
function appendToFormData(
  formData: FormData,
  key: string,
  value: any,
  options: FormDataOptions,
): void {
  if (value === null || value === undefined) {
    return;
  }

  // Handle File objects
  if (options.handleFiles && value instanceof File) {
    formData.append(key, value, value.name);
    return;
  }

  // Handle Blob objects
  if (options.handleBlobs && value instanceof Blob) {
    const filename = `blob-${Date.now()}`;
    formData.append(key, value, filename);
    return;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendToFormData(formData, `${key}[${index}]`, item, options);
    });
    return;
  }

  // Handle objects (but not Files or Blobs)
  if (typeof value === 'object' && !(value instanceof File) && !(value instanceof Blob)) {
    Object.entries(value).forEach(([propKey, propValue]) => {
      appendToFormData(formData, `${key}[${propKey}]`, propValue, options);
    });
    return;
  }

  // Handle primitive values
  formData.append(key, String(value));
}

/**
 * Extracts FormData entries into a structured object
 */
export function extractFormData(formData: FormData): Record<string, FormDataEntry> {
  const result: Record<string, FormDataEntry> = {};

  formData.forEach((value: FormDataEntryValue, key: string) => {
    if (value instanceof File) {
      result[key] = {
        value,
        filename: value.name,
        contentType: value.type,
      };
    } else if (value instanceof Blob) {
      result[key] = {
        value,
        contentType: value.type,
      };
    } else {
      result[key] = { value };
    }
  });

  return result;
}

/**
 * Creates a multipart request body with progress tracking
 */
export async function createMultipartBody(
  data: Record<string, any>,
  options: FormDataOptions = {},
): Promise<{
  body: FormData;
  contentType: string;
  contentLength: number;
}> {
  const formData = createFormData(data, options);
  let totalSize = 0;

  // Calculate total size for progress tracking
  for (const [, value] of formData.entries()) {
    if (value instanceof Blob) {
      totalSize += value.size;
    } else {
      totalSize += new Blob([String(value)]).size;
    }
  }

  return {
    body: formData,
    contentType: options.contentType || 'multipart/form-data',
    contentLength: totalSize,
  };
}

/**
 * Creates a progress-tracking stream for multipart uploads
 */
export function createUploadStream(
  data: FormData,
  onProgress?: (progress: number) => void,
): ReadableStream<Uint8Array> {
  // Helper function to calculate size consistently
  const calculateSize = (value: FormDataEntryValue): number => {
    if (value instanceof Blob) {
      return value.size;
    }
    return new TextEncoder().encode(String(value)).length;
  };

  // Calculate total size
  let loaded = 0;
  const totalSize = Array.from(data.entries()).reduce((size, [, value]) => {
    return size + calculateSize(value);
  }, 0);

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const [, value] of data.entries()) {
        let chunk: Uint8Array;
        if (value instanceof Blob) {
          // Read blob content directly
          const reader = new FileReader();
          const text = await new Promise<string>(resolve => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsText(value);
          });
          chunk = encoder.encode(text);
        } else {
          chunk = encoder.encode(String(value));
        }
        loaded += chunk.byteLength;
        controller.enqueue(chunk);

        if (onProgress) {
          // Ensure progress is between 0 and 100
          const progress = Math.min(Math.round((loaded / totalSize) * 100), 100);
          onProgress(progress);
        }
      }
      controller.close();
    },
  });
}
