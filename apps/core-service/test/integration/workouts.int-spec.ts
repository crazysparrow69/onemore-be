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

const W1 = '0198b2c0-0000-7000-8000-000000000001';
const W2 = '0198b2c0-0000-7000-8000-000000000002';
const W3 = '0198b2c0-0000-7000-8000-000000000003';
const W4 = '0198b2c0-0000-7000-8000-000000000004';

type Json = Record<string, unknown>;

function at(minutes: number, day = '2026-11-20'): string {
  const base = new Date(`${day}T07:00:00Z`).getTime();
  return new Date(base + minutes * 60_000).toISOString();
}

function done(partial: Json, minutes = 10): Json {
  return { kind: 'working', completedAt: at(minutes), ...partial };
}

function workout(exercises: unknown[], extra: Json = {}): Json {
  return {
    name: 'Груди',
    startedAt: at(0),
    endedAt: at(60),
    timeZone: 'Europe/Kyiv',
    exercises,
    ...extra,
  };
}

const bench = (sets: unknown[], extra: Json = {}) => ({
  exerciseId: BENCH,
  sets,
  ...extra,
});

describe('workouts (real Postgres)', () => {
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
    const response = await call('put', `/api/workouts/${id}`, token).send(
      body as object,
    );
    return { status: response.status, body: bodyOf(response) };
  }

  async function counts() {
    const result = await admin.query<{
      sessions: number;
      exercises: number;
      sets: number;
    }>(
      `select (select count(*) from core.workout_sessions)::int as sessions,
              (select count(*) from core.session_exercises)::int as exercises,
              (select count(*) from core.session_sets)::int as sets`,
    );
    return result.rows[0];
  }

  describe('authentication', () => {
    it.each([
      ['get', '/api/workouts'],
      ['get', `/api/workouts/${W1}`],
      ['put', `/api/workouts/${W1}`],
      ['delete', `/api/workouts/${W1}`],
    ] as const)('%s %s is 401 without a token', async (method, path) => {
      expect((await call(method, path)).status).toBe(401);
    });
  });

  describe('PUT /api/workouts/{id}', () => {
    it('creates the workout and returns the card with totals', async () => {
      const result = await put(
        W1,
        workout(
          [
            bench(
              [
                done({ kind: 'warmup', weightKg: 40, reps: 12 }, 5),
                done({ weightKg: 80, reps: 8 }, 10),
                done({ weightKg: 80, reps: 6 }, 14),
              ],
              { notes: 'Широкий хват' },
            ),
          ],
          { notes: 'Ліве плече тягне' },
        ),
      );

      expect(result.status).toBe(201);
      expect(result.body).toEqual({
        id: W1,
        name: 'Груди',
        notes: 'Ліве плече тягне',
        startedAt: at(0),
        endedAt: at(60),
        localDate: '2026-11-20',
        timeZone: 'Europe/Kyiv',
        summary: {
          durationS: 3600,
          volumeKg: 1120,
          setCount: 3,
          exerciseCount: 1,
        },
        exercises: [
          {
            id: expect.any(String) as string,
            exerciseId: BENCH,
            name: 'Жим лежачи',
            image: 'exercises/bench/0.webp',
            type: 'weight_reps',
            custom: false,
            notes: 'Широкий хват',
            sets: [
              {
                kind: 'warmup',
                weightKg: 40,
                reps: 12,
                durationS: null,
                distanceM: null,
                completedAt: at(5),
              },
              {
                kind: 'working',
                weightKg: 80,
                reps: 8,
                durationS: null,
                distanceM: null,
                completedAt: at(10),
              },
              {
                kind: 'working',
                weightKg: 80,
                reps: 6,
                durationS: null,
                distanceM: null,
                completedAt: at(14),
              },
            ],
          },
        ],
      });
      expect(await counts()).toEqual({ sessions: 1, exercises: 1, sets: 3 });
    });

    it('is idempotent: the same request again is 200 and changes nothing', async () => {
      const body = workout([bench([done({ weightKg: 80, reps: 8 })])]);

      const first = await put(W1, body);
      const second = await put(W1, body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({
        ...first.body,
        exercises: [
          {
            ...(first.body.exercises as Json[])[0],
            id: expect.any(String) as string,
          },
        ],
      });
      expect(await counts()).toEqual({ sessions: 1, exercises: 1, sets: 1 });
    });

    it('replaces the whole aggregate when the same id comes with new content', async () => {
      await put(W1, workout([bench([done({ weightKg: 80, reps: 8 })])]));
      const createdAt = await admin.query<{ created_at: Date }>(
        'select created_at from core.workout_sessions where id = $1',
        [W1],
      );

      const replaced = await put(
        W1,
        workout(
          [
            { exerciseId: PLANK, sets: [done({ durationS: 60 })] },
            bench([
              done({ weightKg: 90, reps: 5 }),
              done({ weightKg: 90, reps: 4 }, 15),
            ]),
          ],
          { name: 'Нове ім’я', notes: 'Оновлено' },
        ),
      );

      expect(replaced.status).toBe(200);
      expect(replaced.body).toMatchObject({
        name: 'Нове ім’я',
        notes: 'Оновлено',
        summary: { setCount: 3, exerciseCount: 2, volumeKg: 810 },
      });
      expect(
        (replaced.body.exercises as Json[]).map((item) => item.exerciseId),
      ).toEqual([PLANK, BENCH]);
      expect(await counts()).toEqual({ sessions: 1, exercises: 2, sets: 3 });
      const after = await admin.query<{ created_at: Date; updated_at: Date }>(
        'select created_at, updated_at from core.workout_sessions where id = $1',
        [W1],
      );
      expect(after.rows[0]?.created_at).toEqual(createdAt.rows[0]?.created_at);
      expect(after.rows[0]?.updated_at.getTime()).toBeGreaterThan(
        after.rows[0]?.created_at.getTime() ?? Infinity,
      );
    });

    it('creates the workout once when the same request arrives twice at the same time', async () => {
      const body = workout([bench([done({ weightKg: 80, reps: 8 })])]);

      const results = await Promise.all([put(W1, body), put(W1, body)]);

      expect(results.map((item) => item.status).sort()).toEqual([200, 201]);
      expect(await counts()).toEqual({ sessions: 1, exercises: 1, sets: 1 });
    });

    it('keeps only completed sets and drops exercises without any', async () => {
      const result = await put(
        W1,
        workout([
          bench([
            done({ weightKg: 80, reps: 8 }),
            { kind: 'working', weightKg: 80, reps: null, completedAt: null },
            { kind: 'working', weightKg: null, reps: null, completedAt: null },
          ]),
          { exerciseId: PLANK, sets: [{ durationS: null, completedAt: null }] },
        ]),
      );

      expect(result.status).toBe(201);
      expect((result.body.exercises as Json[]).length).toBe(1);
      expect(result.body.summary).toMatchObject({
        setCount: 1,
        exerciseCount: 1,
      });
      expect(await counts()).toEqual({ sessions: 1, exercises: 1, sets: 1 });
    });

    it('does not validate the values of sets that are not completed', async () => {
      const result = await put(
        W1,
        workout([
          bench([
            done({ weightKg: 80, reps: 8 }),
            { kind: 'working', weightKg: -5, reps: null, completedAt: null },
          ]),
        ]),
      );

      expect(result.status).toBe(201);
    });

    it('accepts zero reps for a failed attempt', async () => {
      const result = await put(
        W1,
        workout([bench([done({ kind: 'failure', weightKg: 100, reps: 0 })])]),
      );

      expect(result.status).toBe(201);
      expect(result.body.summary).toMatchObject({ volumeKg: 0, setCount: 1 });
    });

    it('stores the sets of every exercise type', async () => {
      const result = await put(
        W1,
        workout([
          bench([done({ weightKg: 100, reps: 5 })]),
          {
            exerciseId: PULL_UP,
            sets: [
              done({ reps: 10 }),
              done({ weightKg: -20, reps: 6 }),
              done({ weightKg: 10, reps: 4 }),
            ],
          },
          { exerciseId: PLANK, sets: [done({ durationS: 90 })] },
          {
            exerciseId: RUN,
            sets: [
              done({ distanceM: 5000, durationS: 1500 }),
              done({ distanceM: 1000 }),
              done({ durationS: 600 }),
            ],
          },
          {
            exerciseId: CARRY,
            sets: [
              done({ weightKg: 40, distanceM: 20 }),
              done({ weightKg: 40, distanceM: 20, durationS: 15 }),
            ],
          },
        ]),
      );

      expect(result.status).toBe(201);
      expect(result.body.summary).toMatchObject({
        setCount: 10,
        exerciseCount: 5,
        volumeKg: 500,
      });
      const sets = (result.body.exercises as Json[]).map(
        (item) => item.sets as Json[],
      );
      expect(sets[1]?.map((set) => set.weightKg)).toEqual([null, -20, 10]);
      expect(sets[3]?.map((set) => [set.distanceM, set.durationS])).toEqual([
        [5000, 1500],
        [1000, null],
        [null, 600],
      ]);
    });

    it('rounds weight to grams and distance to centimetres', async () => {
      const result = await put(
        W1,
        workout([
          bench([done({ weightKg: 20.411668, reps: 10 })]),
          {
            exerciseId: CARRY,
            sets: [done({ weightKg: 1, distanceM: 12.3456 })],
          },
        ]),
      );

      const [first, second] = result.body.exercises as { sets: Json[] }[];
      expect(first?.sets[0]?.weightKg).toBe(20.412);
      expect(second?.sets[0]?.distanceM).toBe(12.35);
    });

    it('allows the same exercise twice and keeps the order', async () => {
      const result = await put(
        W1,
        workout([
          bench([done({ weightKg: 80, reps: 8 })]),
          { exerciseId: PLANK, sets: [done({ durationS: 30 })] },
          bench([done({ weightKg: 60, reps: 12 })]),
        ]),
      );

      expect(
        (result.body.exercises as Json[]).map((item) => item.exerciseId),
      ).toEqual([BENCH, PLANK, BENCH]);
    });

    it('allows own exercises, also an archived one, and marks them custom', async () => {
      const result = await put(
        W1,
        workout([
          { exerciseId: OWN_A, sets: [done({ weightKg: 50, reps: 10 })] },
          {
            exerciseId: OWN_A_ARCHIVED,
            sets: [done({ weightKg: 50, reps: 10 })],
          },
        ]),
      );

      expect(result.status).toBe(201);
      expect(
        (result.body.exercises as Json[]).map((item) => [
          item.name,
          item.custom,
        ]),
      ).toEqual([
        ['Мій жим', true],
        ['Старий жим', true],
      ]);
    });

    it('computes local_date from the time zone sent with the workout', async () => {
      const body = workout([bench([done({ weightKg: 80, reps: 8 })], {})], {
        startedAt: '2026-11-20T23:30:00Z',
        endedAt: '2026-11-21T00:30:00Z',
      });

      const kyiv = await put(W1, body);
      const london = await put(W2, { ...body, timeZone: 'Europe/London' });

      expect(kyiv.body.localDate).toBe('2026-11-21');
      expect(london.body.localDate).toBe('2026-11-20');
      const stored = await admin.query(
        'select local_date::text as d, time_zone from core.workout_sessions order by local_date',
      );
      expect(stored.rows).toEqual([
        { d: '2026-11-20', time_zone: 'Europe/London' },
        { d: '2026-11-21', time_zone: 'Europe/Kyiv' },
      ]);
    });

    it.each([
      ['uk', '2026-11-20T06:00:00Z', 'Ранкове тренування'],
      ['uk', '2026-11-20T20:30:00Z', 'Нічне тренування'],
    ])(
      'names an unnamed workout of a %s user started at %s',
      async (_language, startedAt, expected) => {
        const result = await put(
          W1,
          workout([bench([done({ weightKg: 80, reps: 8 })])], {
            name: '  ',
            startedAt,
            endedAt: new Date(
              new Date(startedAt).getTime() + 3_600_000,
            ).toISOString(),
          }),
        );

        expect(result.body.name).toBe(expected);
      },
    );

    it('names an unnamed workout in English for an English profile', async () => {
      const result = await put(
        W1,
        workout(
          [{ exerciseId: OWN_B, sets: [done({ weightKg: 5, reps: 5 })] }],
          {
            name: '',
            timeZone: 'Europe/London',
            startedAt: '2026-11-20T18:00:00Z',
            endedAt: '2026-11-20T19:00:00Z',
          },
        ),
        tokenB,
      );

      expect(result.body.name).toBe('Evening workout');
    });

    it('shows exercise names in the language of the profile, falling back to English', async () => {
      await put(W1, workout([bench([done({ weightKg: 80, reps: 8 })])]));
      await put(
        W2,
        workout([bench([done({ weightKg: 80, reps: 8 })])]),
        tokenB,
      );

      const uk = bodyOf(await call('get', `/api/workouts/${W1}`, tokenA));
      const en = bodyOf(await call('get', `/api/workouts/${W2}`, tokenB));

      expect((uk.exercises as Json[])[0]?.name).toBe('Жим лежачи');
      expect((en.exercises as Json[])[0]?.name).toBe('Bench press');
    });
  });

  describe('PUT /api/workouts/{id} rejections', () => {
    const okSets = [done({ weightKg: 80, reps: 8 })];

    it.each([
      ['no exercises', workout([])],
      ['only unmarked sets', workout([bench([{ weightKg: 80, reps: 8 }])])],
      ['an exercise without sets', workout([bench([])])],
    ])('is 400 WORKOUT_EMPTY for %s', async (_label, body) => {
      const result = await put(W1, body);

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('WORKOUT_EMPTY');
      expect(await counts()).toEqual({ sessions: 0, exercises: 0, sets: 0 });
    });

    it.each([
      ['the end before the start', { startedAt: at(60), endedAt: at(0) }],
      ['more than 24 hours', { startedAt: at(0), endedAt: at(24 * 60 + 1) }],
      [
        'an end in the future',
        {
          startedAt: new Date(Date.now() + 3_600_000).toISOString(),
          endedAt: new Date(Date.now() + 7_200_000).toISOString(),
        },
      ],
    ])('is 400 WORKOUT_TIME_INVALID for %s', async (_label, extra) => {
      const result = await put(W1, workout([bench(okSets)], extra));

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('WORKOUT_TIME_INVALID');
      expect(await counts()).toEqual({ sessions: 0, exercises: 0, sets: 0 });
    });

    it.each([
      ['an unknown exercise', UNKNOWN],
      ['an exercise of another user', OWN_B],
    ])(
      'is 400 WORKOUT_EXERCISE_NOT_FOUND for %s',
      async (_label, exerciseId) => {
        const result = await put(
          W1,
          workout([bench(okSets), { exerciseId, sets: okSets }]),
        );

        expect(result.status).toBe(400);
        expect(result.body.code).toBe('WORKOUT_EXERCISE_NOT_FOUND');
        expect(result.body.details).toEqual({ path: 'exercises.1.exerciseId' });
        expect(await counts()).toEqual({ sessions: 0, exercises: 0, sets: 0 });
      },
    );

    it.each([
      ['weight_reps without weight', BENCH, { reps: 8 }, 'weightKg'],
      ['weight_reps without reps', BENCH, { weightKg: 80 }, 'reps'],
      [
        'weight_reps with a negative weight',
        BENCH,
        { weightKg: -1, reps: 1 },
        'weightKg',
      ],
      [
        'weight_reps with a duration',
        BENCH,
        { weightKg: 1, reps: 1, durationS: 5 },
        'durationS',
      ],
      ['bodyweight_reps without reps', PULL_UP, { weightKg: 5 }, 'reps'],
      ['duration without duration', PLANK, {}, 'durationS'],
      ['duration with reps', PLANK, { durationS: 30, reps: 2 }, 'reps'],
      ['duration of zero', PLANK, { durationS: 0 }, 'durationS'],
      ['distance_duration with nothing', RUN, {}, 'distanceM'],
      ['distance_duration with reps', RUN, { distanceM: 10, reps: 1 }, 'reps'],
      [
        'weight_distance without distance',
        CARRY,
        { weightKg: 40 },
        'distanceM',
      ],
      ['weight_distance without weight', CARRY, { distanceM: 20 }, 'weightKg'],
    ])(
      'is 400 SET_VALUES_INVALID for %s',
      async (_label, exerciseId, values, field) => {
        const result = await put(
          W1,
          workout([bench(okSets), { exerciseId, sets: [done(values)] }]),
        );

        expect(result.status).toBe(400);
        expect(result.body.code).toBe('SET_VALUES_INVALID');
        expect(result.body.details).toContainEqual({
          path: `exercises.1.sets.0.${field}`,
          message: expect.any(String) as string,
        });
        expect(await counts()).toEqual({ sessions: 0, exercises: 0, sets: 0 });
      },
    );

    it('reports every bad set, with its position in the request', async () => {
      const result = await put(
        W1,
        workout([
          bench([
            { weightKg: 80, reps: null, completedAt: null },
            done({ weightKg: 80 }),
            done({ reps: 5 }),
          ]),
        ]),
      );

      expect(result.body.details).toEqual([
        {
          path: 'exercises.0.sets.1.reps',
          message: expect.any(String) as string,
        },
        {
          path: 'exercises.0.sets.2.weightKg',
          message: expect.any(String) as string,
        },
      ]);
    });

    it.each([
      ['an unknown time zone', { timeZone: 'Mars/Base' }, 'timeZone'],
      [
        'a start without an offset',
        { startedAt: '2026-11-20T07:00:00' },
        'startedAt',
      ],
      ['a name over 80 characters', { name: 'a'.repeat(81) }, 'name'],
      ['an unknown field', { volumeKg: 5 }, ''],
    ])('is 400 VALIDATION_FAILED for %s', async (_label, extra, path) => {
      const result = await put(W1, workout([bench(okSets)], extra));

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('VALIDATION_FAILED');
      expect(result.body.details).toContainEqual(
        expect.objectContaining({ path }),
      );
    });

    it('is 400 for an id that is not a uuid', async () => {
      const result = await put('abc', workout([bench(okSets)]));

      expect(result.status).toBe(400);
    });

    it('is 409 PROFILE_REQUIRED without a profile', async () => {
      const result = await put(W1, workout([bench(okSets)]), tokenNoProfile);

      expect(result.status).toBe(409);
      expect(result.body.code).toBe('PROFILE_REQUIRED');
    });

    it('is 404 when the id belongs to another user and leaves that workout alone', async () => {
      const original = workout([bench(okSets)], { name: 'Моє' });
      await put(W1, original);

      const result = await put(
        W1,
        workout([bench(okSets)], { name: 'Чуже' }),
        tokenB,
      );

      expect(result.status).toBe(404);
      expect(result.body.code).toBe('WORKOUT_NOT_FOUND');
      const stored = await admin.query(
        'select owner_id, name from core.workout_sessions',
      );
      expect(stored.rows).toEqual([{ owner_id: 'user-a', name: 'Моє' }]);
    });

    it('keeps the old workout when a replacement is rejected', async () => {
      await put(W1, workout([bench(okSets)], { name: 'Перше' }));

      const result = await put(
        W1,
        workout([bench([done({ reps: 8 })])], { name: 'Друге' }),
      );

      expect(result.status).toBe(400);
      const stored = await admin.query(
        'select name from core.workout_sessions',
      );
      expect(stored.rows).toEqual([{ name: 'Перше' }]);
      expect(await counts()).toEqual({ sessions: 1, exercises: 1, sets: 1 });
    });
  });

  describe('GET /api/workouts', () => {
    async function seed() {
      const sets = [done({ weightKg: 50, reps: 10 })];
      await put(W1, workout([bench(sets)], { name: 'Перше' }));
      await put(
        W2,
        workout(
          [bench(sets), { exerciseId: PLANK, sets: [done({ durationS: 60 })] }],
          {
            name: 'Друге',
            startedAt: at(0, '2026-11-21'),
            endedAt: at(30, '2026-11-21'),
          },
        ),
      );
      await put(
        W3,
        workout([bench(sets)], {
          name: 'Третє',
          startedAt: at(0, '2026-11-22'),
          endedAt: at(30, '2026-11-22'),
        }),
      );
      await put(
        W4,
        workout([{ exerciseId: OWN_B, sets }], { name: 'Чуже' }),
        tokenB,
      );
    }

    it('lists only own workouts, newest first, with totals and exercise names', async () => {
      await seed();

      const response = await call('get', '/api/workouts', tokenA);

      expect(response.status).toBe(200);
      const page = response.body as {
        items: Json[];
        total: number;
        nextOffset: number | null;
      };
      expect(page.total).toBe(3);
      expect(page.nextOffset).toBeNull();
      expect(page.items.map((item) => item.name)).toEqual([
        'Третє',
        'Друге',
        'Перше',
      ]);
      expect(page.items[1]).toEqual({
        id: W2,
        name: 'Друге',
        notes: null,
        startedAt: at(0, '2026-11-21'),
        endedAt: at(30, '2026-11-21'),
        localDate: '2026-11-21',
        timeZone: 'Europe/Kyiv',
        summary: {
          durationS: 1800,
          volumeKg: 500,
          setCount: 2,
          exerciseCount: 2,
        },
        exercises: [
          {
            exerciseId: BENCH,
            name: 'Жим лежачи',
            image: 'exercises/bench/0.webp',
            setCount: 1,
          },
          {
            exerciseId: PLANK,
            name: 'Plank',
            image: 'exercises/plank/0.webp',
            setCount: 1,
          },
        ],
      });
    });

    it('pages with offset and limit and points to the next page', async () => {
      await seed();

      const first = (await call('get', '/api/workouts?limit=2', tokenA))
        .body as { items: Json[]; total: number; nextOffset: number | null };
      const second = (
        await call('get', '/api/workouts?limit=2&offset=2', tokenA)
      ).body as { items: Json[]; total: number; nextOffset: number | null };

      expect(first.items.map((item) => item.name)).toEqual(['Третє', 'Друге']);
      expect(first.nextOffset).toBe(2);
      expect(second.items.map((item) => item.name)).toEqual(['Перше']);
      expect(second.nextOffset).toBeNull();
      expect(second.total).toBe(3);
    });

    it('is empty for a user without workouts', async () => {
      const response = await call('get', '/api/workouts', tokenB);

      expect(response.body).toEqual({ items: [], total: 0, nextOffset: null });
    });

    it.each(['limit=0', 'limit=51', 'offset=-1', 'limit=x'])(
      'is 400 for %s',
      async (query) => {
        expect(
          (await call('get', `/api/workouts?${query}`, tokenA)).status,
        ).toBe(400);
      },
    );
  });

  describe('GET /api/workouts/{id}', () => {
    it('returns the workout with its sets in the order they were sent', async () => {
      await put(
        W1,
        workout([
          bench([
            done({ weightKg: 60, reps: 12 }, 1),
            done({ weightKg: 70, reps: 10 }, 2),
            done({ kind: 'drop', weightKg: 50, reps: 15 }, 3),
          ]),
        ]),
      );

      const body = bodyOf(await call('get', `/api/workouts/${W1}`, tokenA));

      const sets = (body.exercises as { sets: Json[] }[])[0]?.sets;
      expect(sets?.map((set) => [set.kind, set.weightKg, set.reps])).toEqual([
        ['working', 60, 12],
        ['working', 70, 10],
        ['drop', 50, 15],
      ]);
    });

    it('is 404 for an unknown workout and for a workout of another user', async () => {
      await put(W1, workout([bench([done({ weightKg: 80, reps: 8 })])]));

      expect((await call('get', `/api/workouts/${W2}`, tokenA)).status).toBe(
        404,
      );
      const foreign = await call('get', `/api/workouts/${W1}`, tokenB);
      expect(foreign.status).toBe(404);
      expect(bodyOf(foreign).code).toBe('WORKOUT_NOT_FOUND');
    });

    it('is 400 for an id that is not a uuid', async () => {
      expect((await call('get', '/api/workouts/abc', tokenA)).status).toBe(400);
    });
  });

  describe('DELETE /api/workouts/{id}', () => {
    it('removes the workout with its exercises and sets', async () => {
      await put(W1, workout([bench([done({ weightKg: 80, reps: 8 })])]));
      await put(W2, workout([bench([done({ weightKg: 80, reps: 8 })])]));

      const response = await call('delete', `/api/workouts/${W1}`, tokenA);

      expect(response.status).toBe(204);
      expect(await counts()).toEqual({ sessions: 1, exercises: 1, sets: 1 });
      expect((await call('get', `/api/workouts/${W1}`, tokenA)).status).toBe(
        404,
      );
      expect((await call('delete', `/api/workouts/${W1}`, tokenA)).status).toBe(
        404,
      );
    });

    it('does not touch the workout of another user', async () => {
      await put(W1, workout([bench([done({ weightKg: 80, reps: 8 })])]));

      const response = await call('delete', `/api/workouts/${W1}`, tokenB);

      expect(response.status).toBe(404);
      expect(await counts()).toEqual({ sessions: 1, exercises: 1, sets: 1 });
    });
  });

  describe('exercise type lock', () => {
    const edit = (id: string, type: string, name = 'Мій жим') => ({
      name,
      type,
      primaryMuscles: ['chest'],
    });

    async function putExercise(id: string, body: unknown) {
      const response = await call('put', `/api/exercises/${id}`, tokenA).send(
        body as object,
      );
      return { status: response.status, body: bodyOf(response) };
    }

    it('shows typeLocked false and allows a type change while the exercise is unused', async () => {
      const before = bodyOf(
        await call('get', `/api/exercises/${OWN_A}`, tokenA),
      );
      expect(before.typeLocked).toBe(false);

      const changed = await putExercise(OWN_A, edit(OWN_A, 'duration'));
      expect(changed.status).toBe(200);
      expect(changed.body.type).toBe('duration');

      await putExercise(OWN_A, edit(OWN_A, 'weight_reps'));
    });

    it('is 409 EXERCISE_TYPE_LOCKED for a type change once a workout uses the exercise', async () => {
      await put(
        W1,
        workout([
          { exerciseId: OWN_A, sets: [done({ weightKg: 50, reps: 10 })] },
        ]),
      );

      const locked = bodyOf(
        await call('get', `/api/exercises/${OWN_A}`, tokenA),
      );
      expect(locked.typeLocked).toBe(true);

      const changed = await putExercise(OWN_A, edit(OWN_A, 'duration'));
      expect(changed.status).toBe(409);
      expect(changed.body.code).toBe('EXERCISE_TYPE_LOCKED');
      const stored = await admin.query(
        'select type from core.exercises where id = $1',
        [OWN_A],
      );
      expect(stored.rows).toEqual([{ type: 'weight_reps' }]);
    });

    it('still allows renaming a locked exercise without changing its type', async () => {
      await put(
        W1,
        workout([
          { exerciseId: OWN_A, sets: [done({ weightKg: 50, reps: 10 })] },
        ]),
      );

      const renamed = await putExercise(
        OWN_A,
        edit(OWN_A, 'weight_reps', 'Жим 2'),
      );

      expect(renamed.status).toBe(200);
      expect(renamed.body).toMatchObject({ name: 'Жим 2', typeLocked: true });
      const workoutBody = bodyOf(
        await call('get', `/api/workouts/${W1}`, tokenA),
      );
      expect((workoutBody.exercises as Json[])[0]?.name).toBe('Жим 2');
      await putExercise(OWN_A, edit(OWN_A, 'weight_reps'));
    });

    it('unlocks the type again after the workout is deleted', async () => {
      await put(
        W1,
        workout([
          { exerciseId: OWN_A, sets: [done({ weightKg: 50, reps: 10 })] },
        ]),
      );
      await call('delete', `/api/workouts/${W1}`, tokenA);

      const changed = await putExercise(OWN_A, edit(OWN_A, 'duration'));

      expect(changed.status).toBe(200);
      await putExercise(OWN_A, edit(OWN_A, 'weight_reps'));
    });

    it('marks catalog exercises used in a workout as locked too', async () => {
      await put(W1, workout([bench([done({ weightKg: 80, reps: 8 })])]));

      const body = bodyOf(await call('get', `/api/exercises/${BENCH}`, tokenA));

      expect(body.typeLocked).toBe(true);
    });
  });

  describe('GET /api/exercise-dictionaries', () => {
    it('describes the set fields of every exercise type', async () => {
      const body = bodyOf(
        await call('get', '/api/exercise-dictionaries', tokenA),
      );

      const types = body.types as { id: string; fields: Json[] }[];
      const fieldsOf = (id: string) =>
        types
          .find((type) => type.id === id)
          ?.fields.map((field) => [field.id, field.requirement]);
      expect(fieldsOf('weight_reps')).toEqual([
        ['weightKg', 'required'],
        ['reps', 'required'],
      ]);
      expect(fieldsOf('bodyweight_reps')).toEqual([
        ['weightKg', 'optional'],
        ['reps', 'required'],
      ]);
      expect(fieldsOf('duration')).toEqual([['durationS', 'required']]);
      expect(fieldsOf('distance_duration')).toEqual([
        ['distanceM', 'any_of'],
        ['durationS', 'any_of'],
      ]);
      expect(fieldsOf('weight_distance')).toEqual([
        ['weightKg', 'required'],
        ['distanceM', 'required'],
        ['durationS', 'optional'],
      ]);
      expect(
        types
          .find((type) => type.id === 'bodyweight_reps')
          ?.fields.find((field) => field.id === 'weightKg'),
      ).toMatchObject({ min: -1000, max: 1000 });
    });
  });

  describe('database guarantees', () => {
    async function seedSession(): Promise<string> {
      await put(W1, workout([bench([done({ weightKg: 80, reps: 8 })])]));
      const row = await admin.query<{ id: string }>(
        'select id from core.session_exercises limit 1',
      );
      return row.rows[0]?.id ?? '';
    }

    async function insertSet(
      sessionExerciseId: string,
      type: string,
      values: Record<string, number | null>,
    ) {
      return admin.query(
        `insert into core.session_sets
           (id, session_exercise_id, exercise_type, position, weight_kg, reps, duration_s, distance_m)
         values (gen_random_uuid(), $1, $2, 99, $3, $4, $5, $6)`,
        [
          sessionExerciseId,
          type,
          values.weightKg ?? null,
          values.reps ?? null,
          values.durationS ?? null,
          values.distanceM ?? null,
        ],
      );
    }

    it('rejects a set whose fields do not fit the type of the exercise', async () => {
      const id = await seedSession();

      await expect(insertSet(id, 'weight_reps', { reps: 5 })).rejects.toThrow(
        /session_sets_shape_check/,
      );
      await expect(
        insertSet(id, 'weight_reps', { weightKg: 5, reps: 5, durationS: 3 }),
      ).rejects.toThrow(/session_sets_shape_check/);
    });

    it('rejects a set that carries another type than its exercise', async () => {
      const id = await seedSession();

      await expect(
        insertSet(id, 'duration', { durationS: 30 }),
      ).rejects.toThrow(/session_sets_session_exercise_fk/);
    });

    it('rejects a negative weight except for bodyweight exercises', async () => {
      await put(
        W1,
        workout([
          bench([done({ weightKg: 80, reps: 8 })]),
          { exerciseId: PULL_UP, sets: [done({ weightKg: -20, reps: 6 })] },
        ]),
      );
      const rows = await admin.query<{ id: string; exercise_type: string }>(
        'select id, exercise_type from core.session_exercises',
      );
      const benchRow = rows.rows.find(
        (row) => row.exercise_type === 'weight_reps',
      );

      await expect(
        insertSet(benchRow?.id ?? '', 'weight_reps', { weightKg: -1, reps: 1 }),
      ).rejects.toThrow(/session_sets_values_check/);
      expect(
        await admin.query(
          "select 1 from core.session_sets where weight_kg < 0 and exercise_type = 'bodyweight_reps'",
        ),
      ).toHaveProperty('rowCount', 1);
    });

    it('does not let the type of a used exercise change under the workout', async () => {
      await seedSession();

      await expect(
        admin.query(
          "update core.exercises set type = 'duration' where id = $1",
          [BENCH],
        ),
      ).rejects.toThrow(/session_exercises_exercise_fk/);
    });

    it('rejects a workout that ends before it starts', async () => {
      await expect(
        admin.query(
          `insert into core.workout_sessions
             (id, owner_id, name, started_at, ended_at, local_date, time_zone)
           values (gen_random_uuid(), 'user-a', 'x', now(), now() - interval '1 minute', current_date, 'UTC')`,
        ),
      ).rejects.toThrow(/workout_sessions_period_check/);
    });

    it('removes the workouts of a deleted user', async () => {
      await put(
        W4,
        workout([
          { exerciseId: OWN_B, sets: [done({ weightKg: 5, reps: 5 })] },
        ]),
        tokenB,
      );

      await admin.query(
        "delete from core.workout_sessions where owner_id = 'user-b'",
      );

      expect(await counts()).toEqual({ sessions: 0, exercises: 0, sets: 0 });
    });
  });
});
