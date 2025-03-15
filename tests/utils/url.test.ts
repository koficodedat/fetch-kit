import { buildUrl, parseUrl } from '@/utils/url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('url.ts', () => {
  // Mock window.location for browser environment testing
  const originalWindow = global.window;

  beforeEach(() => {
    // Mock window object
    global.window = {
      location: {
        origin: 'https://example.com',
        protocol: 'https:',
        host: 'example.com',
      },
    } as any;
  });

  afterEach(() => {
    // Restore original window object
    global.window = originalWindow;
  });

  describe('buildUrl', () => {
    it('should build a URL with no parameters', () => {
      const result = buildUrl('/path');
      expect(result).toBe('https://example.com/path');
    });

    it('should build a URL with query parameters', () => {
      const result = buildUrl('/path', { param1: 'value1', param2: 'value2' });
      expect(result).toBe('https://example.com/path?param1=value1&param2=value2');
    });

    it('should handle absolute URLs correctly', () => {
      const result = buildUrl('https://other-site.com/path', { param: 'value' });
      expect(result).toBe('https://other-site.com/path?param=value');
    });

    it('should respect custom baseUrl option', () => {
      const result = buildUrl('/path', { param: 'value' }, { baseUrl: 'https://custom-base.com' });
      expect(result).toBe('https://custom-base.com/path?param=value');
    });

    it('should strip base URL when stripBase is true', () => {
      const result = buildUrl('/path', { param: 'value' }, { stripBase: true });
      expect(result).toBe('/path?param=value');
    });

    it('should preserve existing query parameters when preserveQuery is true', () => {
      const result = buildUrl('/path?existing=param', { new: 'value' });
      expect(result).toBe('https://example.com/path?existing=param&new=value');
    });

    it('should not preserve existing query parameters when preserveQuery is false', () => {
      const result = buildUrl('/path?existing=param', { new: 'value' }, { preserveQuery: false });
      expect(result).toBe('https://example.com/path?new=value');
    });

    it('should handle complex parameters correctly', () => {
      const params = {
        string: 'value',
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        nested: {
          key: 'value',
          deep: {
            deeper: 'deepValue',
          },
        },
      };

      const result = buildUrl('/path', params);

      // Verify that all parameters are included
      expect(result).toContain('string=value');
      expect(result).toContain('number=123');
      expect(result).toContain('boolean=true');
      expect(result).toContain('nested[key]=value');
      expect(result).toContain('nested[deep][deeper]=deepValue');

      // Verify array format (default is 'repeat')
      expect(result).toMatch(/array=1.*array=2.*array=3/);
    });

    it('should handle array parameters with different formats', () => {
      const params = { array: [1, 2, 3] };

      // Default 'repeat' format
      const result1 = buildUrl('/path', params);
      expect(result1).toMatch(/array=1.*array=2.*array=3/);

      // 'comma' format
      const result2 = buildUrl('/path', params, { arrayFormat: 'comma' });
      expect(result2).toContain('array=1,2,3');

      // 'bracket' format
      const result3 = buildUrl('/path', params, { arrayFormat: 'bracket' });
      expect(result3).toMatch(/array=1.*array=2.*array=3/);
    });

    it('should handle Date objects with different formats', () => {
      const date = new Date('2023-01-01T12:00:00Z');
      const params = { date };

      // Default 'iso' format
      const result1 = buildUrl('/path', params);
      expect(result1).toContain('date=2023-01-01T12:00:00.000Z');

      // 'timestamp' format
      const result2 = buildUrl('/path', params, { dateFormat: 'timestamp' });
      expect(result2).toContain(`date=${date.getTime()}`);
    });

    it('should apply custom serializers when provided', () => {
      const params = { customField: 'value' };
      const options = {
        serializers: {
          customField: (value: string) => `CUSTOM-${value.toUpperCase()}`,
        },
      };

      const result = buildUrl('/path', params, options);
      expect(result).toContain('customField=CUSTOM-VALUE');
    });

    it('should handle non-browser environments gracefully', () => {
      // Simulate Node.js environment
      global.window = undefined as any;

      const result = buildUrl('/path', { param: 'value' });
      expect(result).toBe('http://localhost/path?param=value');
    });

    it('should handle URL with hash fragments', () => {
      const result = buildUrl('/path#section', { param: 'value' });
      expect(result).toBe('https://example.com/path?param=value#section');
    });

    it('should handle invalid URLs with proper error message', () => {
      // This test should throw because the URL is malformed
      global.window = undefined as any;

      expect(() => {
        buildUrl('http://-invalid-url.com', {});
      }).toThrow('Invalid URL');
    });
  });

  describe('parseUrl', () => {
    it('should parse an absolute URL correctly', () => {
      const result = parseUrl('https://example.com/path?param1=value1&param2=value2#section');

      expect(result.protocol).toBe('https');
      expect(result.host).toBe('example.com');
      expect(result.pathname).toBe('/path');
      expect(result.params).toEqual({ param1: 'value1', param2: 'value2' });
      expect(result.hash).toBe('section');
    });

    it('should parse a relative URL correctly', () => {
      const result = parseUrl('/path?param=value#section');

      expect(result.protocol).toBe('https');
      expect(result.host).toBe('example.com');
      expect(result.pathname).toBe('/path');
      expect(result.params).toEqual({ param: 'value' });
      expect(result.hash).toBe('section');
    });

    it('should handle URLs without query parameters', () => {
      const result = parseUrl('https://example.com/path');

      expect(result.pathname).toBe('/path');
      expect(result.params).toEqual({});
    });

    it('should handle URLs without hash fragments', () => {
      const result = parseUrl('https://example.com/path?param=value');

      expect(result.params).toEqual({ param: 'value' });
      expect(result.hash).toBe('');
    });

    it('should correctly parse complex query parameters', () => {
      const url =
        'https://example.com/path?nested[key]=value&nested[deep][key]=deepValue&array=1&array=2&array=3';
      const result = parseUrl(url);

      expect(result.params).toEqual({
        nested: {
          key: 'value',
          deep: {
            key: 'deepValue',
          },
        },
        array: ['1', '2', '3'], // Note: without dynamicTyping, these will be strings
      });
    });

    it('should handle non-browser environments gracefully', () => {
      // Simulate Node.js environment
      global.window = undefined as any;

      const result = parseUrl('https://example.com/path');
      expect(result.protocol).toBe('https');
      expect(result.host).toBe('example.com');
      expect(result.pathname).toBe('/path');
    });

    it('should handle parsing URL with encoded characters', () => {
      const url = 'https://example.com/path?text=Hello%20World&special=%26%3D%3F';
      const result = parseUrl(url);

      expect(result.params).toEqual({
        text: 'Hello World',
        special: '&=?',
      });
    });

    it('should respect the encode option', () => {
      const url = 'https://example.com/path?text=Hello%20World';

      // With encoding (default)
      const result1 = parseUrl(url);
      expect(result1.params.text).toBe('Hello World');

      // Without encoding
      const result2 = parseUrl(url, { encode: false });
      expect(result2.params.text).toBe('Hello%20World');
    });

    it('should handle invalid URLs with proper error message', () => {
      // This test should throw because the URL is malformed
      global.window = undefined as any;

      expect(() => {
        parseUrl('http://invalid-url-with-invalid-char[].com');
      }).toThrow('Invalid URL');
    });
  });
});
