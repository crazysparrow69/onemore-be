import { LOCALES, type Locale } from '../../db/schema/locales';
import type { ExerciseType } from '../../db/schema/exercises';
import type { SetKind } from '../../db/schema/workouts';
import type { WorkoutTotals } from './workout.response';

export const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function periodViolation(
  startedAt: Date,
  endedAt: Date,
  now: Date,
): string | null {
  if (endedAt.getTime() < startedAt.getTime()) {
    return 'endedAt must not be earlier than startedAt';
  }
  if (endedAt.getTime() - startedAt.getTime() > MAX_DURATION_MS) {
    return 'A workout cannot last longer than 24 hours';
  }
  if (endedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return 'A workout cannot end in the future';
  }
  return null;
}

export function localDateOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function localHourOf(instant: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(instant)
    .find((item) => item.type === 'hour')?.value;
  return Number(hour ?? 0);
}

type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

const DEFAULT_NAMES: Readonly<
  Record<Locale, Readonly<Record<DayPart, string>>>
> = {
  en: {
    morning: 'Morning workout',
    afternoon: 'Afternoon workout',
    evening: 'Evening workout',
    night: 'Night workout',
  },
  uk: {
    morning: 'Ранкове тренування',
    afternoon: 'Денне тренування',
    evening: 'Вечірнє тренування',
    night: 'Нічне тренування',
  },
};

function dayPartOf(hour: number): DayPart {
  if (hour >= 5 && hour < 12) {
    return 'morning';
  }
  if (hour >= 12 && hour < 17) {
    return 'afternoon';
  }
  if (hour >= 17 && hour < 22) {
    return 'evening';
  }
  return 'night';
}

export function defaultNameOf(
  locale: Locale,
  startedAt: Date,
  timeZone: string,
): string {
  const known = LOCALES.includes(locale) ? locale : 'en';
  return DEFAULT_NAMES[known][dayPartOf(localHourOf(startedAt, timeZone))];
}

export type TotalsSet = {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
};

export type TotalsExercise = { type: ExerciseType; sets: readonly TotalsSet[] };

export function totalsOf(
  startedAt: Date,
  endedAt: Date,
  exercises: readonly TotalsExercise[],
): WorkoutTotals {
  let volume = 0;
  let setCount = 0;
  for (const exercise of exercises) {
    setCount += exercise.sets.length;
    if (exercise.type !== 'weight_reps') {
      continue;
    }
    for (const set of exercise.sets) {
      if (set.kind !== 'warmup') {
        volume += (set.weightKg ?? 0) * (set.reps ?? 0);
      }
    }
  }
  return {
    durationS: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    volumeKg: Math.round(volume * 1000) / 1000,
    setCount,
    exerciseCount: exercises.length,
  };
}
