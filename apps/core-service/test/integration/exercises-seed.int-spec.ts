import { join } from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrator';
import { runExerciseSeed } from '../../src/seeds/exercises/import-exercises';
import { loadSeed } from '../../src/seeds/exercises/load-seed';
import { runTranslationSeed } from '../../src/seeds/translations/import-translations';
import { buildTranslations } from '../../src/seeds/translations/load-translations';
import type { SeedExercise } from '../../src/seeds/exercises/map-exercise';

const repoRoot = join(process.cwd(), '..', '..');

describe('exercise seed (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let coreUrl: string;
  let core: Pool;
  const seed = loadSeed();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withUsername('onemore')
      .withPassword('onemore')
      .withDatabase('onemore')
      .withCopyFilesToContainer([
        {
          source: join(repoRoot, 'infra/db/core.sql'),
          target: '/infra/db/core.sql',
        },
        {
          source: join(repoRoot, 'infra/local/postgres-init/01-core.sh'),
          target: '/docker-entrypoint-initdb.d/01-core.sh',
          mode: 0o755,
        },
      ])
      .start();

    coreUrl = `postgresql://core_svc:core_svc_local@${container.getHost()}:${container.getPort()}/onemore`;
    core = new Pool({ connectionString: coreUrl });
    await runMigrations(
      coreUrl,
      join(process.cwd(), 'src', 'db', 'migrations'),
    );
  });

  afterAll(async () => {
    await core?.end();
    await container?.stop();
  });

  async function counts(): Promise<{
    exercises: number;
    translations: number;
  }> {
    const result = await core.query<{
      exercises: number;
      translations: number;
    }>(
      `select
         (select count(*)::int from core.exercises) as exercises,
         (select count(*)::int from core.exercise_translations) as translations`,
    );
    return result.rows[0];
  }

  async function snapshot(): Promise<Map<string, string>> {
    const result = await core.query<{ id: string; updated_at: Date }>(
      'select id, updated_at from core.exercises',
    );
    return new Map(
      result.rows.map((row) => [row.id, row.updated_at.toISOString()]),
    );
  }

  it('first run inserts every exercise with an English translation', async () => {
    const summary = await runExerciseSeed(coreUrl, seed);

    expect(summary).toEqual({
      total: 876,
      inserted: 876,
      updated: 0,
      unchanged: 0,
    });
    expect(await counts()).toEqual({ exercises: 876, translations: 876 });
  });

  it('second run creates no duplicates and changes nothing', async () => {
    const before = await snapshot();

    const summary = await runExerciseSeed(coreUrl, seed);

    expect(summary).toEqual({
      total: 876,
      inserted: 0,
      updated: 0,
      unchanged: 876,
    });
    expect(await counts()).toEqual({ exercises: 876, translations: 876 });
    expect(await snapshot()).toEqual(before);
  });

  it('two runs at the same time do not duplicate anything', async () => {
    await Promise.all([
      runExerciseSeed(coreUrl, seed),
      runExerciseSeed(coreUrl, seed),
    ]);

    expect(await counts()).toEqual({ exercises: 876, translations: 876 });
  });

  it('stores the mapped values', async () => {
    const result = await core.query(
      `select e.source, e.source_id, e.owner_id, e.visibility, e.type,
              e.primary_muscles, e.equipment, e.image_keys, t.locale, t.name
       from core.exercises e
       join core.exercise_translations t on t.exercise_id = e.id
       where e.source_id = 'Farmers_Walk'`,
    );
    expect(result.rows).toEqual([
      {
        source: 'free-exercise-db',
        source_id: 'Farmers_Walk',
        owner_id: null,
        visibility: 'public',
        type: 'weight_distance',
        primary_muscles: ['full_body'],
        equipment: 'other',
        image_keys: [
          'exercises/farmers_walk/0.webp',
          'exercises/farmers_walk/1.webp',
        ],
        locale: 'en',
        name: "Farmer's Walk",
      },
    ]);
  });

  it('updates only the exercises whose data changed', async () => {
    const changed = (exercise: SeedExercise): SeedExercise => {
      if (exercise.sourceId === 'Barbell_Squat') {
        return { ...exercise, equipment: 'smith_machine' };
      }
      if (exercise.sourceId === 'Pushups') {
        return { ...exercise, name: 'Push-Up' };
      }
      return exercise;
    };
    const before = await snapshot();

    const summary = await runExerciseSeed(coreUrl, seed.map(changed));

    expect(summary).toEqual({
      total: 876,
      inserted: 0,
      updated: 2,
      unchanged: 874,
    });
    const after = await snapshot();
    const touched = [...after].filter(([id, at]) => before.get(id) !== at);
    expect(touched.map(([id]) => id).sort()).toEqual(
      seed
        .filter((exercise) =>
          ['Barbell_Squat', 'Pushups'].includes(exercise.sourceId),
        )
        .map((exercise) => exercise.id)
        .sort(),
    );

    const restored = await runExerciseSeed(coreUrl, seed);
    expect(restored.updated).toBe(2);
  });

  it('leaves exercises that are missing from the seed untouched', async () => {
    const summary = await runExerciseSeed(coreUrl, seed.slice(1));

    expect(summary.updated).toBe(0);
    expect(await counts()).toEqual({ exercises: 876, translations: 876 });
  });

  it('rolls back the whole run when the database rejects a row', async () => {
    const broken = seed.map((exercise, index) =>
      index === seed.length - 1
        ? { ...exercise, equipment: 'rocket' as SeedExercise['equipment'] }
        : { ...exercise, level: 'expert' as const },
    );

    await expect(runExerciseSeed(coreUrl, broken)).rejects.toThrow();

    const result = await core.query<{ n: number }>(
      `select count(*)::int as n from core.exercises where level = 'expert'`,
    );
    expect(result.rows[0].n).toBe(
      seed.filter((exercise) => exercise.level === 'expert').length,
    );
  });
  describe('translations', () => {
    const uk = Object.fromEntries(
      seed.map((exercise) => [
        exercise.sourceId,
        {
          name: `Укр ${exercise.name}`,
          instructions: exercise.instructions.map((step) => `Укр ${step}`),
          aliases: ['синонім'],
        },
      ]),
    );
    const en = { Pushups: { aliases: ['press up'] } };
    const rows = buildTranslations({ uk, en }, seed);

    async function translationCounts() {
      const result = await core.query<{ locale: string; n: number }>(
        'select locale, count(*)::int as n from core.exercise_translations group by locale order by locale',
      );
      return result.rows;
    }

    it('first run adds every Ukrainian row and English aliases', async () => {
      await runExerciseSeed(coreUrl, seed);

      const summary = await runTranslationSeed(coreUrl, rows);

      expect(summary).toEqual({
        total: 877,
        inserted: 876,
        updated: 1,
        unchanged: 0,
      });
      expect(await translationCounts()).toEqual([
        { locale: 'en', n: 876 },
        { locale: 'uk', n: 876 },
      ]);
    });

    it('second run changes nothing', async () => {
      const before = await snapshot();

      const summary = await runTranslationSeed(coreUrl, rows);

      expect(summary).toEqual({
        total: 877,
        inserted: 0,
        updated: 0,
        unchanged: 877,
      });
      expect(await snapshot()).toEqual(before);
    });

    it('keeps translations when the exercise seed runs again', async () => {
      const summary = await runExerciseSeed(coreUrl, seed);

      expect(summary.updated).toBe(0);
      const result = await core.query<{ aliases: string[] }>(
        `select t.aliases from core.exercise_translations t
         join core.exercises e on e.id = t.exercise_id
         where e.source_id = 'Pushups' and t.locale = 'en'`,
      );
      expect(result.rows[0].aliases).toEqual(['press up']);
    });

    it('updates exactly the exercise whose alias changed', async () => {
      const changed = buildTranslations(
        {
          uk: {
            ...uk,
            Pushups: { ...uk.Pushups, aliases: ['віджимання від підлоги'] },
          },
          en,
        },
        seed,
      );

      const summary = await runTranslationSeed(coreUrl, changed);

      expect(summary.updated).toBe(1);
      expect(summary.inserted).toBe(0);
    });

    it('fails when the English row is missing', async () => {
      await core.query('delete from core.exercise_translations');

      await expect(runTranslationSeed(coreUrl, rows)).rejects.toThrow(
        /run the exercise seed first/,
      );
    });
  });
});
