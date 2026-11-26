import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  cleanText,
  commaList,
  emptyToNull,
  ianaTimeZone,
  idParams,
  optionalNotes,
  paginationShape,
} from './validation';

describe('cleanText', () => {
  const schema = cleanText({ min: 1, max: 10 });

  it('trims and collapses whitespace', () => {
    expect(schema.parse('  a   b\n c ')).toBe('a b c');
  });

  it('rejects empty, too long and control characters', () => {
    expect(schema.safeParse('   ').success).toBe(false);
    expect(schema.safeParse('x'.repeat(11)).success).toBe(false);
    expect(schema.safeParse('a\u0000b').success).toBe(false);
  });
});

describe('emptyToNull / optionalNotes', () => {
  it('maps empty strings to null', () => {
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull('x')).toBe('x');
    expect(optionalNotes.parse('  ')).toBeNull();
    expect(optionalNotes.parse(undefined)).toBeNull();
    expect(optionalNotes.parse(' hi ')).toBe('hi');
  });
});

describe('ianaTimeZone', () => {
  it('accepts real zones only', () => {
    expect(ianaTimeZone.safeParse('Europe/Kyiv').success).toBe(true);
    expect(ianaTimeZone.safeParse('Mars/Olympus').success).toBe(false);
  });
});

describe('idParams', () => {
  it('requires a uuid and keeps the schema name', () => {
    const schema = idParams('Thing');

    expect(schema.safeParse({ id: 'nope' }).success).toBe(false);
    expect(z.toJSONSchema(schema, { io: 'input' })).toBeDefined();
    expect(schema.meta()).toEqual({ id: 'Thing' });
  });
});

describe('paginationShape', () => {
  const schema = z.object(paginationShape({ defaultLimit: 20, maxLimit: 50 }));

  it('applies defaults and coerces query strings', () => {
    expect(schema.parse({})).toEqual({ offset: 0, limit: 20 });
    expect(schema.parse({ offset: '5', limit: '10' })).toEqual({
      offset: 5,
      limit: 10,
    });
  });

  it('enforces bounds', () => {
    expect(schema.safeParse({ limit: '51' }).success).toBe(false);
    expect(schema.safeParse({ limit: '0' }).success).toBe(false);
    expect(schema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('commaList', () => {
  const schema = commaList(z.enum(['a', 'b', 'c']), { min: 1, max: 2 });

  it('splits, dedupes and validates items', () => {
    expect(schema.parse('a,b,a')).toEqual(['a', 'b']);
    expect(schema.safeParse('z').success).toBe(false);
  });

  it('enforces size limits', () => {
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('a,b,c').success).toBe(false);
  });
});
