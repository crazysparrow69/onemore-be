import { describe, expect, it } from 'vitest';
import { loadSeed } from '../exercises/load-seed';
import type { SeedExercise } from '../exercises/map-exercise';
import { buildTranslations } from './load-translations';

describe('buildTranslations', () => {
  const seed = loadSeed().slice(0, 3);
  const [first, second, third] = seed as [
    SeedExercise,
    SeedExercise,
    SeedExercise,
  ];

  function ukFor(
    patch: (id: string, index: number) => Record<string, unknown> = () => ({}),
  ): Record<string, unknown> {
    return Object.fromEntries(
      seed.map((exercise, index) => [
        exercise.sourceId,
        {
          name: `Назва ${index}`,
          instructions: exercise.instructions.map((_, step) => `Крок ${step}`),
          aliases: ['синонім'],
          ...patch(exercise.sourceId, index),
        },
      ]),
    );
  }

  it('builds a row per exercise for a full locale', () => {
    const rows = buildTranslations({ uk: ukFor() }, seed);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      exerciseId: first.id,
      locale: 'uk',
      name: 'Назва 0',
      aliases: ['синонім'],
    });
  });

  it('accepts aliases only for the base locale and does not require every exercise', () => {
    const rows = buildTranslations(
      { en: { [second.sourceId]: { aliases: ['bench'] } } },
      seed,
    );

    expect(rows).toEqual([
      {
        exerciseId: second.id,
        locale: 'en',
        name: null,
        instructions: null,
        aliases: ['bench'],
      },
    ]);
  });

  it('fails when a locale file is for an unknown locale', () => {
    expect(() => buildTranslations({ xx: ukFor() }, seed)).toThrow(
      /unknown locales: xx/,
    );
  });

  it('fails when no files are given', () => {
    expect(() => buildTranslations({}, seed)).toThrow(/No translation files/);
  });

  it('fails on a key that is not an exercise', () => {
    expect(() =>
      buildTranslations(
        { uk: { ...ukFor(), Nope: { name: 'x', instructions: [] } } },
        seed,
      ),
    ).toThrow(/unknown exercise Nope/);
  });

  it('fails when an exercise is not translated', () => {
    const files = Object.fromEntries(
      Object.entries(ukFor()).filter(([id]) => id !== third.sourceId),
    );

    expect(() => buildTranslations({ uk: files }, seed)).toThrow(
      /1 exercises have no translation/,
    );
  });

  it('fails when the number of instruction steps differs from English', () => {
    expect(() =>
      buildTranslations(
        { uk: ukFor((_, index) => (index === 0 ? { instructions: [] } : {})) },
        seed,
      ),
    ).toThrow(/expected \d+ instruction steps, got 0/);
  });

  it('fails on duplicate aliases and on an alias equal to the name', () => {
    expect(() =>
      buildTranslations(
        { uk: ukFor(() => ({ aliases: ['Бенч', 'бенч'] })) },
        seed,
      ),
    ).toThrow(/duplicate aliases/);
    expect(() =>
      buildTranslations(
        { uk: ukFor(() => ({ name: 'Жим', aliases: ['жим'] })) },
        seed,
      ),
    ).toThrow(/alias repeats the name/);
  });

  it('fails on an empty name and on unexpected fields', () => {
    expect(() =>
      buildTranslations({ uk: ukFor(() => ({ name: '' })) }, seed),
    ).toThrow(/Invalid translations/);
    expect(() =>
      buildTranslations({ uk: ukFor(() => ({ extra: 1 })) }, seed),
    ).toThrow(/Invalid translations/);
  });
});
