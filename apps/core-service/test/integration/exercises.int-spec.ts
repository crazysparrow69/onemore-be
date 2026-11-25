import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodyOf } from '../support/body';
import { configureApp } from '../../src/app.setup';
import { runMigrations } from '../../src/db/migrator';
import { JWKS } from '../../src/modules/auth/auth.constants';
import { runExerciseSeed } from '../../src/seeds/exercises/import-exercises';
import { loadSeed } from '../../src/seeds/exercises/load-seed';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../support/jwt-fixture';

const repoRoot = join(process.cwd(), '..', '..');

type Item = {
  id: string;
  name: string;
  type: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  image: string | null;
  custom: boolean;
};

type Page = { items: Item[]; total: number; nextOffset: number | null };

const OWN_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
const ARCHIVED_ID = '00000000-0000-4000-8000-000000000003';
const ENGLISH_ONLY_ID = '00000000-0000-4000-8000-000000000004';

describe('exercise catalog (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let app: NestExpressApplication;
  let jwt: TestJwt;
  let tokenUk: string;
  let tokenEn: string;
  let tokenNew: string;
  let barbellBenchId: string;
  let dumbbellBenchId: string;
  let barbellCurlId: string;

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

    const coreUrl = `postgresql://core_svc:core_svc_local@${container.getHost()}:${container.getPort()}/onemore`;
    admin = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(
      coreUrl,
      join(process.cwd(), 'src', 'db', 'migrations'),
    );
    await runExerciseSeed(coreUrl, loadSeed());

    process.env.NODE_ENV = 'test';
    process.env.PORT = '5001';
    process.env.LOG_LEVEL = 'error';
    process.env.APP_VERSION = 'test';
    process.env.DATABASE_URL = coreUrl;
    process.env.NEON_AUTH_URL = TEST_AUTH_URL;

    jwt = await createTestJwt();
    const { AppModule } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JWKS)
      .useValue(jwt.jwks)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    tokenUk = await jwt.sign({ sub: 'user-uk', email: 'uk@example.com' });
    tokenEn = await jwt.sign({ sub: 'user-en', email: 'en@example.com' });
    tokenNew = await jwt.sign({ sub: 'user-new', email: 'new@example.com' });

    await admin.query(
      `insert into core.users (id, email, language, time_zone) values
         ('user-uk', 'uk@example.com', 'uk', 'Europe/Kyiv'),
         ('user-en', 'en@example.com', 'en', 'Europe/London')`,
    );

    barbellBenchId = await idOf('Barbell_Bench_Press_-_Medium_Grip');
    dumbbellBenchId = await idOf('Dumbbell_Bench_Press');
    barbellCurlId = await idOf('Barbell_Curl');

    await translate(
      barbellBenchId,
      'Жим штанги лежачи середнім хватом',
      ['Ляжте на лаву.', 'Опустіть штангу на груди.'],
      ['жим лежачи', 'бенч'],
    );
    await translate(
      dumbbellBenchId,
      'Жим гантелей лежачи',
      ['Ляжте з гантелями.'],
      ['жим гантелей'],
    );
    await translate(barbellCurlId, 'Підйом штанги на біцепс', [], []);
    await admin.query(
      `update core.exercise_translations
         set aliases = array['bench']
       where exercise_id = $1 and locale = 'en'`,
      [barbellBenchId],
    );

    await custom(OWN_ID, 'user-uk', 'uk', 'Моя унікальна вправа');
    await custom(OTHER_ID, 'user-en', 'en', 'Secret curl of someone else');
    await custom(ARCHIVED_ID, 'user-uk', 'uk', 'Стара унікальна вправа', true);
    await custom(ENGLISH_ONLY_ID, 'user-en', 'en', 'Lonely English move');
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await container?.stop();
  });

  async function idOf(sourceId: string): Promise<string> {
    const result = await admin.query<{ id: string }>(
      'select id from core.exercises where source_id = $1',
      [sourceId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`seed exercise ${sourceId} is missing`);
    }
    return row.id;
  }

  async function translate(
    id: string,
    name: string,
    instructions: string[],
    aliases: string[],
  ): Promise<void> {
    await admin.query(
      `insert into core.exercise_translations
         (exercise_id, locale, name, instructions, aliases)
       values ($1, 'uk', $2, $3, $4)`,
      [id, name, instructions, aliases],
    );
  }

  async function custom(
    id: string,
    owner: string,
    locale: string,
    name: string,
    archived = false,
  ): Promise<void> {
    await admin.query(
      `insert into core.exercises
         (id, owner_id, source, visibility, type, primary_muscles, archived_at)
       values ($1, $2, 'user', 'private', 'weight_reps', array['other'], $3)`,
      [id, owner, archived ? new Date() : null],
    );
    await admin.query(
      `insert into core.exercise_translations
         (exercise_id, locale, name, instructions, aliases)
       values ($1, $2, $3, array['Крок'], array[]::text[])`,
      [id, locale, name],
    );
  }

  function get(path: string, token?: string) {
    const call = request(app.getHttpServer()).get(path);
    return token === undefined
      ? call
      : call.set('Authorization', `Bearer ${token}`);
  }

  async function page(path: string, token: string): Promise<Page> {
    const response = await get(path, token);
    expect(response.status).toBe(200);
    return response.body as Page;
  }

  const names = (result: Page): string[] =>
    result.items.map((item) => item.name);
  const ids = (result: Page): string[] => result.items.map((item) => item.id);

  describe('authentication', () => {
    it.each([
      '/api/exercises',
      `/api/exercises/${OWN_ID}`,
      '/api/exercise-dictionaries',
    ])('%s is 401 without a token', async (path) => {
      expect((await get(path)).status).toBe(401);
    });
  });

  describe('GET /api/exercises', () => {
    it('returns the first page with the system catalog and my own exercise', async () => {
      const result = await page('/api/exercises', tokenUk);

      expect(result.items).toHaveLength(50);
      expect(result.total).toBe(877);
      expect(result.nextOffset).toBe(50);
      for (const item of result.items) {
        expect(Object.keys(item).sort()).toEqual([
          'custom',
          'equipment',
          'id',
          'image',
          'name',
          'primaryMuscles',
          'secondaryMuscles',
          'type',
        ]);
      }
    });

    it('pages through everything exactly once and ends with a null offset', async () => {
      const seen: string[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const result: Page = await page(
          `/api/exercises?limit=100&offset=${offset}`,
          tokenUk,
        );
        seen.push(...ids(result));
        offset = result.nextOffset;
      }

      expect(seen).toHaveLength(877);
      expect(new Set(seen).size).toBe(877);
    });

    it('names exercises in the language of the user, with English as fallback', async () => {
      const uk = await page('/api/exercises?q=бенч', tokenUk);
      const en = await page('/api/exercises?q=bench', tokenEn);

      expect(uk.items.find((item) => item.id === barbellBenchId)?.name).toBe(
        'Жим штанги лежачи середнім хватом',
      );
      expect(en.items.find((item) => item.id === barbellBenchId)?.name).toBe(
        'Barbell Bench Press - Medium Grip',
      );
      const ukAll = await page('/api/exercises?q=pushups', tokenUk);
      expect(names(ukAll)).toContain('Pushups');
    });

    it('treats a user without a profile as English', async () => {
      const result = await page('/api/exercises?q=curl', tokenNew);

      expect(names(result)).toContain('Barbell Curl');
    });

    it('sorts by name with the Ukrainian alphabet', async () => {
      for (const [letter, name] of [
        ['я', 'Яма'],
        ['ї', 'Їжак'],
        ['і', 'Ія'],
        ['є', 'Єнот'],
        ['ж', 'Жук'],
      ] as const) {
        const id = `00000000-0000-4000-8000-0000000001${letter.charCodeAt(0) % 90}`;
        await custom(id, 'user-uk', 'uk', `Алфавіт ${name}`);
      }

      const result = await page('/api/exercises?q=алфавіт', tokenUk);

      expect(names(result)).toEqual([
        'Алфавіт Єнот',
        'Алфавіт Жук',
        'Алфавіт Ія',
        'Алфавіт Їжак',
        'Алфавіт Яма',
      ]);
    });

    it('finds an exercise by an alias in any language', async () => {
      const uk = await page('/api/exercises?q=бенч', tokenUk);
      const en = await page('/api/exercises?q=бенч', tokenEn);
      const english = await page('/api/exercises?q=bench', tokenUk);

      expect(ids(uk)).toEqual([barbellBenchId]);
      expect(ids(en)).toEqual([barbellBenchId]);
      expect(ids(english)).toContain(barbellBenchId);
      expect(ids(english)).toContain(dumbbellBenchId);
    });

    it('finds exercises by a muscle name in either language', async () => {
      const filtered = await page('/api/exercises?muscle=biceps', tokenEn);
      const english = await page('/api/exercises?q=biceps&limit=100', tokenUk);
      const ukrainian = await page(
        '/api/exercises?q=біцепси&limit=100',
        tokenUk,
      );

      expect(english.total).toBeGreaterThanOrEqual(filtered.total);
      expect(ids(english)).toContain(barbellCurlId);
      expect(ids(ukrainian)).toContain(barbellCurlId);
      for (const item of english.items) {
        expect(
          item.primaryMuscles.includes('biceps') ||
            item.secondaryMuscles.includes('biceps') ||
            /biceps/i.test(item.name),
        ).toBe(true);
      }
    });

    it('ranks exercises on the primary muscle before secondary ones', async () => {
      const result = await page('/api/exercises?q=biceps&limit=100', tokenEn);

      const firstSecondary = result.items.findIndex(
        (item) =>
          !item.primaryMuscles.includes('biceps') && !/biceps/i.test(item.name),
      );
      const lastPrimary = result.items.findLastIndex((item) =>
        item.primaryMuscles.includes('biceps'),
      );
      expect(firstSecondary).toBeGreaterThan(-1);
      expect(lastPrimary).toBeLessThan(firstSecondary);
    });

    it('combines equipment and muscle words in one query', async () => {
      const result = await page(
        '/api/exercises?q=гантелі груди&limit=100',
        tokenUk,
      );

      expect(ids(result)).toContain(dumbbellBenchId);
      expect(ids(result)).not.toContain(barbellBenchId);
      expect(result.items[0]?.equipment).toBe('dumbbell');
      expect(result.items[0]?.primaryMuscles).toContain('chest');
      for (const item of result.items) {
        expect(
          item.equipment === 'dumbbell' || /гантел|dumbbell/i.test(item.name),
        ).toBe(true);
      }
    });

    it('matches inflected words', async () => {
      const result = await page('/api/exercises?q=гантелями', tokenUk);

      expect(result.total).toBeGreaterThan(100);
    });

    it('puts a name that starts with the query first', async () => {
      const result = await page('/api/exercises?q=жим', tokenUk);

      expect(names(result).slice(0, 2).sort()).toEqual([
        'Жим гантелей лежачи',
        'Жим штанги лежачи середнім хватом',
      ]);
    });

    it('filters by several muscles and several equipment values', async () => {
      const muscles = await page(
        '/api/exercises?muscle=chest,biceps&limit=100',
        tokenEn,
      );
      expect(muscles.total).toBeGreaterThan(50);
      for (const item of muscles.items) {
        expect(
          item.primaryMuscles.some((muscle) =>
            ['chest', 'biceps'].includes(muscle),
          ),
        ).toBe(true);
      }

      const equipment = await page(
        '/api/exercises?equipment=dumbbell,kettlebell&limit=100',
        tokenEn,
      );
      for (const item of equipment.items) {
        expect(['dumbbell', 'kettlebell']).toContain(item.equipment);
      }
    });

    it('applies filters together with the search text', async () => {
      const result = await page(
        '/api/exercises?q=bench&muscle=chest&equipment=dumbbell',
        tokenEn,
      );

      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.equipment).toBe('dumbbell');
        expect(item.primaryMuscles).toContain('chest');
      }
      expect(ids(result)).not.toContain(barbellBenchId);
    });

    it('returns an empty page when nothing matches', async () => {
      const result = await page('/api/exercises?q=zzzzqqqq', tokenEn);

      expect(result).toEqual({ items: [], total: 0, nextOffset: null });
    });

    it('treats SQL and LIKE special characters as plain text', async () => {
      const injection = await page(
        `/api/exercises?q=${encodeURIComponent(`'; drop table core.exercises; --`)}`,
        tokenEn,
      );
      expect(injection.items).toEqual([]);

      const wildcards = await page(
        `/api/exercises?q=${encodeURIComponent('_%')}`,
        tokenEn,
      );
      expect(wildcards.total).toBe(
        (await page('/api/exercises', tokenEn)).total,
      );

      const mixed = await page(
        `/api/exercises?q=${encodeURIComponent('be%nch')}`,
        tokenEn,
      );
      expect(mixed.items).toEqual([]);
    });

    it('shows only the exercises I may see, without archived ones', async () => {
      const mine = await page('/api/exercises?q=унікальна', tokenUk);
      const others = await page('/api/exercises?q=unique', tokenEn);
      const stranger = await page('/api/exercises?q=secret', tokenUk);
      const owner = await page('/api/exercises?q=secret', tokenEn);

      expect(ids(mine)).toEqual([OWN_ID]);
      expect(others.items).toEqual([]);
      expect(stranger.items).toEqual([]);
      expect(ids(owner)).toEqual([OTHER_ID]);
    });

    it('answers 400 for invalid parameters', async () => {
      for (const query of [
        'muscle=wings',
        'equipment=rocket',
        'limit=0',
        'limit=101',
        'offset=-1',
        `q=${'x'.repeat(101)}`,
      ]) {
        const response = await get(`/api/exercises?${query}`, tokenEn);
        expect(response.status).toBe(400);
        expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      }
    });
  });

  describe('GET /api/exercises/:id', () => {
    it('returns the card with technique steps in the language of the user', async () => {
      const uk = await get(`/api/exercises/${barbellBenchId}`, tokenUk);
      const en = await get(`/api/exercises/${barbellBenchId}`, tokenEn);

      expect(uk.status).toBe(200);
      expect(bodyOf(uk)).toMatchObject({
        id: barbellBenchId,
        name: 'Жим штанги лежачи середнім хватом',
        type: 'weight_reps',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['shoulders', 'triceps'],
        equipment: 'barbell',
        instructions: ['Ляжте на лаву.', 'Опустіть штангу на груди.'],
      });
      expect(bodyOf(uk).imageKeys).toEqual([
        'exercises/barbell_bench_press_-_medium_grip/0.webp',
        'exercises/barbell_bench_press_-_medium_grip/1.webp',
      ]);
      expect(bodyOf(uk).image).toBe(
        'exercises/barbell_bench_press_-_medium_grip/0.webp',
      );
      expect(bodyOf(en).name).toBe('Barbell Bench Press - Medium Grip');
      expect(
        (bodyOf(en).instructions as string[]).join(' ').length,
      ).toBeGreaterThan(100);
    });

    it('falls back to English when there is no translation', async () => {
      const response = await get(`/api/exercises/${ENGLISH_ONLY_ID}`, tokenEn);
      const ukrainianUser = await get(
        `/api/exercises/${dumbbellBenchId}`,
        tokenEn,
      );

      expect(bodyOf(response).name).toBe('Lonely English move');
      expect(bodyOf(ukrainianUser).name).toBe('Dumbbell Bench Press');
    });

    it('returns my own exercise but 404 for someone else’s or an archived one', async () => {
      const own = await get(`/api/exercises/${OWN_ID}`, tokenUk);
      expect(own.status).toBe(200);
      expect(bodyOf(own).name).toBe('Моя унікальна вправа');

      for (const id of [OTHER_ID, ARCHIVED_ID]) {
        const response = await get(`/api/exercises/${id}`, tokenUk);
        expect(response.status).toBe(404);
        expect(bodyOf(response).code).toBe('EXERCISE_NOT_FOUND');
      }
    });

    it('is 404 for an unknown id and 400 for a malformed one', async () => {
      const missing = await get(
        '/api/exercises/00000000-0000-4000-8000-0000000000ff',
        tokenUk,
      );
      expect(missing.status).toBe(404);
      expect(bodyOf(missing).code).toBe('EXERCISE_NOT_FOUND');

      const malformed = await get('/api/exercises/not-a-uuid', tokenUk);
      expect(malformed.status).toBe(400);
      expect(bodyOf(malformed).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/exercise-dictionaries', () => {
    it('labels everything in the language of the user', async () => {
      const uk = await get('/api/exercise-dictionaries', tokenUk);
      const en = await get('/api/exercise-dictionaries', tokenEn);

      expect(uk.status).toBe(200);
      expect(bodyOf(uk).locale).toBe('uk');
      const groups = bodyOf(uk).muscleGroups as {
        id: string;
        label: string;
        muscles: { id: string; label: string }[];
      }[];
      const upper = groups.find((group) => group.id === 'upper_body');
      expect(upper?.label).toBe('Верх тіла');
      expect(upper?.muscles).toContainEqual({
        id: 'chest',
        label: 'Груди',
        primaryOnly: false,
      });
      expect(bodyOf(uk).equipment).toContainEqual({
        id: 'dumbbell',
        label: 'Гантелі',
      });
      expect(bodyOf(uk).types).toContainEqual({
        id: 'duration',
        label: 'Тривалість',
        example: 'Планка, розтяжка',
      });
      expect(bodyOf(en).locale).toBe('en');
      expect(bodyOf(en).equipment).toContainEqual({
        id: 'dumbbell',
        label: 'Dumbbell',
      });
    });

    it('is cacheable by ETag and answers 304 when nothing changed', async () => {
      const first = await get('/api/exercise-dictionaries', tokenUk);
      const etag = String(first.headers.etag);

      expect(first.headers['cache-control']).toBe('private, no-cache');
      expect(etag).toBeTruthy();

      const second = await get('/api/exercise-dictionaries', tokenUk).set(
        'If-None-Match',
        etag,
      );
      expect(second.status).toBe(304);
    });
  });
});
