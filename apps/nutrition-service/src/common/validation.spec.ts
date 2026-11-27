import { describe, expect, it } from 'vitest';
import { cleanText, localDate, optionalText } from './validation';

describe('cleanText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanText({ max: 50 }).parse('  Овсянка   с\tбананом ')).toBe(
      'Овсянка с бананом',
    );
  });

  it('enforces the minimum and the maximum length after trimming', () => {
    expect(cleanText({ min: 1, max: 5 }).safeParse('   ').success).toBe(false);
    expect(cleanText({ max: 3 }).safeParse('abcd').success).toBe(false);
  });

  it('rejects control characters', () => {
    expect(cleanText({ max: 50 }).safeParse('a\u0000b').success).toBe(false);
  });
});

describe('optionalText', () => {
  it('defaults to null and turns an empty string into null', () => {
    const schema = optionalText(200);
    expect(schema.parse(undefined)).toBeNull();
    expect(schema.parse('   ')).toBeNull();
    expect(schema.parse(' после праздников ')).toBe('после праздников');
  });
});

describe('localDate', () => {
  it('accepts only real calendar dates', () => {
    expect(localDate.safeParse('2026-11-27').success).toBe(true);
    expect(localDate.safeParse('2026-02-30').success).toBe(false);
    expect(localDate.safeParse('27.11.2026').success).toBe(false);
  });
});
