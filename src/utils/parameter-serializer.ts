// src/utils/parameter-serializer.ts

/**
 * Options for parameter serialization
 */
export interface SerializationOptions {
  /** Array format: 'comma', 'bracket', 'repeat' */
  arrayFormat?: 'comma' | 'bracket' | 'repeat';
  /** Date format: 'iso', 'timestamp' */
  dateFormat?: 'iso' | 'timestamp';
  /** Whether to encode URI components */
  encode?: boolean;
  /** Whether to preserve spaces in nested object values */
  preserveSpaces?: boolean;
  /** Custom serializer for specific types */
  serializers?: {
    [key: string]: (value: any) => string;
  };
}

/**
 * Serializes a value based on its type
 */
function serializeValue(value: any, options: SerializationOptions, key: string): string | string[] {
  if (value === null || value === undefined) {
    return '';
  }

  // Check for custom serializer
  if (options.serializers?.[key]) {
    return options.serializers[key](value);
  }

  // Handle Date objects
  if (value instanceof Date) {
    return options.dateFormat === 'timestamp' ? value.getTime().toString() : value.toISOString();
  }

  // Handle arrays
  if (Array.isArray(value)) {
    switch (options.arrayFormat) {
      case 'comma':
        return [value.join(',')];
      case 'bracket':
        return value.map(v => `${encodeURIComponent(v)}`);
      case 'repeat':
      default:
        return value.map(v => serializeValue(v, options, key) as string);
    }
  }

  // Handle objects (nested parameters)
  if (typeof value === 'object') {
    return serializeObject(value, options);
  }

  // Handle primitives
  const serialized = value.toString();
  // Encode if encode option is true
  return options.encode ? encodeURIComponent(serialized) : serialized;
}

/**
 * Serializes an object into URL parameters
 */
function serializeObject(
  obj: Record<string, any>,
  options: SerializationOptions,
  prefix = '',
): string[] {
  return Object.entries(obj).reduce<string[]>((params, [key, value]) => {
    if (value === null || value === undefined) return params;

    const paramKey = prefix ? `${prefix}[${key}]` : key;

    if (typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      // Handle nested objects recursively
      const nestedOptions = { ...options, encode: false };
      const nestedParams = serializeObject(value, nestedOptions, paramKey);
      params.push(...nestedParams);
    } else {
      const serialized = serializeValue(value, options, key);
      if (Array.isArray(serialized)) {
        params.push(...serialized.map(v => `${paramKey}=${v}`));
      } else if (serialized !== '') {
        params.push(`${paramKey}=${serialized}`);
      }
    }

    return params;
  }, []);
}

/**
 * Serializes parameters into a URL-compatible string
 */
export function serializeParams(
  params: Record<string, any>,
  options: SerializationOptions = {},
): string {
  const defaultOptions: SerializationOptions = {
    arrayFormat: 'repeat',
    dateFormat: 'iso',
    encode: true,
    ...options,
  };

  const serialized = serializeObject(params, defaultOptions);
  return serialized.length > 0 ? `?${serialized.join('&')}` : '';
}

/**
 * Deserializes a URL query string into an object
 */
export function deserializeParams(
  queryString: string,
  options: SerializationOptions = {},
): Record<string, any> {
  const result: Record<string, any> = {};

  // Remove leading ? if present
  const query = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  if (!query) {
    return result;
  }

  // Split into key-value pairs
  const pairs = query.split('&');

  for (const pair of pairs) {
    if (!pair.includes('=')) continue;

    const [key, value] = pair.split('=').map(part => {
      // Always decode if encode is true or undefined
      if (options.encode !== false) {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      }
      return part;
    });

    // Handle nested parameters with square brackets
    const bracketMatch = key.match(/^([^\[]+)(.*)$/);
    if (!bracketMatch) continue;

    const [, baseKey, brackets] = bracketMatch;
    const keys = [baseKey];

    // Extract nested keys from brackets
    let match;
    const bracketRegex = /\[([^\]]*)]|$/g;
    while ((match = bracketRegex.exec(brackets)) && match[1] !== undefined) {
      keys.push(match[1]);
    }

    // Build nested structure
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k];
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      if (lastKey in current) {
        current[lastKey] = Array.isArray(current[lastKey])
          ? [...current[lastKey], value]
          : [current[lastKey], value];
      } else {
        current[lastKey] = value;
      }
    }
  }

  return result;
}
