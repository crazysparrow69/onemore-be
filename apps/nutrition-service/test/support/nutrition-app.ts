import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { configureApp } from '../../src/app.setup';
import { runMigrations } from '../../src/db/migrator';
import { JWKS } from '../../src/modules/auth/auth.constants';
import { createTestJwt, TEST_AUTH_URL, type TestJwt } from './jwt-fixture';

const repoRoot = join(process.cwd(), '..', '..');

export const NUTRITION_URL = (container: StartedPostgreSqlContainer): string =>
  `postgresql://nutrition_svc:nutrition_svc_local@${container.getHost()}:${container.getPort()}/onemore`;

export function startPostgres(options: {
  withCore?: boolean;
}): Promise<StartedPostgreSqlContainer> {
  const files = [
    {
      source: join(repoRoot, 'infra/db/nutrition.sql'),
      target: '/infra/db/nutrition.sql',
    },
    {
      source: join(repoRoot, 'infra/local/postgres-init/02-nutrition.sh'),
      target: '/docker-entrypoint-initdb.d/02-nutrition.sh',
      mode: 0o755,
    },
  ];
  if (options.withCore) {
    files.push(
      {
        source: join(repoRoot, 'infra/db/core.sql'),
        target: '/infra/db/core.sql',
      },
      {
        source: join(repoRoot, 'infra/local/postgres-init/01-core.sh'),
        target: '/docker-entrypoint-initdb.d/01-core.sh',
        mode: 0o755,
      },
    );
  }
  return new PostgreSqlContainer('postgres:18-alpine')
    .withUsername('onemore')
    .withPassword('onemore')
    .withDatabase('onemore')
    .withCopyFilesToContainer(files)
    .start();
}

export type TestApp = {
  container: StartedPostgreSqlContainer;
  admin: Pool;
  jwt: TestJwt;
  app: NestExpressApplication;
  tokenOf: (sub: string) => Promise<string>;
  stop: () => Promise<void>;
};

export async function startApp(): Promise<TestApp> {
  const container = await startPostgres({});
  const url = NUTRITION_URL(container);
  await runMigrations(url, join(process.cwd(), 'src', 'db', 'migrations'));
  const admin = new Pool({ connectionString: container.getConnectionUri() });

  process.env.NODE_ENV = 'test';
  process.env.PORT = '5002';
  process.env.LOG_LEVEL = 'error';
  process.env.APP_VERSION = 'test';
  process.env.DATABASE_URL = url;
  process.env.NEON_AUTH_URL = TEST_AUTH_URL;

  const jwt = await createTestJwt();
  const { AppModule } = await import('../../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JWKS)
    .useValue(jwt.jwks)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  return {
    container,
    admin,
    jwt,
    app,
    tokenOf: (sub) => jwt.sign({ sub, email: `${sub}@example.com` }),
    stop: async () => {
      await app?.close();
      await admin?.end();
      await container?.stop();
    },
  };
}

export type Caller = {
  get: (path: string) => request.Test;
  put: (path: string, body?: object) => request.Test;
  delete: (path: string) => request.Test;
};

export function callerOf(app: NestExpressApplication, token: string): Caller {
  const server = app.getHttpServer();
  const auth = (call: request.Test): request.Test =>
    call.set('Authorization', `Bearer ${token}`);
  return {
    get: (path) => auth(request(server).get(path)),
    put: (path, body) => auth(request(server).put(path).send(body)),
    delete: (path) => auth(request(server).delete(path)),
  };
}
