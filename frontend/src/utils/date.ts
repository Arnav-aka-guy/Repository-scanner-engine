/**
 * Safely parse a server datetime string.
 * If the string has no timezone offset or designator (such as Z or +00:00),
 * it is treated as UTC to prevent incorrect local timezone drift.
 */
export function parseServerDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Check if string ends with a timezone offset or Z
  const hasTimezone = /Z|[+-]\d{2}(?::?\d{2})?$/i.test(trimmed);
  const normalized = hasTimezone ? trimmed : `${trimmed}Z`;
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}
