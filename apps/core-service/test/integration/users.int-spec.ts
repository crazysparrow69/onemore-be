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
import { JWKS } from '../../src/modules/auth/auth.constants';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { runMigrations } from '../../src/db/migrator';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../support/jwt-fixture';

const repoRoot = join(process.cwd(), '..', '..');

describe('users (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let app: NestExpressApplication;
  let jwt: TestJwt;
  let users: UsersRepository;

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
    process.env.PORT = '3001';
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
    users = app.get(UsersRepository);
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await container?.stop();
  });

  it('upserts idempotently, defaults the role to user, and does not change role', async () => {
    const created = await users.upsert({
      id: 'user-a',
      email: 'a@example.com',
      language: 'en',
      timeZone: 'Europe/Kyiv',
    });
    expect(created.role).toBe('user');

    await admin.query(
      `update core.users set role = 'admin' where id = 'user-a'`,
    );
    const updated = await users.upsert({
      id: 'user-a',
      email: 'a@example.com',
      language: 'en',
      timeZone: 'America/New_York',
    });

    expect(updated.role).toBe('admin');
    expect(updated.timeZone).toBe('America/New_York');
    const count = await admin.query<{ n: number }>(
      `select count(*)::int as n from core.users where id = 'user-a'`,
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it('rejects a second user with the same email', async () => {
    await expect(
      users.upsert({
        id: 'user-b',
        email: 'a@example.com',
        language: 'en',
        timeZone: 'Europe/Kyiv',
      }),
    ).rejects.toMatchObject({
      response: { code: 'EMAIL_TAKEN' },
    });
  });

  it('GET /api/me is 404 until PUT, then returns the caller only', async () => {
    const tokenA = await jwt.sign({
      sub: 'user-a',
      email: 'from-token@example.com',
      name: 'Ada',
    });
    const missing = await jwt.sign({
      sub: 'user-c',
      email: 'c@example.com',
      name: 'Cara',
    });

    const notFound = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${missing}`);
    expect(notFound.status).toBe(404);
    expect(bodyOf(notFound).code).toBe('USER_NOT_FOUND');

    const created = await request(app.getHttpServer())
      .put('/api/me')
      .set('Authorization', `Bearer ${missing}`)
      .send({ language: 'en', timeZone: 'Europe/Kyiv' });
    expect(created.status).toBe(200);
    expect(bodyOf(created)).toMatchObject({
      id: 'user-c',
      email: 'c@example.com',
      name: 'Cara',
      role: 'user',
      language: 'en',
      timeZone: 'Europe/Kyiv',
    });

    const again = await request(app.getHttpServer())
      .put('/api/me')
      .set('Authorization', `Bearer ${missing}`)
      .send({ language: 'en', timeZone: 'UTC' });
    expect(again.status).toBe(200);
    expect(bodyOf(again).timeZone).toBe('UTC');
    expect(bodyOf(again).role).toBe('user');

    const mine = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(mine.status).toBe(200);
    expect(bodyOf(mine)).toMatchObject({
      id: 'user-a',
      email: 'from-token@example.com',
      name: 'Ada',
      role: 'admin',
      timeZone: 'America/New_York',
    });
    expect(bodyOf(mine).timeZone).not.toBe('UTC');

    const invalid = await request(app.getHttpServer())
      .put('/api/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ language: 'ru', timeZone: 'Nope', extra: true });
    expect(invalid.status).toBe(400);
    expect(bodyOf(invalid).code).toBe('VALIDATION_FAILED');
  });

  it('rejects /api/me without a token', async () => {
    const response = await request(app.getHttpServer()).get('/api/me');
    expect(response.status).toBe(401);
    expect(bodyOf(response).code).toBe('UNAUTHORIZED');
  });
});
