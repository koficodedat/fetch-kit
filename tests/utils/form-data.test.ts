import { describe, it, expect, vi } from 'vitest';
import {
  createFormData,
  extractFormData,
  createMultipartBody,
  createUploadStream,
  type FormDataOptions,
} from '@utils/form-data';

describe('form-data utils', () => {
  describe('createFormData', () => {
    it('should create FormData with primitive values', () => {
      const data = {
        string: 'hello',
        number: 123,
        boolean: true,
      };

      const formData = createFormData(data);
      expect(formData.get('string')).toBe('hello');
      expect(formData.get('number')).toBe('123');
      expect(formData.get('boolean')).toBe('true');
    });

    it('should handle File objects', () => {
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const data = { file };
      const options: FormDataOptions = { handleFiles: true };

      const formData = createFormData(data, options);
      const fileEntry = formData.get('file') as File;
      expect(fileEntry).toBeInstanceOf(File);
      expect(fileEntry.name).toBe('test.txt');
      expect(fileEntry.type).toBe('text/plain');
    });

    it('should handle Blob objects', () => {
      const blob = new Blob(['test content'], { type: 'text/plain' });
      const data = { blob };
      const options: FormDataOptions = { handleBlobs: true };

      const formData = createFormData(data, options);
      const blobEntry = formData.get('blob') as Blob;
      expect(blobEntry).toBeInstanceOf(Blob);
      expect(blobEntry.type).toBe('text/plain');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'John',
          details: {
            age: 30,
          },
        },
      };

      const formData = createFormData(data);
      expect(formData.get('user[name]')).toBe('John');
      expect(formData.get('user[details][age]')).toBe('30');
    });

    it('should handle arrays', () => {
      const data = {
        tags: ['one', 'two', 'three'],
      };

      const formData = createFormData(data);
      expect(formData.getAll('tags[0]')).toEqual(['one']);
      expect(formData.getAll('tags[1]')).toEqual(['two']);
      expect(formData.getAll('tags[2]')).toEqual(['three']);
    });
  });

  describe('extractFormData', () => {
    it('should extract primitive values', () => {
      const formData = new FormData();
      formData.append('string', 'hello');
      formData.append('number', '123');

      const result = extractFormData(formData);
      expect(result.string.value).toBe('hello');
      expect(result.number.value).toBe('123');
    });

    it('should extract File objects with metadata', () => {
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);

      const result = extractFormData(formData);
      expect(result.file.value).toBeInstanceOf(File);
      expect(result.file.filename).toBe('test.txt');
      expect(result.file.contentType).toBe('text/plain');
    });

    it('should extract Blob objects with metadata', () => {
      const blob = new Blob(['test content'], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('blob', blob);

      const result = extractFormData(formData);
      expect(result.blob.value).toBeInstanceOf(Blob);
      expect(result.blob.contentType).toBe('text/plain');
    });
  });

  describe('createMultipartBody', () => {
    it('should create multipart body with correct content type', async () => {
      const data = { text: 'hello' };
      const result = await createMultipartBody(data);

      expect(result.body).toBeInstanceOf(FormData);
      expect(result.contentType).toBe('multipart/form-data');
      expect(result.contentLength).toBeGreaterThan(0);
    });

    it('should calculate correct content length for mixed content', async () => {
      const file = new File(['test content'], 'test.txt');
      const data = {
        file,
        text: 'hello',
      };
      const options: FormDataOptions = { handleFiles: true };

      const result = await createMultipartBody(data, options);
      const expectedLength = file.size + new Blob(['hello']).size;
      expect(result.contentLength).toBe(expectedLength);
    });

    it('should use custom content type when provided', async () => {
      const data = { text: 'hello' };
      const options: FormDataOptions = {
        contentType: 'multipart/mixed',
      };

      const result = await createMultipartBody(data, options);
      expect(result.contentType).toBe('multipart/mixed');
    });
  });

  describe('createUploadStream', () => {
    it('should create a ReadableStream', () => {
      const formData = new FormData();
      formData.append('text', 'hello');

      const stream = createUploadStream(formData);
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('should track progress correctly', async () => {
      const onProgress = vi.fn();
      const content = 'test content';
      const blob = new Blob([content]);
      const formData = new FormData();
      formData.append('file', blob);

      const stream = createUploadStream(formData, onProgress);
      const reader = stream.getReader();

      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Verify progress was called
      expect(onProgress).toHaveBeenCalled();
      // Verify last progress call was with 100
      expect(onProgress).toHaveBeenLastCalledWith(100);

      // Verify content was streamed correctly
      const streamedContent = new TextDecoder().decode(
        new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[])),
      );
      expect(streamedContent).toBe(content);
    });
  });
});
