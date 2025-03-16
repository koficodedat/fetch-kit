import { describe, it, expect } from 'vitest';
import {
  serializeParams,
  deserializeParams,
  type SerializationOptions,
} from '@utils/parameter-serializer';

describe('parameter-serializer', () => {
  describe('serializeParams', () => {
    it('should handle primitive values', () => {
      const params = {
        string: 'hello',
        number: 123,
        boolean: true,
        nullValue: null,
        undefinedValue: undefined,
      };

      const result = serializeParams(params);
      expect(result).toBe('?string=hello&number=123&boolean=true');
    });

    it('should handle arrays with different formats', () => {
      const params = {
        array: [1, 2, 3],
      };

      // Test repeat format (default)
      const repeatResult = serializeParams(params);
      expect(repeatResult).toBe('?array=1&array=2&array=3');

      // Test comma format
      const commaResult = serializeParams(params, { arrayFormat: 'comma' });
      expect(commaResult).toBe('?array=1,2,3');

      // Test bracket format
      const bracketResult = serializeParams(params, { arrayFormat: 'bracket' });
      expect(bracketResult).toBe('?array=1&array=2&array=3');
    });

    it('should handle nested objects', () => {
      const params = {
        user: {
          name: 'John',
          age: 30,
          address: {
            city: 'New York',
            zip: '10001',
          },
        },
      };

      const result = serializeParams(params);
      expect(result).toBe(
        '?user[name]=John&user[age]=30&user[address][city]=New York&user[address][zip]=10001',
      );
    });

    it('should handle Date objects', () => {
      const date = new Date('2025-03-15T12:00:00Z');
      const params = {
        date,
      };

      // Test ISO format (default)
      const isoResult = serializeParams(params);
      expect(isoResult).toBe(`?date=${date.toISOString()}`);

      // Test timestamp format
      const timestampResult = serializeParams(params, { dateFormat: 'timestamp' });
      expect(timestampResult).toBe(`?date=${date.getTime()}`);
    });

    it('should handle custom serializers', () => {
      const params = {
        customField: 'test',
      };

      const options: SerializationOptions = {
        serializers: {
          customField: (value: string) => `custom_${value}`,
        },
      };

      const result = serializeParams(params, options);
      expect(result).toBe('?customField=custom_test');
    });

    it('should handle URL encoding', () => {
      const params = {
        query: 'hello world & more',
        path: '/test/path',
      };

      // Test with encoding (default)
      const encodedResult = serializeParams(params);
      expect(encodedResult).toBe('?query=hello%20world%20%26%20more&path=%2Ftest%2Fpath');

      // Test without encoding
      const unencodedResult = serializeParams(params, { encode: false });
      expect(unencodedResult).toBe('?query=hello world & more&path=/test/path');
    });
  });

  describe('deserializeParams', () => {
    it('should parse primitive values', () => {
      const queryString = '?string=hello&number=123&boolean=true';
      const result = deserializeParams(queryString);

      expect(result).toEqual({
        string: 'hello',
        number: '123',
        boolean: 'true',
      });
    });

    it('should parse nested parameters', () => {
      const queryString = '?user[name]=John&user[age]=30&user[address][city]=New York';
      const result = deserializeParams(queryString);

      expect(result).toEqual({
        user: {
          name: 'John',
          age: '30',
          address: {
            city: 'New York',
          },
        },
      });
    });

    it('should handle array parameters', () => {
      const queryString = '?array=1&array=2&array=3';
      const result = deserializeParams(queryString);

      expect(result).toEqual({
        array: ['1', '2', '3'],
      });
    });

    it('should handle URL encoding', () => {
      const queryString = '?query=hello%20world%20%26%20more&path=%2Ftest%2Fpath';
      // Test with decoding (default)
      const decodedResult = deserializeParams(queryString);
      expect(decodedResult).toEqual({
        query: 'hello world & more',
        path: '/test/path',
      });

      // Test without decoding
      const undecoded = deserializeParams(queryString, { encode: false });
      expect(undecoded).toEqual({
        query: 'hello%20world%20%26%20more',
        path: '%2Ftest%2Fpath',
      });
    });

    it('should handle empty or invalid query strings', () => {
      expect(deserializeParams('')).toEqual({});
      expect(deserializeParams('?')).toEqual({});
      expect(deserializeParams('invalid')).toEqual({});
    });
  });
});
