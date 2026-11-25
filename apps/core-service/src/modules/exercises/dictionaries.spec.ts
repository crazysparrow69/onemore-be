import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_FORCES,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  EXERCISE_TYPES,
  PRIMARY_MUSCLES,
} from '../../db/schema/exercises';
import { LOCALES } from '../../db/schema/locales';
import { DICTIONARIES, MUSCLE_GROUPS } from './dictionaries';
import { buildDictionaries } from './exercise-dictionaries.response';

const LABELLED = [
  ['muscles', PRIMARY_MUSCLES],
  ['equipment', EQUIPMENT],
  ['types', EXERCISE_TYPES],
  ['typeExamples', EXERCISE_TYPES],
  ['categories', EXERCISE_CATEGORIES],
  ['levels', EXERCISE_LEVELS],
  ['forces', EXERCISE_FORCES],
  ['mechanics', EXERCISE_MECHANICS],
] as const;

const ALIASED = [
  ['muscleAliases', PRIMARY_MUSCLES],
  ['equipmentAliases', EQUIPMENT],
] as const;

describe.each(LOCALES)('dictionary (%s)', (locale) => {
  const dictionary = DICTIONARIES[locale];

  it.each(LABELLED)('labels every %s slug and nothing else', (key, slugs) => {
    expect(Object.keys(dictionary[key]).sort()).toEqual([...slugs].sort());
    for (const label of Object.values(dictionary[key])) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(ALIASED)('has aliases for every %s slug', (key, slugs) => {
    expect(Object.keys(dictionary[key]).sort()).toEqual([...slugs].sort());
    for (const aliases of Object.values(dictionary[key])) {
      expect(aliases.length).toBeGreaterThan(0);
    }
  });

  it('labels every muscle group', () => {
    expect(Object.keys(dictionary.muscleGroups).sort()).toEqual(
      MUSCLE_GROUPS.map((group) => group.id).sort(),
    );
  });
});

describe('muscle groups', () => {
  it('place every primary muscle in exactly one group', () => {
    const placed = MUSCLE_GROUPS.flatMap((group) => [...group.muscles]);

    expect([...placed].sort()).toEqual([...PRIMARY_MUSCLES].sort());
  });
});

describe('buildDictionaries', () => {
  it('labels groups and options in the requested language', () => {
    const uk = buildDictionaries('uk');

    expect(uk.locale).toBe('uk');
    expect(uk.muscleGroups[0]).toMatchObject({
      id: 'upper_body',
      label: 'Верх тіла',
    });
    expect(uk.muscleGroups[0]?.muscles).toContainEqual({
      id: 'chest',
      label: 'Груди',
      primaryOnly: false,
    });
    expect(uk.equipment).toContainEqual({ id: 'dumbbell', label: 'Гантелі' });
    expect(buildDictionaries('en').equipment).toContainEqual({
      id: 'dumbbell',
      label: 'Dumbbell',
    });
  });

  it('marks the pseudo groups as primary-only and gives every type an example', () => {
    const en = buildDictionaries('en');
    const muscles = en.muscleGroups.flatMap((group) => group.muscles);

    expect(
      muscles.filter((muscle) => muscle.primaryOnly).map((muscle) => muscle.id),
    ).toEqual(['full_body', 'cardio', 'other']);
    for (const type of en.types) {
      expect(type.example.length).toBeGreaterThan(0);
    }
  });

  it('lists every option the filters and the card need', () => {
    const en = buildDictionaries('en');

    expect(en.equipment.map((item) => item.id)).toEqual([...EQUIPMENT]);
    expect(en.types).toHaveLength(EXERCISE_TYPES.length);
    expect(en.categories).toHaveLength(EXERCISE_CATEGORIES.length);
    expect(en.levels).toHaveLength(EXERCISE_LEVELS.length);
    expect(en.forces).toHaveLength(EXERCISE_FORCES.length);
    expect(en.mechanics).toHaveLength(EXERCISE_MECHANICS.length);
  });
});
