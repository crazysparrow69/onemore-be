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
import { MAX_CUSTOM_EXERCISES } from '../../src/modules/exercises/exercise-input.schema';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../support/jwt-fixture';

const repoRoot = join(process.cwd(), '..', '..');

const SYSTEM_ID = '00000000-0000-4000-8000-0000000000a1';
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Item = { id: string; name: string; custom: boolean };
type Page = { items: Item[]; total: number; nextOffset: number | null };

const hammer = {
  name: 'Жим у хамері однією рукою',
  type: 'weight_reps',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'shoulders'],
  equipment: 'machine',
  instructions: ['Сядь і виставив сидіння', 'Вижми рукоятку'],
};

describe('own exercises (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let app: NestExpressApplication;
  let jwt: TestJwt;
  let tokenA: string;
  let tokenB: string;
  let tokenNoProfile: string;

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

    process.env.NODE_ENV = 'test';
    process.env.PORT = '5001';
    process.env.LOG_LEVEL = 'error';
    process.env.APP_VERSION = 'test';
    process.env.DATABASE_URL = coreUrl;
    process.env.NEON_AUTH_URL = TEST_AUTH_URL;
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = '123456789012345';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    process.env.CLOUDINARY_FOLDER = 'onemore-test';

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

    tokenA = await jwt.sign({ sub: 'user-a', email: 'a@example.com' });
    tokenB = await jwt.sign({ sub: 'user-b', email: 'b@example.com' });
    tokenNoProfile = await jwt.sign({
      sub: 'user-none',
      email: 'none@example.com',
    });

    await admin.query(
      `insert into core.users (id, email, language, time_zone) values
         ('user-a', 'a@example.com', 'uk', 'Europe/Kyiv'),
         ('user-b', 'b@example.com', 'en', 'Europe/London')`,
    );
    await admin.query(
      `insert into core.exercises
         (id, source, source_id, visibility, type, primary_muscles)
       values ($1, 'onemore', 'system-squat', 'public', 'weight_reps', array['quadriceps'])`,
      [SYSTEM_ID],
    );
    await admin.query(
      `insert into core.exercise_translations
         (exercise_id, locale, name, instructions, aliases)
       values ($1, 'en', 'System squat', array['Squat'], array[]::text[])`,
      [SYSTEM_ID],
    );
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await container?.stop();
  });

  function call(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    token?: string,
  ) {
    const pending = request(app.getHttpServer())[method](path);
    return token === undefined
      ? pending
      : pending.set('Authorization', `Bearer ${token}`);
  }

  async function create(
    token: string,
    body: unknown = hammer,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await call('post', '/api/exercises', token).send(
      body as object,
    );
    return { status: response.status, body: bodyOf(response) };
  }

  async function createId(token: string, body: unknown = hammer) {
    const created = await create(token, body);
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  async function page(path: string, token: string): Promise<Page> {
    const response = await call('get', path, token);
    expect(response.status).toBe(200);
    return response.body as Page;
  }

  async function countActive(owner: string): Promise<number> {
    const result = await admin.query<{ total: number }>(
      `select count(*)::int as total from core.exercises
       where owner_id = $1 and archived_at is null`,
      [owner],
    );
    return result.rows[0]?.total ?? 0;
  }

  async function wipe(owner: string): Promise<void> {
    await admin.query('delete from core.exercises where owner_id = $1', [
      owner,
    ]);
  }

  describe('authentication', () => {
    it.each([
      ['post', '/api/exercises'],
      ['put', `/api/exercises/${SYSTEM_ID}`],
      ['delete', `/api/exercises/${SYSTEM_ID}`],
    ] as const)('%s %s is 401 without a token', async (method, path) => {
      expect((await call(method, path)).status).toBe(401);
    });
  });

  describe('POST /api/exercises', () => {
    it('creates a private exercise and returns its card', async () => {
      const created = await create(tokenA);

      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        id: expect.stringMatching(UUID_V7) as string,
        name: hammer.name,
        type: 'weight_reps',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['triceps', 'shoulders'],
        equipment: 'machine',
        image: null,
        custom: true,
        imageKeys: [],
        photoId: null,
        category: null,
        force: null,
        mechanic: null,
        level: null,
        instructions: hammer.instructions,
        typeLocked: false,
      });
      await wipe('user-a');
    });

    it('stores one private row owned by the caller with a single translation', async () => {
      const id = await createId(tokenA);

      const row = await admin.query(
        `select owner_id, source, source_id, visibility, category, image_keys
           from core.exercises where id = $1`,
        [id],
      );
      expect(row.rows).toEqual([
        {
          owner_id: 'user-a',
          source: 'user',
          source_id: null,
          visibility: 'private',
          category: null,
          image_keys: [],
        },
      ]);
      const translations = await admin.query(
        'select locale, name from core.exercise_translations where exercise_id = $1',
        [id],
      );
      expect(translations.rows).toEqual([{ locale: 'uk', name: hammer.name }]);
      await wipe('user-a');
    });

    it('uses the profile language of the caller for the translation', async () => {
      const id = await createId(tokenB, { ...hammer, name: 'Hammer press' });

      const translations = await admin.query(
        'select locale from core.exercise_translations where exercise_id = $1',
        [id],
      );
      expect(translations.rows).toEqual([{ locale: 'en' }]);
      await wipe('user-b');
    });

    it('applies the defaults when only the required fields are sent', async () => {
      const created = await create(tokenA, {
        name: '  Планка   на ліктях ',
        type: 'duration',
        primaryMuscles: ['abdominals'],
      });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: 'Планка на ліктях',
        secondaryMuscles: [],
        equipment: 'none',
        instructions: [],
      });
      await wipe('user-a');
    });

    it('allows two exercises with the same name', async () => {
      const first = await create(tokenA);
      const second = await create(tokenA);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).not.toBe(second.body.id);
      await wipe('user-a');
    });

    it.each([
      ['an empty name', { ...hammer, name: ' ' }, 'name'],
      ['an unknown type', { ...hammer, type: 'reps' }, 'type'],
      [
        'an unknown muscle',
        { ...hammer, primaryMuscles: ['legs'] },
        'primaryMuscles.0',
      ],
      [
        'no primary muscle',
        { ...hammer, primaryMuscles: [] },
        'primaryMuscles',
      ],
      [
        'a group mixed with a muscle',
        { ...hammer, primaryMuscles: ['cardio', 'chest'] },
        'primaryMuscles',
      ],
      [
        'a secondary muscle equal to a primary one',
        { ...hammer, secondaryMuscles: ['chest'] },
        'secondaryMuscles',
      ],
      ['an unknown equipment', { ...hammer, equipment: 'rope' }, 'equipment'],
      [
        'too many steps',
        { ...hammer, instructions: Array.from({ length: 21 }, () => 'крок') },
        'instructions',
      ],
    ])('is 400 with the field path for %s', async (_label, body, path) => {
      const created = await create(tokenA, body);

      expect(created.status).toBe(400);
      expect(created.body.code).toBe('VALIDATION_FAILED');
      expect(created.body.details).toContainEqual(
        expect.objectContaining({ path }),
      );
      expect(await countActive('user-a')).toBe(0);
    });

    it('is 400 for fields that are not part of the input', async () => {
      const created = await create(tokenA, { ...hammer, ownerId: 'user-b' });

      expect(created.status).toBe(400);
    });

    it('is 409 PROFILE_REQUIRED for a user without a profile row', async () => {
      const created = await create(tokenNoProfile);

      expect(created.status).toBe(409);
      expect(created.body.code).toBe('PROFILE_REQUIRED');
    });
  });

  describe('catalog, search and the "mine" filter', () => {
    let ownId: string;

    beforeAll(async () => {
      ownId = await createId(tokenA);
    });

    afterAll(async () => {
      await wipe('user-a');
    });

    it('shows the new exercise to its owner marked as custom, next to the system ones', async () => {
      const all = await page('/api/exercises', tokenA);

      expect(all.total).toBe(2);
      expect(all.items).toContainEqual(
        expect.objectContaining({ id: ownId, custom: true }),
      );
      expect(all.items).toContainEqual(
        expect.objectContaining({ id: SYSTEM_ID, custom: false }),
      );
    });

    it('finds it by name, by its muscle label and by its equipment label', async () => {
      for (const q of ['хамері', 'груди', 'тренажер']) {
        const found = await page(
          `/api/exercises?q=${encodeURIComponent(q)}`,
          tokenA,
        );
        expect(found.items.map((item) => item.id)).toContain(ownId);
      }
    });

    it('keeps it out of every list, search and card of another user', async () => {
      const list = await page('/api/exercises', tokenB);
      const search = await page('/api/exercises?q=хамері', tokenB);

      expect(list.items.map((item) => item.id)).toEqual([SYSTEM_ID]);
      expect(search.total).toBe(0);
      expect(
        (await call('get', `/api/exercises/${ownId}`, tokenB)).status,
      ).toBe(404);
    });

    it('limits the list to my exercises with mine=true', async () => {
      const mine = await page('/api/exercises?mine=true', tokenA);
      const everyone = await page('/api/exercises?mine=false', tokenA);

      expect(mine.items.map((item) => item.id)).toEqual([ownId]);
      expect(mine.total).toBe(1);
      expect(everyone.total).toBe(2);
    });

    it('combines mine with search and filters', async () => {
      expect(
        (await page('/api/exercises?mine=true&muscle=chest', tokenA)).total,
      ).toBe(1);
      expect(
        (await page('/api/exercises?mine=true&muscle=biceps', tokenA)).total,
      ).toBe(0);
      expect(
        (await page('/api/exercises?mine=true&equipment=machine', tokenA))
          .total,
      ).toBe(1);
      expect(
        (await page('/api/exercises?mine=true&q=squat', tokenA)).total,
      ).toBe(0);
    });

    it('returns nothing for mine=true to a user without own exercises', async () => {
      const mine = await page('/api/exercises?mine=true', tokenB);

      expect(mine).toEqual({ items: [], total: 0, nextOffset: null });
    });

    it('is 400 for a mine value that is not true or false', async () => {
      expect((await call('get', '/api/exercises?mine=1', tokenA)).status).toBe(
        400,
      );
    });

    it('still names the exercise after the profile language changes', async () => {
      await admin.query(
        `update core.users set language = 'en' where id = 'user-a'`,
      );

      const card = await call('get', `/api/exercises/${ownId}`, tokenA);
      expect(card.status).toBe(200);
      expect(bodyOf(card).name).toBe(hammer.name);

      await admin.query(
        `update core.users set language = 'uk' where id = 'user-a'`,
      );
    });
  });

  describe('PUT /api/exercises/{id}', () => {
    it('replaces every field and keeps the id', async () => {
      const id = await createId(tokenA);

      const response = await call('put', `/api/exercises/${id}`, tokenA).send({
        name: 'Жим у хамері',
        type: 'bodyweight_reps',
        primaryMuscles: ['triceps'],
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id,
        name: 'Жим у хамері',
        type: 'bodyweight_reps',
        primaryMuscles: ['triceps'],
        secondaryMuscles: [],
        equipment: 'none',
        instructions: [],
        custom: true,
      });
      const names = await admin.query(
        'select locale, name from core.exercise_translations where exercise_id = $1',
        [id],
      );
      expect(names.rows).toEqual([{ locale: 'uk', name: 'Жим у хамері' }]);
      await wipe('user-a');
    });

    it('moves updated_at forward and shows the change in the list', async () => {
      const id = await createId(tokenA);
      await admin.query(
        `update core.exercises set updated_at = now() - interval '1 day' where id = $1`,
        [id],
      );

      await call('put', `/api/exercises/${id}`, tokenA).send({
        ...hammer,
        name: 'Нова назва',
      });

      const stale = await admin.query(
        `select updated_at > now() - interval '1 minute' as fresh
           from core.exercises where id = $1`,
        [id],
      );
      expect(stale.rows).toEqual([{ fresh: true }]);
      const found = await page('/api/exercises?q=нова', tokenA);
      expect(found.items.map((item) => item.name)).toEqual(['Нова назва']);
      await wipe('user-a');
    });

    it('is 400 for an invalid body and changes nothing', async () => {
      const id = await createId(tokenA);

      const response = await call('put', `/api/exercises/${id}`, tokenA).send({
        ...hammer,
        primaryMuscles: [],
      });

      expect(response.status).toBe(400);
      const card = await call('get', `/api/exercises/${id}`, tokenA);
      expect(bodyOf(card).name).toBe(hammer.name);
      await wipe('user-a');
    });

    it('is 404 for the exercise of another user and leaves it untouched', async () => {
      const id = await createId(tokenA);

      const response = await call('put', `/api/exercises/${id}`, tokenB).send({
        ...hammer,
        name: 'Hacked',
      });

      expect(response.status).toBe(404);
      expect(bodyOf(response).code).toBe('EXERCISE_NOT_FOUND');
      const card = await call('get', `/api/exercises/${id}`, tokenA);
      expect(bodyOf(card).name).toBe(hammer.name);
      await wipe('user-a');
    });

    it('is 404 for an unknown id and 400 for a malformed one', async () => {
      const missing = '00000000-0000-4000-8000-00000000ffff';

      expect(
        (await call('put', `/api/exercises/${missing}`, tokenA).send(hammer))
          .status,
      ).toBe(404);
      expect(
        (await call('put', '/api/exercises/not-a-uuid', tokenA).send(hammer))
          .status,
      ).toBe(400);
    });

    it('is 403 EXERCISE_READ_ONLY for a catalog exercise', async () => {
      const response = await call(
        'put',
        `/api/exercises/${SYSTEM_ID}`,
        tokenA,
      ).send(hammer);

      expect(response.status).toBe(403);
      expect(bodyOf(response).code).toBe('EXERCISE_READ_ONLY');
      const card = await call('get', `/api/exercises/${SYSTEM_ID}`, tokenA);
      expect(bodyOf(card).name).toBe('System squat');
    });
  });

  describe('DELETE /api/exercises/{id}', () => {
    it('archives the exercise: it disappears everywhere but the row stays', async () => {
      const id = await createId(tokenA);

      const response = await call('delete', `/api/exercises/${id}`, tokenA);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect((await page('/api/exercises?mine=true', tokenA)).total).toBe(0);
      expect((await page('/api/exercises?q=хамері', tokenA)).total).toBe(0);
      expect((await call('get', `/api/exercises/${id}`, tokenA)).status).toBe(
        404,
      );
      const row = await admin.query(
        `select archived_at is not null as archived,
                (select count(*)::int from core.exercise_translations where exercise_id = $1) as translations
           from core.exercises where id = $1`,
        [id],
      );
      expect(row.rows).toEqual([{ archived: true, translations: 1 }]);
      await wipe('user-a');
    });

    it('is 404 the second time and for an archived exercise on PUT', async () => {
      const id = await createId(tokenA);
      await call('delete', `/api/exercises/${id}`, tokenA);

      expect(
        (await call('delete', `/api/exercises/${id}`, tokenA)).status,
      ).toBe(404);
      expect(
        (await call('put', `/api/exercises/${id}`, tokenA).send(hammer)).status,
      ).toBe(404);
      await wipe('user-a');
    });

    it('is 404 for the exercise of another user and keeps it', async () => {
      const id = await createId(tokenA);

      expect(
        (await call('delete', `/api/exercises/${id}`, tokenB)).status,
      ).toBe(404);
      expect((await call('get', `/api/exercises/${id}`, tokenA)).status).toBe(
        200,
      );
      await wipe('user-a');
    });

    it('is 403 EXERCISE_READ_ONLY for a catalog exercise and keeps it', async () => {
      const response = await call(
        'delete',
        `/api/exercises/${SYSTEM_ID}`,
        tokenA,
      );

      expect(response.status).toBe(403);
      expect(bodyOf(response).code).toBe('EXERCISE_READ_ONLY');
      expect(
        (await call('get', `/api/exercises/${SYSTEM_ID}`, tokenB)).status,
      ).toBe(200);
    });
  });

  describe('the limit of own exercises', () => {
    async function fill(owner: string, count: number): Promise<void> {
      await admin.query(
        `insert into core.exercises
           (id, owner_id, source, visibility, type, primary_muscles)
         select gen_random_uuid(), $1, 'user', 'private', 'weight_reps', array['other']
           from generate_series(1, $2)`,
        [owner, count],
      );
    }

    it(`allows ${MAX_CUSTOM_EXERCISES} active exercises and refuses the next with 409`, async () => {
      await fill('user-a', MAX_CUSTOM_EXERCISES - 1);

      const last = await create(tokenA);
      const over = await create(tokenA);

      expect(last.status).toBe(201);
      expect(over.status).toBe(409);
      expect(over.body.code).toBe('EXERCISE_LIMIT_REACHED');
      expect(await countActive('user-a')).toBe(MAX_CUSTOM_EXERCISES);
      expect((await create(tokenB)).status).toBe(201);

      await call('delete', `/api/exercises/${last.body.id as string}`, tokenA);
      expect((await create(tokenA)).status).toBe(201);
      await wipe('user-a');
      await wipe('user-b');
    });

    it('never lets parallel requests exceed the limit', async () => {
      await fill('user-a', MAX_CUSTOM_EXERCISES - 1);

      const results = await Promise.all(
        Array.from({ length: 6 }, () => create(tokenA)),
      );

      expect(results.filter((result) => result.status === 201)).toHaveLength(1);
      expect(results.filter((result) => result.status === 409)).toHaveLength(5);
      expect(await countActive('user-a')).toBe(MAX_CUSTOM_EXERCISES);
      await wipe('user-a');
    });
  });

  describe('account removal', () => {
    it('removes the own exercises together with the user', async () => {
      await admin.query(
        `insert into core.users (id, email, language, time_zone)
         values ('user-gone', 'gone@example.com', 'en', 'UTC')`,
      );
      const token = await jwt.sign({
        sub: 'user-gone',
        email: 'gone@example.com',
      });
      const id = await createId(token);

      await admin.query(`delete from core.users where id = 'user-gone'`);

      const left = await admin.query(
        `select
           (select count(*)::int from core.exercises where id = $1) as exercises,
           (select count(*)::int from core.exercise_translations where exercise_id = $1) as translations`,
        [id],
      );
      expect(left.rows).toEqual([{ exercises: 0, translations: 0 }]);
    });
  });
});
