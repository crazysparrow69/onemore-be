import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyOf } from '../support/body';
import { configureApp } from '../../src/app.setup';
import { runMigrations } from '../../src/db/migrator';
import { JWKS } from '../../src/modules/auth/auth.constants';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../support/jwt-fixture';
import { firstRow } from '../support/rows';

const repoRoot = join(process.cwd(), '..', '..');

const BENCH = '00000000-0000-4000-8000-0000000000b1';
const PLANK = '00000000-0000-4000-8000-0000000000b2';
const PULL_UP = '00000000-0000-4000-8000-0000000000b3';
const RUN = '00000000-0000-4000-8000-0000000000b4';
const CARRY = '00000000-0000-4000-8000-0000000000b5';
const OWN_A = '00000000-0000-4000-8000-0000000000c1';
const OWN_A_ARCHIVED = '00000000-0000-4000-8000-0000000000c2';
const OWN_B = '00000000-0000-4000-8000-0000000000c3';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

const T1 = '0198b2c0-0000-7000-8000-0000000000d1';
const T2 = '0198b2c0-0000-7000-8000-0000000000d2';
const T3 = '0198b2c0-0000-7000-8000-0000000000d3';
const W1 = '0198b2c0-0000-7000-8000-000000000001';
const W2 = '0198b2c0-0000-7000-8000-000000000002';

type Json = Record<string, unknown>;

function at(minutes: number): string {
  const base = new Date('2026-11-20T07:00:00Z').getTime();
  return new Date(base + minutes * 60_000).toISOString();
}

function program(exercises: unknown[], extra: Json = {}): Json {
  return { name: 'Ноги і плечі', exercises, ...extra };
}

const bench = (
  sets: unknown[] = [{ weightKg: 80, reps: 12 }],
  extra: Json = {},
) => ({
  exerciseId: BENCH,
  sets,
  ...extra,
});

function workout(templateId: string | null, exerciseId = BENCH): Json {
  return {
    name: 'Груди',
    templateId,
    startedAt: at(0),
    endedAt: at(60),
    timeZone: 'Europe/Kyiv',
    exercises: [
      {
        exerciseId,
        sets: [{ kind: 'working', weightKg: 80, reps: 8, completedAt: at(10) }],
      },
    ],
  };
}

describe('programs (real Postgres)', () => {
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
    const system: [string, string, string, string, string][] = [
      [BENCH, 'bench', 'weight_reps', 'chest', 'Bench press'],
      [PLANK, 'plank', 'duration', 'abdominals', 'Plank'],
      [PULL_UP, 'pull-up', 'bodyweight_reps', 'lats', 'Pull-up'],
      [RUN, 'run', 'distance_duration', 'cardio', 'Run'],
      [CARRY, 'carry', 'weight_distance', 'full_body', 'Farmer walk'],
    ];
    for (const [id, sourceId, type, muscle, name] of system) {
      await admin.query(
        `insert into core.exercises
           (id, source, source_id, visibility, type, primary_muscles, image_keys)
         values ($1, 'onemore', $2, 'public', $3, array[$4], array[$5])`,
        [id, sourceId, type, muscle, `exercises/${sourceId}/0.webp`],
      );
      await admin.query(
        `insert into core.exercise_translations (exercise_id, locale, name)
         values ($1, 'en', $2)`,
        [id, name],
      );
    }
    await admin.query(
      `insert into core.exercise_translations (exercise_id, locale, name)
       values ($1, 'uk', 'Жим лежачи')`,
      [BENCH],
    );
    const own: [string, string, string, string, boolean][] = [
      [OWN_A, 'user-a', 'weight_reps', 'Мій жим', false],
      [OWN_A_ARCHIVED, 'user-a', 'weight_reps', 'Старий жим', true],
      [OWN_B, 'user-b', 'weight_reps', 'Bee press', false],
    ];
    for (const [id, owner, type, name, archived] of own) {
      await admin.query(
        `insert into core.exercises
           (id, owner_id, source, visibility, type, primary_muscles, archived_at)
         values ($1, $2, 'user', 'private', $3, array['chest'],
                 case when $4 then now() else null end)`,
        [id, owner, type, archived],
      );
      await admin.query(
        `insert into core.exercise_translations (exercise_id, locale, name)
         values ($1, $2, $3)`,
        [id, owner === 'user-a' ? 'uk' : 'en', name],
      );
    }
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await admin.query('delete from core.workout_sessions');
    await admin.query('delete from core.templates');
  });

  function call(
    method: 'get' | 'put' | 'delete',
    path: string,
    token?: string,
  ) {
    const pending = request(app.getHttpServer())[method](path);
    return token === undefined
      ? pending
      : pending.set('Authorization', `Bearer ${token}`);
  }

  async function put(id: string, body: unknown, token = tokenA) {
    const response = await call('put', `/api/templates/${id}`, token).send(
      body as object,
    );
    return { status: response.status, body: bodyOf(response) };
  }

  async function saveWorkout(id: string, body: unknown, token = tokenA) {
    const response = await call('put', `/api/workouts/${id}`, token).send(
      body as object,
    );
    return { status: response.status, body: bodyOf(response) };
  }

  async function counts() {
    const result = await admin.query<{
      templates: number;
      exercises: number;
      sets: number;
    }>(
      `select (select count(*) from core.templates)::int as templates,
              (select count(*) from core.template_exercises)::int as exercises,
              (select count(*) from core.template_sets)::int as sets`,
    );
    return firstRow(result);
  }

  describe('authentication', () => {
    it.each([
      ['get', '/api/templates'],
      ['get', `/api/templates/${T1}`],
      ['put', `/api/templates/${T1}`],
      ['delete', `/api/templates/${T1}`],
    ] as const)('%s %s is 401 without a token', async (method, path) => {
      expect((await call(method, path)).status).toBe(401);
    });
  });

  describe('PUT /api/templates/{id}', () => {
    it('creates the program and returns it with localized exercise names', async () => {
      const result = await put(
        T1,
        program(
          [
            bench(
              [
                { kind: 'warmup', weightKg: 40, reps: 12 },
                { weightKg: 80, reps: 12 },
                { reps: 10 },
              ],
              { notes: 'Широкий хват', restSeconds: 90 },
            ),
            { exerciseId: PLANK, sets: [{ durationS: 60 }] },
          ],
          { notes: 'Для понеділка' },
        ),
      );

      expect(result.status).toBe(201);
      expect(result.body).toEqual({
        id: T1,
        name: 'Ноги і плечі',
        notes: 'Для понеділка',
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
        lastPerformedAt: null,
        exercises: [
          {
            exerciseId: BENCH,
            name: 'Жим лежачи',
            image: 'exercises/bench/0.webp',
            type: 'weight_reps',
            custom: false,
            archived: false,
            notes: 'Широкий хват',
            restSeconds: 90,
            sets: [
              {
                kind: 'warmup',
                weightKg: 40,
                reps: 12,
                durationS: null,
                distanceM: null,
              },
              {
                kind: 'working',
                weightKg: 80,
                reps: 12,
                durationS: null,
                distanceM: null,
              },
              {
                kind: 'working',
                weightKg: null,
                reps: 10,
                durationS: null,
                distanceM: null,
              },
            ],
          },
          {
            exerciseId: PLANK,
            name: 'Plank',
            image: 'exercises/plank/0.webp',
            type: 'duration',
            custom: false,
            archived: false,
            notes: null,
            restSeconds: null,
            sets: [
              {
                kind: 'working',
                weightKg: null,
                reps: null,
                durationS: 60,
                distanceM: null,
              },
            ],
          },
        ],
      });
      expect(await counts()).toEqual({ templates: 1, exercises: 2, sets: 4 });
    });

    it('keeps the order of exercises as sent', async () => {
      await put(T1, program([{ exerciseId: PLANK, sets: [{}] }, bench()]));

      const got = bodyOf(await call('get', `/api/templates/${T1}`, tokenA));

      expect(
        (got.exercises as Json[]).map((exercise) => exercise.exerciseId),
      ).toEqual([PLANK, BENCH]);
    });

    it('accepts a program with only the number of sets', async () => {
      const result = await put(T1, program([bench([{}, {}, {}])]));

      expect(result.status).toBe(201);
      expect(await counts()).toEqual({ templates: 1, exercises: 1, sets: 3 });
    });

    it('is idempotent: the same request again is 200 and changes nothing', async () => {
      const body = program([bench()]);

      const first = await put(T1, body);
      const second = await put(T1, body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.exercises).toEqual(first.body.exercises);
      expect(await counts()).toEqual({ templates: 1, exercises: 1, sets: 1 });
    });

    it('replaces the whole content and keeps createdAt', async () => {
      await put(
        T1,
        program([bench([{}, {}]), { exerciseId: PLANK, sets: [{}] }]),
      );
      const created = await admin.query<{ created_at: Date }>(
        'select created_at from core.templates where id = $1',
        [T1],
      );

      const replaced = await put(
        T1,
        program([bench([{ weightKg: 85, reps: 10 }])], { name: 'Груди' }),
      );

      expect(replaced.status).toBe(200);
      expect(replaced.body.name).toBe('Груди');
      expect(
        (replaced.body.exercises as Json[]).map((item) => item.exerciseId),
      ).toEqual([BENCH]);
      expect(await counts()).toEqual({ templates: 1, exercises: 1, sets: 1 });
      const after = await admin.query<{ created_at: Date; updated_at: Date }>(
        'select created_at, updated_at from core.templates where id = $1',
        [T1],
      );
      expect(firstRow(after).created_at).toEqual(firstRow(created).created_at);
      expect(firstRow(after).updated_at.getTime()).toBeGreaterThan(
        firstRow(created).created_at.getTime(),
      );
    });

    it('accepts own archived exercises and marks them archived', async () => {
      const result = await put(
        T1,
        program([
          { exerciseId: OWN_A_ARCHIVED, sets: [{ weightKg: 50, reps: 10 }] },
        ]),
      );

      expect(result.status).toBe(201);
      expect((result.body.exercises as Json[])[0]).toMatchObject({
        exerciseId: OWN_A_ARCHIVED,
        custom: true,
        archived: true,
      });
    });

    it('is 400 TEMPLATE_EXERCISE_NOT_FOUND for a foreign or unknown exercise', async () => {
      for (const exerciseId of [OWN_B, UNKNOWN]) {
        const result = await put(
          T1,
          program([bench(), { exerciseId, sets: [{}] }]),
        );

        expect(result.status).toBe(400);
        expect(result.body.code).toBe('TEMPLATE_EXERCISE_NOT_FOUND');
        expect(result.body.details).toEqual({ path: 'exercises.1.exerciseId' });
      }
      expect(await counts()).toEqual({ templates: 0, exercises: 0, sets: 0 });
    });

    it('is 400 SET_VALUES_INVALID with paths when targets do not fit the type', async () => {
      const result = await put(
        T1,
        program([
          bench(),
          { exerciseId: PLANK, sets: [{ durationS: 60 }, { reps: 5 }] },
        ]),
      );

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('SET_VALUES_INVALID');
      expect(result.body.details).toEqual([
        {
          path: 'exercises.1.sets.1.reps',
          message: 'is not used by this exercise type',
        },
      ]);
    });

    it.each([
      ['an empty name', { name: ' ' }],
      ['no exercises', { exercises: [] }],
      [
        'a set with a completion time',
        {
          exercises: [bench([{ weightKg: 1, reps: 1, completedAt: at(1) }])],
        },
      ],
    ])('is 400 VALIDATION_FAILED for %s', async (_label, extra) => {
      const result = await put(T1, program([bench()], extra));

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('VALIDATION_FAILED');
    });

    it('is 400 for an id that is not a UUID', async () => {
      const response = await call('put', '/api/templates/nope', tokenA).send(
        program([bench()]),
      );

      expect(response.status).toBe(400);
    });

    it('is 409 PROFILE_REQUIRED without a profile', async () => {
      const result = await put(T1, program([bench()]), tokenNoProfile);

      expect(result.status).toBe(409);
      expect(result.body.code).toBe('PROFILE_REQUIRED');
    });

    it('is 404 for a program of another user and leaves it unchanged', async () => {
      await put(T1, program([bench()]));

      const result = await put(
        T1,
        program([bench()], { name: 'Чужа' }),
        tokenB,
      );

      expect(result.status).toBe(404);
      expect(result.body.code).toBe('TEMPLATE_NOT_FOUND');
      const name = await admin.query<{ name: string }>(
        'select name from core.templates where id = $1',
        [T1],
      );
      expect(firstRow(name).name).toBe('Ноги і плечі');
    });

    it('does not bring an archived program back', async () => {
      await put(T1, program([bench()]));
      await call('delete', `/api/templates/${T1}`, tokenA);

      const result = await put(T1, program([bench()]));

      expect(result.status).toBe(404);
      expect(result.body.code).toBe('TEMPLATE_NOT_FOUND');
    });

    it('is 409 TEMPLATE_LIMIT_REACHED at 100 active programs, archived ones do not count', async () => {
      await admin.query(
        `insert into core.templates (id, owner_id, name)
         select gen_random_uuid(), 'user-a', 'p' || n from generate_series(1, 100) n`,
      );

      const over = await put(T1, program([bench()]));
      expect(over.status).toBe(409);
      expect(over.body.code).toBe('TEMPLATE_LIMIT_REACHED');

      await admin.query(
        `update core.templates set archived_at = now()
         where id = (select id from core.templates limit 1)`,
      );
      expect((await put(T1, program([bench()]))).status).toBe(201);
    });

    it('does not count the limit against replacing an existing program', async () => {
      await put(T1, program([bench()]));
      await admin.query(
        `insert into core.templates (id, owner_id, name)
         select gen_random_uuid(), 'user-a', 'p' || n from generate_series(1, 99) n`,
      );

      expect((await put(T1, program([bench()], { name: 'Нова' }))).status).toBe(
        200,
      );
    });
  });

  describe('GET /api/templates', () => {
    it('lists only own active programs, oldest first, with their content', async () => {
      await put(T1, program([bench()], { name: 'Перша' }));
      await put(
        T2,
        program([{ exerciseId: PLANK, sets: [{}] }], { name: 'Друга' }),
      );
      await put(T3, program([bench()], { name: 'Чужа' }), tokenB);
      await call('delete', `/api/templates/${T2}`, tokenA);
      await put(T2, program([bench()]), tokenA);

      const page = bodyOf(await call('get', '/api/templates', tokenA));

      expect((page.items as Json[]).map((item) => item.name)).toEqual([
        'Перша',
      ]);
      expect(page.items as Json[]).toHaveLength(1);
    });

    it('returns programs in creation order', async () => {
      await put(T1, program([bench()], { name: 'Перша' }));
      await put(T2, program([bench()], { name: 'Друга' }));
      await put(T1, program([bench()], { name: 'Перша, правка' }));

      const page = bodyOf(await call('get', '/api/templates', tokenA));

      expect((page.items as Json[]).map((item) => item.name)).toEqual([
        'Перша, правка',
        'Друга',
      ]);
    });

    it('is empty for a user without programs', async () => {
      const page = bodyOf(await call('get', '/api/templates', tokenB));

      expect(page).toEqual({ items: [] });
    });

    it('shows when the program was last performed', async () => {
      await put(T1, program([bench()]));
      await saveWorkout(W1, workout(T1));

      const page = bodyOf(await call('get', '/api/templates', tokenA));

      expect((page.items as Json[])[0]?.lastPerformedAt).toBe(at(0));
    });
  });

  describe('GET /api/templates/{id}', () => {
    it('is 404 for a program of another user, an archived one and an unknown one', async () => {
      await put(T1, program([bench()]));
      await put(T2, program([bench()]));
      await call('delete', `/api/templates/${T2}`, tokenA);

      expect((await call('get', `/api/templates/${T1}`, tokenB)).status).toBe(
        404,
      );
      expect((await call('get', `/api/templates/${T2}`, tokenA)).status).toBe(
        404,
      );
      expect((await call('get', `/api/templates/${T3}`, tokenA)).status).toBe(
        404,
      );
    });
  });

  describe('DELETE /api/templates/{id}', () => {
    it('archives the program: 204, gone from the list, rows stay', async () => {
      await put(T1, program([bench()]));

      const removed = await call('delete', `/api/templates/${T1}`, tokenA);

      expect(removed.status).toBe(204);
      expect(bodyOf(await call('get', '/api/templates', tokenA))).toEqual({
        items: [],
      });
      expect(await counts()).toEqual({ templates: 1, exercises: 1, sets: 1 });
    });

    it('is 404 the second time and for another user', async () => {
      await put(T1, program([bench()]));

      expect(
        (await call('delete', `/api/templates/${T1}`, tokenB)).status,
      ).toBe(404);
      expect(
        (await call('delete', `/api/templates/${T1}`, tokenA)).status,
      ).toBe(204);
      expect(
        (await call('delete', `/api/templates/${T1}`, tokenA)).status,
      ).toBe(404);
    });
  });

  describe('workouts started from a program', () => {
    it('saves the link and shows it in the card and in the list', async () => {
      await put(T1, program([bench()]));

      const saved = await saveWorkout(W1, workout(T1));

      expect(saved.status).toBe(201);
      expect(saved.body.templateId).toBe(T1);
      const list = bodyOf(await call('get', '/api/workouts', tokenA));
      expect((list.items as Json[])[0]?.templateId).toBe(T1);
    });

    it('keeps the link after the program is archived', async () => {
      await put(T1, program([bench()]));
      await call('delete', `/api/templates/${T1}`, tokenA);

      const saved = await saveWorkout(W1, workout(T1));

      expect(saved.body.templateId).toBe(T1);
    });

    it('drops the link silently for a program of another user or an unknown one', async () => {
      await put(T3, program([bench()]), tokenB);

      expect((await saveWorkout(W1, workout(T3))).body.templateId).toBeNull();
      expect((await saveWorkout(W2, workout(T2))).body.templateId).toBeNull();
    });

    it('does not change the program when the workout differs from it', async () => {
      await put(T1, program([bench([{ weightKg: 60, reps: 12 }])]));

      await saveWorkout(W1, workout(T1));

      const got = bodyOf(await call('get', `/api/templates/${T1}`, tokenA));
      expect(((got.exercises as Json[])[0]?.sets as Json[])[0]).toMatchObject({
        weightKg: 60,
        reps: 12,
      });
    });

    it('keeps the workout when its program is deleted from the database', async () => {
      await put(T1, program([bench()]));
      await saveWorkout(W1, workout(T1));

      await admin.query('delete from core.templates where id = $1', [T1]);

      const got = bodyOf(await call('get', `/api/workouts/${W1}`, tokenA));
      expect(got.templateId).toBeNull();
    });
  });

  describe('exercise type lock', () => {
    const edit = (type: string) => ({
      name: 'Мій жим',
      type,
      primaryMuscles: ['chest'],
    });

    it('locks the type of an exercise used only in a program', async () => {
      await put(
        T1,
        program([{ exerciseId: OWN_A, sets: [{ weightKg: 50, reps: 10 }] }]),
      );

      const card = bodyOf(await call('get', `/api/exercises/${OWN_A}`, tokenA));
      expect(card.typeLocked).toBe(true);

      const changed = await call('put', `/api/exercises/${OWN_A}`, tokenA).send(
        edit('duration'),
      );
      expect(changed.status).toBe(409);
      expect(bodyOf(changed).code).toBe('EXERCISE_TYPE_LOCKED');
    });

    it('locks the type for an archived program too', async () => {
      await put(
        T1,
        program([{ exerciseId: OWN_A, sets: [{ weightKg: 50, reps: 10 }] }]),
      );
      await call('delete', `/api/templates/${T1}`, tokenA);

      const changed = await call('put', `/api/exercises/${OWN_A}`, tokenA).send(
        edit('duration'),
      );

      expect(changed.status).toBe(409);
    });
  });

  describe('concurrent saves', () => {
    it('two identical creates end with one program', async () => {
      const body = program([bench([{ weightKg: 80, reps: 12 }, {}])]);

      const results = await Promise.all([put(T1, body), put(T1, body)]);

      expect(results.map((item) => item.status).sort()).toEqual([200, 201]);
      expect(await counts()).toEqual({ templates: 1, exercises: 1, sets: 2 });
    });

    it('parallel creates never exceed the limit', async () => {
      await admin.query(
        `insert into core.templates (id, owner_id, name)
         select gen_random_uuid(), 'user-a', 'p' || n from generate_series(1, 99) n`,
      );
      const ids = [T1, T2, T3];

      const results = await Promise.all(
        ids.map((id) => put(id, program([bench()]))),
      );

      expect(results.filter((item) => item.status === 201)).toHaveLength(1);
      expect(results.filter((item) => item.status === 409)).toHaveLength(2);
    });
  });
});
