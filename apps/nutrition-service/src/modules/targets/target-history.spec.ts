import { describe, expect, it } from 'vitest';
import { snapshotOn } from './target-history';

const history = [
  { effectiveFrom: '2026-11-01', caloriesKcal: 2400 },
  { effectiveFrom: '2026-11-10', caloriesKcal: 2200 },
  { effectiveFrom: '2026-11-20', caloriesKcal: 2100 },
];

describe('snapshotOn', () => {
  it('returns the latest snapshot that started on or before the day', () => {
    expect(snapshotOn(history, '2026-11-10')?.caloriesKcal).toBe(2200);
    expect(snapshotOn(history, '2026-11-19')?.caloriesKcal).toBe(2200);
    expect(snapshotOn(history, '2026-12-31')?.caloriesKcal).toBe(2100);
  });

  it('returns null before the first snapshot and for an empty history', () => {
    expect(snapshotOn(history, '2026-10-31')).toBeNull();
    expect(snapshotOn([], '2026-11-10')).toBeNull();
  });
});
