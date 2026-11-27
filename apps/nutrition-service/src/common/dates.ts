export const MIN_DATE = '2000-01-01';

const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function utcDateOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  return utcDateOf(new Date(toUtcMs(date) + days * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function isPlausibleToday(date: string, now: Date): boolean {
  return Math.abs(daysBetween(utcDateOf(now), date)) <= 1;
}

export function isRecordableDate(date: string, now: Date): boolean {
  return date >= MIN_DATE && daysBetween(utcDateOf(now), date) <= 1;
}

export function ageOn(birthDate: string, onDate: string): number {
  const [birthYear = 0, birthMonth = 0, birthDay = 0] = birthDate
    .split('-')
    .map(Number);
  const [year = 0, month = 0, day = 0] = onDate.split('-').map(Number);
  const birthdayPassed =
    month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (birthdayPassed ? 0 : 1);
}

export function notBefore(date: string, floor: string | null): string {
  return floor !== null && floor > date ? floor : date;
}
