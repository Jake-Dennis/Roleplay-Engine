/**
 * Row to JSON Converter
 *
 * Converts better-sqlite3 row objects to plain JSON.
 * Handles bigint → number conversion for safe serialization.
 */

export function rowToJson(row: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (typeof value === 'bigint') {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
