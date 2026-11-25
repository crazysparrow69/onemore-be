import type {
  Equipment,
  ExerciseCategory,
  ExerciseForce,
  ExerciseLevel,
  ExerciseMechanic,
  ExerciseType,
  PrimaryMuscle,
} from '../../../db/schema/exercises';

export const MUSCLE_GROUPS = [
  {
    id: 'upper_body',
    muscles: [
      'biceps',
      'abdominals',
      'upper_back',
      'chest',
      'lower_back',
      'shoulders',
      'forearms',
      'traps',
      'triceps',
      'neck',
      'lats',
    ],
  },
  {
    id: 'lower_body',
    muscles: [
      'calves',
      'quadriceps',
      'abductors',
      'hamstrings',
      'adductors',
      'glutes',
    ],
  },
  { id: 'other', muscles: ['full_body', 'cardio', 'other'] },
] as const satisfies readonly {
  id: string;
  muscles: readonly PrimaryMuscle[];
}[];

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]['id'];

export type Dictionary = {
  muscles: Record<PrimaryMuscle, string>;
  muscleAliases: Record<PrimaryMuscle, readonly string[]>;
  muscleGroups: Record<MuscleGroup, string>;
  equipment: Record<Equipment, string>;
  equipmentAliases: Record<Equipment, readonly string[]>;
  types: Record<ExerciseType, string>;
  categories: Record<ExerciseCategory, string>;
  levels: Record<ExerciseLevel, string>;
  forces: Record<ExerciseForce, string>;
  mechanics: Record<ExerciseMechanic, string>;
};
