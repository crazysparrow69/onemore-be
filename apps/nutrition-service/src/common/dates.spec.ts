import { describe, expect, it } from 'vitest';
import {
  ageOn,
  daysBetween,
  isPlausibleToday,
  isRecordableDate,
  notBefore,
  shiftDate,
  utcDateOf,
} from './dates';

const NOW = new Date('2026-11-27T23:30:00Z');

describe('dates', () => {
  it('takes the UTC calendar date of an instant', () => {
    expect(utcDateOf(NOW)).toBe('2026-11-27');
  });

  it('shifts across month and year borders and leap days', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2027-03-01', -1)).toBe('2027-02-28');
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('counts the days between two dates', () => {
    expect(daysBetween('2026-11-20', '2026-11-27')).toBe(7);
    expect(daysBetween('2026-11-27', '2026-11-20')).toBe(-7);
    expect(daysBetween('2026-11-27', '2026-11-27')).toBe(0);
  });

  it('accepts today of any time zone: one day either side of UTC', () => {
    expect(isPlausibleToday('2026-11-26', NOW)).toBe(true);
    expect(isPlausibleToday('2026-11-27', NOW)).toBe(true);
    expect(isPlausibleToday('2026-11-28', NOW)).toBe(true);
    expect(isPlausibleToday('2026-11-25', NOW)).toBe(false);
    expect(isPlausibleToday('2026-11-29', NOW)).toBe(false);
  });

  it('records the past back to 2000 but not more than a day ahead', () => {
    expect(isRecordableDate('2026-11-28', NOW)).toBe(true);
    expect(isRecordableDate('2026-11-29', NOW)).toBe(false);
    expect(isRecordableDate('2000-01-01', NOW)).toBe(true);
    expect(isRecordableDate('1999-12-31', NOW)).toBe(false);
  });

  it('counts full years of age', () => {
    expect(ageOn('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageOn('1990-06-15', '2026-06-15')).toBe(36);
    expect(ageOn('1990-06-15', '2026-12-31')).toBe(36);
    expect(ageOn('2000-02-29', '2027-02-28')).toBe(26);
    expect(ageOn('2000-02-29', '2027-03-01')).toBe(27);
  });

  it('keeps a date from going before a floor', () => {
    expect(notBefore('2026-11-20', '2026-11-25')).toBe('2026-11-25');
    expect(notBefore('2026-11-27', '2026-11-25')).toBe('2026-11-27');
    expect(notBefore('2026-11-27', null)).toBe('2026-11-27');
  });
});
