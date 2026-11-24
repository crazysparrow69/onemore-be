import { describe, expect, it } from 'vitest';
import type { FreeExerciseDbRecord } from './free-exercise-db.schema';
import {
  exerciseId,
  mapEquipment,
  mapExercise,
  seedExerciseSchema,
} from './map-exercise';

function record(
  overrides: Partial<FreeExerciseDbRecord> = {},
): FreeExerciseDbRecord {
  return {
    id: 'Barbell_Curl',
    name: 'Barbell Curl',
    force: 'pull',
    level: 'beginner',
    mechanic: 'isolation',
    equipment: 'barbell',
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['forearms'],
    instructions: ['Stand up.', 'Curl the bar.'],
    category: 'strength',
    images: ['Barbell_Curl/0.jpg', 'Barbell_Curl/1.jpg'],
    ...overrides,
  };
}

describe('mapExercise', () => {
  it('maps a regular strength exercise', () => {
    expect(mapExercise(record())).toEqual({
      id: exerciseId('Barbell_Curl'),
      source: 'free-exercise-db',
      sourceId: 'Barbell_Curl',
      type: 'weight_reps',
      primaryMuscles: ['biceps'],
      secondaryMuscles: ['forearms'],
      equipment: 'barbell',
      category: 'strength',
      force: 'pull',
      mechanic: 'isolation',
      level: 'beginner',
      imageKeys: [
        'exercises/barbell_curl/0.webp',
        'exercises/barbell_curl/1.webp',
      ],
      name: 'Barbell Curl',
      instructions: ['Stand up.', 'Curl the bar.'],
    });
  });

  it('renames muscles: middle back becomes upper_back, spaces become underscores', () => {
    const mapped = mapExercise(
      record({
        primaryMuscles: ['middle back'],
        secondaryMuscles: ['lower back', 'lats'],
      }),
    );
    expect(mapped.primaryMuscles).toEqual(['upper_back']);
    expect(mapped.secondaryMuscles).toEqual(['lower_back', 'lats']);
  });

  it('drops secondary muscles that are already primary', () => {
    const mapped = mapExercise(
      record({
        primaryMuscles: ['quadriceps'],
        secondaryMuscles: ['quadriceps', 'glutes', 'glutes'],
      }),
    );
    expect(mapped.primaryMuscles).toEqual(['quadriceps']);
    expect(mapped.secondaryMuscles).toEqual(['glutes']);
  });

  it('moves muscles of cardio exercises to secondary under the cardio group', () => {
    const mapped = mapExercise(
      record({
        category: 'cardio',
        equipment: 'machine',
        primaryMuscles: ['quadriceps'],
        secondaryMuscles: ['calves', 'quadriceps'],
      }),
    );
    expect(mapped.primaryMuscles).toEqual(['cardio']);
    expect(mapped.secondaryMuscles).toEqual(['quadriceps', 'calves']);
    expect(mapped.type).toBe('distance_duration');
  });

  it.each([
    [{ category: 'stretching' as const, force: 'pull' as const }, 'duration'],
    [{ force: 'static' as const }, 'duration'],
    [{ equipment: 'body only' as const }, 'bodyweight_reps'],
    [{ equipment: null }, 'bodyweight_reps'],
    [{ equipment: 'other' as const }, 'weight_reps'],
  ])('infers the type from %o', (fields, type) => {
    expect(mapExercise(record(fields)).type).toBe(type);
  });

  it('lets an override win over the inferred values', () => {
    const mapped = mapExercise(record({ category: 'cardio' }), {
      type: 'weight_distance',
      equipment: 'other',
      primaryMuscles: ['full_body'],
      secondaryMuscles: ['traps'],
    });
    expect(mapped).toMatchObject({
      type: 'weight_distance',
      equipment: 'other',
      primaryMuscles: ['full_body'],
      secondaryMuscles: ['traps'],
    });
  });

  it('maps every equipment value of the source', () => {
    expect(mapEquipment('body only')).toBe('none');
    expect(mapEquipment(null)).toBe('none');
    expect(mapEquipment('kettlebells')).toBe('kettlebell');
    expect(mapEquipment('bands')).toBe('band');
    expect(mapEquipment('e-z curl bar')).toBe('ez_bar');
    expect(mapEquipment('medicine ball')).toBe('medicine_ball');
    expect(mapEquipment('exercise ball')).toBe('exercise_ball');
    expect(mapEquipment('foam roll')).toBe('foam_roll');
  });

  it('keeps exercises without photos or instructions', () => {
    const mapped = mapExercise(record({ images: [], instructions: [' '] }));
    expect(mapped.imageKeys).toEqual([]);
    expect(mapped.instructions).toEqual([]);
  });

  it('turns olympic weightlifting into a slug', () => {
    expect(
      mapExercise(record({ category: 'olympic weightlifting' })).category,
    ).toBe('olympic_weightlifting');
  });

  it('gives the same id to the same source id', () => {
    expect(exerciseId('Barbell_Curl')).toBe(exerciseId('Barbell_Curl'));
    expect(exerciseId('Barbell_Curl')).not.toBe(exerciseId('Barbell_Squat'));
  });

  it('rejects an override that makes primary and secondary overlap', () => {
    const mapped = mapExercise(record(), { secondaryMuscles: ['biceps'] });
    expect(seedExerciseSchema.safeParse(mapped).success).toBe(false);
  });
});
