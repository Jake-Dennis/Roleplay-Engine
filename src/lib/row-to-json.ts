/**
 * Row to JSON Converter
 *
 * Converts better-sqlite3 row objects to plain JSON with camelCase keys.
 * Handles bigint → number conversion and snake_case → camelCase transformation.
 */

import { camelizeKeys } from './response-utils';

export function rowToJson(row: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (row === null || typeof row !== 'object') return result;
  for (const key of Object.keys(row)) {
    const value = (row as Record<string, unknown>)[key];
    if (typeof value === 'bigint') {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return camelizeKeys(result);
}
