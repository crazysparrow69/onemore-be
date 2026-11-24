import { z } from 'zod';
import {
  EXERCISE_TYPES,
  EQUIPMENT,
  MUSCLES,
  PRIMARY_MUSCLES,
} from '../../db/schema';

export const FREE_EXERCISE_DB_MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export const FREE_EXERCISE_DB_EQUIPMENT = [
  'medicine ball',
  'dumbbell',
  'body only',
  'bands',
  'kettlebells',
  'foam roll',
  'cable',
  'machine',
  'barbell',
  'exercise ball',
  'e-z curl bar',
  'other',
] as const;

const muscle = z.enum(FREE_EXERCISE_DB_MUSCLES);

export const freeExerciseDbRecordSchema = z.object({
  id: z.string().regex(/^[0-9a-zA-Z_-]+$/),
  name: z.string().min(1),
  force: z.enum(['push', 'pull', 'static']).nullable(),
  level: z.enum(['beginner', 'intermediate', 'expert']),
  mechanic: z.enum(['compound', 'isolation']).nullable(),
  equipment: z.enum(FREE_EXERCISE_DB_EQUIPMENT).nullable(),
  primaryMuscles: z.array(muscle).min(1),
  secondaryMuscles: z.array(muscle),
  instructions: z.array(z.string()),
  category: z.enum([
    'powerlifting',
    'strength',
    'stretching',
    'cardio',
    'olympic weightlifting',
    'strongman',
    'plyometrics',
  ]),
  images: z.array(z.string()),
});

export type FreeExerciseDbRecord = z.infer<typeof freeExerciseDbRecordSchema>;

export const freeExerciseDbSnapshotSchema = z.array(freeExerciseDbRecordSchema);

export const exerciseOverrideSchema = z.strictObject({
  type: z.enum(EXERCISE_TYPES).optional(),
  equipment: z.enum(EQUIPMENT).optional(),
  primaryMuscles: z.array(z.enum(PRIMARY_MUSCLES)).min(1).optional(),
  secondaryMuscles: z.array(z.enum(MUSCLES)).optional(),
  skip: z.boolean().optional(),
});

export type ExerciseOverride = z.infer<typeof exerciseOverrideSchema>;

export const exerciseOverridesSchema = z.record(
  z.string(),
  exerciseOverrideSchema,
);

export type ExerciseOverrides = z.infer<typeof exerciseOverridesSchema>;
