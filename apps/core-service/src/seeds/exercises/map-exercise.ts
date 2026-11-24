import { z } from 'zod';
import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_FORCES,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  EXERCISE_TYPES,
  MUSCLES,
  PRIMARY_MUSCLES,
  type Equipment,
  type ExerciseCategory,
  type ExerciseType,
  type Muscle,
  type PrimaryMuscle,
} from '../../db/schema';
import type {
  ExerciseOverride,
  FreeExerciseDbRecord,
} from './free-exercise-db.schema';
import { uuidV5 } from './uuid-v5';

export const FREE_EXERCISE_DB_SOURCE = 'free-exercise-db';

export const EXERCISE_ID_NAMESPACE = 'c45eddcf-8c3d-4b4e-a9ac-ac6dee923a4d';

export const seedExerciseSchema = z
  .object({
    id: z.uuid(),
    source: z.literal(FREE_EXERCISE_DB_SOURCE),
    sourceId: z.string().min(1),
    type: z.enum(EXERCISE_TYPES),
    primaryMuscles: z.array(z.enum(PRIMARY_MUSCLES)).min(1),
    secondaryMuscles: z.array(z.enum(MUSCLES)),
    equipment: z.enum(EQUIPMENT),
    category: z.enum(EXERCISE_CATEGORIES),
    force: z.enum(EXERCISE_FORCES).nullable(),
    mechanic: z.enum(EXERCISE_MECHANICS).nullable(),
    level: z.enum(EXERCISE_LEVELS),
    imageKeys: z.array(z.string().regex(/^exercises\/[0-9a-z_-]+\/\d+\.webp$/)),
    name: z.string().min(1),
    instructions: z.array(z.string().min(1)),
  })
  .refine(
    (exercise) =>
      !exercise.secondaryMuscles.some((muscle) =>
        (exercise.primaryMuscles as readonly string[]).includes(muscle),
      ),
    { message: 'primary and secondary muscles overlap' },
  );

export type SeedExercise = z.infer<typeof seedExerciseSchema>;

const EQUIPMENT_MAP: Record<
  NonNullable<FreeExerciseDbRecord['equipment']>,
  Equipment
> = {
  'body only': 'none',
  barbell: 'barbell',
  'e-z curl bar': 'ez_bar',
  dumbbell: 'dumbbell',
  kettlebells: 'kettlebell',
  machine: 'machine',
  cable: 'cable',
  bands: 'band',
  'medicine ball': 'medicine_ball',
  'exercise ball': 'exercise_ball',
  'foam roll': 'foam_roll',
  other: 'other',
};

export function exerciseId(sourceId: string): string {
  return uuidV5(
    `${FREE_EXERCISE_DB_SOURCE}:${sourceId}`,
    EXERCISE_ID_NAMESPACE,
  );
}

export function mapMuscle(
  muscle: FreeExerciseDbRecord['primaryMuscles'][number],
): Muscle {
  if (muscle === 'middle back') {
    return 'upper_back';
  }
  return muscle.replaceAll(' ', '_') as Muscle;
}

export function mapEquipment(
  equipment: FreeExerciseDbRecord['equipment'],
): Equipment {
  return equipment === null ? 'none' : EQUIPMENT_MAP[equipment];
}

export function mapCategory(
  category: FreeExerciseDbRecord['category'],
): ExerciseCategory {
  return category.replaceAll(' ', '_') as ExerciseCategory;
}

export function mapMuscles(record: FreeExerciseDbRecord): {
  primaryMuscles: PrimaryMuscle[];
  secondaryMuscles: Muscle[];
} {
  const primary = unique(record.primaryMuscles.map(mapMuscle));
  const secondary = unique(record.secondaryMuscles.map(mapMuscle));
  if (record.category === 'cardio') {
    return {
      primaryMuscles: ['cardio'],
      secondaryMuscles: unique([...primary, ...secondary]),
    };
  }
  return {
    primaryMuscles: primary,
    secondaryMuscles: secondary.filter((muscle) => !primary.includes(muscle)),
  };
}

export function inferType(
  record: FreeExerciseDbRecord,
  equipment: Equipment,
): ExerciseType {
  if (record.category === 'cardio') {
    return 'distance_duration';
  }
  if (record.category === 'stretching' || record.force === 'static') {
    return 'duration';
  }
  if (equipment === 'none') {
    return 'bodyweight_reps';
  }
  return 'weight_reps';
}

export function mapExercise(
  record: FreeExerciseDbRecord,
  override: ExerciseOverride = {},
): SeedExercise {
  const equipment = override.equipment ?? mapEquipment(record.equipment);
  const muscles = mapMuscles(record);
  return {
    id: exerciseId(record.id),
    source: FREE_EXERCISE_DB_SOURCE,
    sourceId: record.id,
    type: override.type ?? inferType(record, equipment),
    primaryMuscles: override.primaryMuscles ?? muscles.primaryMuscles,
    secondaryMuscles: override.secondaryMuscles ?? muscles.secondaryMuscles,
    equipment,
    category: mapCategory(record.category),
    force: record.force,
    mechanic: record.mechanic,
    level: record.level,
    imageKeys: record.images.map(
      (image) => `exercises/${image.toLowerCase().replace(/\.jpg$/, '.webp')}`,
    ),
    name: record.name.trim(),
    instructions: record.instructions
      .map((step) => step.trim())
      .filter((step) => step.length > 0),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
