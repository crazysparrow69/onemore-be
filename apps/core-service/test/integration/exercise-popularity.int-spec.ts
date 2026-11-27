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
import { configureApp } from '../../src/app.setup';
import { runMigrations } from '../../src/db/migrator';
import { JWKS } from '../../src/modules/auth/auth.constants';
import { recountPopularity } from '../../src/popularity/recount-popularity';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../support/jwt-fixture';

const repoRoot = join(process.cwd(), '..', '..');

const ALPHA = '00000000-0000-4000-8000-0000000000a1';
const BETA = '00000000-0000-4000-8000-0000000000a2';
const GAMMA = '00000000-0000-4000-8000-0000000000a3';
const DELTA = '00000000-0000-4000-8000-0000000000a4';
const PRESS = '00000000-0000-4000-8000-0000000000a5';
const SQUAT_PRESS = '00000000-0000-4000-8000-0000000000a6';

type Page = { items: { id: string; name: string }[] };

describe('exercise popularity (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let coreUrl: string;
  let app: NestExpressApplication;
  let jwt: TestJwt;
  let token: string;

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

    token = await jwt.sign({ sub: 'user-a', email: 'a@example.com' });
    await admin.query(
      `insert into core.users (id, email, language, time_zone) values
         ('user-a', 'a@example.com', 'uk', 'Europe/Kyiv'),
         ('user-b', 'b@example.com', 'uk', 'Europe/Kyiv'),
         ('user-c', 'c@example.com', 'uk', 'Europe/Kyiv')`,
    );
    const names: [string, string][] = [
      [ALPHA, 'Альфа'],
      [BETA, 'Бета'],
      [GAMMA, 'Гамма'],
      [DELTA, 'Дельта'],
      [PRESS, 'Жим штанги'],
      [SQUAT_PRESS, 'Присід жим'],
    ];
    for (const [id, name] of names) {
      await admin.query(
        `insert into core.exercises
           (id, source, source_id, visibility, type, primary_muscles)
         values ($1::uuid, 'onemore', $1::text, 'public', 'weight_reps', array['chest'])`,
        [id],
      );
      await admin.query(
        `insert into core.exercise_translations (exercise_id, locale, name)
         values ($1, 'uk', $2)`,
        [id, name],
      );
    }
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await container?.stop();
  });

  async function workout(owner: string, exerciseIds: string[]): Promise<void> {
    const session = await admin.query<{ id: string }>(
      `insert into core.workout_sessions
         (id, owner_id, name, started_at, ended_at, local_date, time_zone)
       values (gen_random_uuid(), $1, 'w', now(), now(), current_date, 'UTC')
       returning id`,
      [owner],
    );
    const sessionId = session.rows[0]?.id;
    for (const [position, exerciseId] of exerciseIds.entries()) {
      await admin.query(
        `insert into core.session_exercises
           (id, session_id, exercise_id, exercise_type, position)
         values (gen_random_uuid(), $1, $2, 'weight_reps', $3)`,
        [sessionId, exerciseId, position],
      );
    }
  }

  async function names(query = ''): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get(`/api/exercises${query}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return (response.body as Page).items.map((item) => item.name);
  }

  async function counts(): Promise<Record<string, number>> {
    const result = await admin.query<{ exercise_id: string; n: number }>(
      'select exercise_id, users_count as n from core.exercise_stats',
    );
    return Object.fromEntries(result.rows.map((r) => [r.exercise_id, r.n]));
  }

  it('is alphabetical while nobody has trained yet', async () => {
    expect(await names()).toEqual([
      'Альфа',
      'Бета',
      'Гамма',
      'Дельта',
      'Жим штанги',
      'Присід жим',
    ]);
  });

  it('counts different users, not workouts, and ignores exercises nobody did', async () => {
    await workout('user-a', [GAMMA, DELTA, SQUAT_PRESS]);
    await workout('user-a', [GAMMA]);
    await workout('user-b', [GAMMA, SQUAT_PRESS]);
    await workout('user-c', [SQUAT_PRESS]);

    const summary = await recountPopularity(coreUrl);

    expect(summary).toEqual({ changed: 3, removed: 0 });
    expect(await counts()).toEqual({
      [GAMMA]: 2,
      [DELTA]: 1,
      [SQUAT_PRESS]: 3,
    });
  });

  it('sorts by popularity first and by name second', async () => {
    expect(await names()).toEqual([
      'Присід жим',
      'Гамма',
      'Дельта',
      'Альфа',
      'Бета',
      'Жим штанги',
    ]);
  });

  it('keeps search relevance buckets above popularity', async () => {
    expect(await names('?q=жим')).toEqual(['Жим штанги', 'Присід жим']);
  });

  it('is idempotent and writes nothing when nothing changed', async () => {
    expect(await recountPopularity(coreUrl)).toEqual({
      changed: 0,
      removed: 0,
    });
  });

  it('follows deleted workouts and removes rows that fell to zero', async () => {
    await admin.query(
      "delete from core.workout_sessions where owner_id in ('user-b', 'user-c')",
    );

    const summary = await recountPopularity(coreUrl);

    expect(summary).toEqual({ changed: 2, removed: 0 });
    expect(await counts()).toEqual({
      [GAMMA]: 1,
      [DELTA]: 1,
      [SQUAT_PRESS]: 1,
    });

    await admin.query('delete from core.workout_sessions');
    expect(await recountPopularity(coreUrl)).toEqual({
      changed: 0,
      removed: 3,
    });
    expect(await counts()).toEqual({});
  });
});
