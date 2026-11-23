import { describe, it, expect } from 'vitest';
import { parseServerDate } from '../utils/date';

describe('parseServerDate', () => {
  it('parses a string with no timezone as UTC', () => {
    const parsed = parseServerDate('2026-11-23T16:07:57.037325');
    expect(parsed).not.toBeNull();
    expect(parsed?.toISOString()).toBe('2026-11-23T16:07:57.037Z');
  });

  it('parses a string with Z as UTC', () => {
    const parsed = parseServerDate('2026-11-23T16:07:57.037Z');
    expect(parsed).not.toBeNull();
    expect(parsed?.toISOString()).toBe('2026-11-23T16:07:57.037Z');
  });

  it('handles empty, null, or undefined values safely', () => {
    expect(parseServerDate('')).toBeNull();
    expect(parseServerDate('   ')).toBeNull();
    expect(parseServerDate(null)).toBeNull();
    expect(parseServerDate(undefined)).toBeNull();
  });
});
