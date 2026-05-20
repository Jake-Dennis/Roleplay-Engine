/**
 * Validates that a string value does not exceed the specified maximum length.
 *
 * @param value - The string value to validate
 * @param max - Maximum allowed character count
 * @param field - Human-readable field name for error messages
 * @returns Error message string if validation fails, null if valid
 */
export function validateLength(value: string, max: number, field: string): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > max) {
    return `${field} must be ${max} characters or less`;
  }
  return null;
}
