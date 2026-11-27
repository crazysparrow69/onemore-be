import { appError } from './errors';
import { isPlausibleToday, isRecordableDate } from './dates';

export function requirePlausibleToday(
  date: string,
  now: Date = new Date(),
): void {
  if (!isPlausibleToday(date, now)) {
    throw appError('DATE_OUT_OF_RANGE', {
      message: 'today must be within a day of the server date',
    });
  }
}

export function requireRecordableDate(
  date: string,
  now: Date = new Date(),
): void {
  if (!isRecordableDate(date, now)) {
    throw appError('DATE_OUT_OF_RANGE', {
      message: 'The date must not be before 2000 or more than a day ahead',
    });
  }
}
