import { describe, expect, it } from 'vitest';
import { requirePlausibleToday, requireRecordableDate } from './date-guards';

const NOW = new Date('2026-11-27T12:00:00Z');

function codeOf(action: () => void): string | undefined {
  try {
    action();
  } catch (error) {
    const body = (
      error as { getResponse?: () => { code?: string } }
    ).getResponse?.();
    return body?.code;
  }
  return undefined;
}

describe('requirePlausibleToday', () => {
  it('passes for the server date and one day either side', () => {
    expect(
      codeOf(() => {
        requirePlausibleToday('2026-11-26', NOW);
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        requirePlausibleToday('2026-11-28', NOW);
      }),
    ).toBeUndefined();
  });

  it('throws DATE_OUT_OF_RANGE for a date further away', () => {
    expect(
      codeOf(() => {
        requirePlausibleToday('2026-11-20', NOW);
      }),
    ).toBe('DATE_OUT_OF_RANGE');
  });
});

describe('requireRecordableDate', () => {
  it('passes for the past and tomorrow', () => {
    expect(
      codeOf(() => {
        requireRecordableDate('2026-01-01', NOW);
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        requireRecordableDate('2026-11-28', NOW);
      }),
    ).toBeUndefined();
  });

  it('throws for the far future and for dates before 2000', () => {
    expect(
      codeOf(() => {
        requireRecordableDate('2026-12-01', NOW);
      }),
    ).toBe('DATE_OUT_OF_RANGE');
    expect(
      codeOf(() => {
        requireRecordableDate('1990-01-01', NOW);
      }),
    ).toBe('DATE_OUT_OF_RANGE');
  });
});
