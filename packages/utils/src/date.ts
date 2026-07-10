/**
 * Date utility functions.
 */

/** Format a date to ISO string. */
export function formatDate(date: Date | string | number): string {
  return new Date(date).toISOString();
}

/** Check if a date/timestamp has expired. */
export function isExpired(expiresAt: Date | string | number): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}
