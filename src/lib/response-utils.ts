/**
 * Response Utilities
 *
 * Helpers for consistent API response formatting.
 */

/**
 * Convert a snake_case string to camelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Recursively transform all keys in an object from snake_case to camelCase.
 * Handles nested objects and arrays. Non-object values pass through unchanged.
 */
export function camelizeKeys<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => camelizeKeys(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = snakeToCamel(key);
    result[camelKey] = camelizeKeys(value);
  }
  return result as T;
}
