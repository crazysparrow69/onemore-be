import { describe, expect, it } from 'vitest';
import {
  defaultNameOf,
  localDateOf,
  periodViolation,
  totalsOf,
} from './workout-rules';

const now = new Date('2026-11-26T12:00:00Z');

describe('periodViolation', () => {
  it('accepts a normal workout', () => {
    expect(
      periodViolation(
        new Date('2026-11-26T10:00:00Z'),
        new Date('2026-11-26T11:00:00Z'),
        now,
      ),
    ).toBeNull();
  });

  it('accepts an instant workout', () => {
    const at = new Date('2026-11-26T10:00:00Z');
    expect(periodViolation(at, at, now)).toBeNull();
  });

  it('rejects an end before the start', () => {
    expect(
      periodViolation(
        new Date('2026-11-26T11:00:00Z'),
        new Date('2026-11-26T10:00:00Z'),
        now,
      ),
    ).toMatch(/earlier/);
  });

  it('rejects more than 24 hours and accepts exactly 24', () => {
    const start = new Date('2026-11-25T08:00:00Z');
    expect(
      periodViolation(start, new Date('2026-11-26T08:00:00Z'), now),
    ).toBeNull();
    expect(
      periodViolation(start, new Date('2026-11-26T08:00:01Z'), now),
    ).toMatch(/24 hours/);
  });

  it('allows 5 minutes of clock skew and nothing more', () => {
    const start = new Date('2026-11-26T11:00:00Z');
    expect(
      periodViolation(start, new Date('2026-11-26T12:05:00Z'), now),
    ).toBeNull();
    expect(
      periodViolation(start, new Date('2026-11-26T12:05:01Z'), now),
    ).toMatch(/future/);
  });
});

describe('localDateOf', () => {
  it('uses the time zone of the workout, not UTC', () => {
    const at = new Date('2026-11-25T23:30:00Z');
    expect(localDateOf(at, 'UTC')).toBe('2026-11-25');
    expect(localDateOf(at, 'Europe/Kyiv')).toBe('2026-11-26');
    expect(localDateOf(at, 'America/Los_Angeles')).toBe('2026-11-25');
  });
});

describe('defaultNameOf', () => {
  it.each([
    ['2026-11-26T04:59:00Z', 'Night workout'],
    ['2026-11-26T05:00:00Z', 'Morning workout'],
    ['2026-11-26T11:59:00Z', 'Morning workout'],
    ['2026-11-26T12:00:00Z', 'Afternoon workout'],
    ['2026-11-26T16:59:00Z', 'Afternoon workout'],
    ['2026-11-26T17:00:00Z', 'Evening workout'],
    ['2026-11-26T21:59:00Z', 'Evening workout'],
    ['2026-11-26T22:00:00Z', 'Night workout'],
  ])('names a workout started at %s in UTC', (iso, expected) => {
    expect(defaultNameOf('en', new Date(iso), 'UTC')).toBe(expected);
  });

  it('uses the local hour and the profile language', () => {
    expect(
      defaultNameOf('uk', new Date('2026-11-26T05:30:00Z'), 'Europe/Kyiv'),
    ).toBe('Ранкове тренування');
    expect(
      defaultNameOf('uk', new Date('2026-11-26T20:30:00Z'), 'Europe/Kyiv'),
    ).toBe('Нічне тренування');
  });
});

describe('totalsOf', () => {
  const started = new Date('2026-11-26T10:00:00Z');
  const ended = new Date('2026-11-26T11:02:03Z');

  it('sums weight times reps of weight_reps sets without warmups', () => {
    const totals = totalsOf(started, ended, [
      {
        type: 'weight_reps',
        sets: [
          { kind: 'warmup', weightKg: 40, reps: 12 },
          { kind: 'working', weightKg: 80, reps: 8 },
          { kind: 'drop', weightKg: 62.5, reps: 10 },
          { kind: 'failure', weightKg: 60, reps: 0 },
        ],
      },
      {
        type: 'bodyweight_reps',
        sets: [{ kind: 'working', weightKg: 10, reps: 10 }],
      },
      {
        type: 'duration',
        sets: [{ kind: 'working', weightKg: null, reps: null }],
      },
    ]);

    expect(totals).toEqual({
      durationS: 3723,
      volumeKg: 1265,
      setCount: 6,
      exerciseCount: 3,
    });
  });

  it('is zero for an empty list', () => {
    expect(totalsOf(started, started, [])).toEqual({
      durationS: 0,
      volumeKg: 0,
      setCount: 0,
      exerciseCount: 0,
    });
  });

  it('does not accumulate floating point noise', () => {
    const totals = totalsOf(started, ended, [
      {
        type: 'weight_reps',
        sets: Array.from({ length: 10 }, () => ({
          kind: 'working' as const,
          weightKg: 0.1,
          reps: 3,
        })),
      },
    ]);
    expect(totals.volumeKg).toBe(3);
  });
});
