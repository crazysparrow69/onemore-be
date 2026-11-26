import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { buildOpenApiDocument } from '../src/openapi/build-document';

describe('openapi.json', () => {
  let app: NestExpressApplication;
  let document: ReturnType<typeof buildOpenApiDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    document = buildOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is up to date (run `pnpm openapi:generate` and commit the result)', async () => {
    const committed: unknown = JSON.parse(
      await readFile(join(process.cwd(), 'openapi.json'), 'utf8'),
    );

    expect(JSON.parse(JSON.stringify(document))).toEqual(committed);
  });

  it('describes the public routes with the global /api prefix', () => {
    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/exercise-dictionaries',
      '/api/exercises',
      '/api/exercises/{id}',
      '/api/me',
      '/api/templates',
      '/api/templates/{id}',
      '/api/workouts',
      '/api/workouts/previous-sets',
      '/api/workouts/{id}',
      '/health',
      '/health/ready',
    ]);
  });

  it('requires a bearer token on /api/me but not on /health', () => {
    expect(document.paths['/api/me']?.get?.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/api/me']?.put?.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/health']?.get?.security).toBeUndefined();
  });

  it('documents the request body and every response of PUT /api/me', () => {
    const put = document.paths['/api/me']?.put;

    expect(put?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UpdateCurrentUser' },
        },
      },
    });
    expect(Object.keys(put?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '409',
    ]);
  });

  it('requires a bearer token on every catalog route', () => {
    for (const path of [
      '/api/exercises',
      '/api/exercises/{id}',
      '/api/exercise-dictionaries',
    ]) {
      expect(document.paths[path]?.get?.security).toEqual([{ bearer: [] }]);
    }
  });

  it('documents the catalog search parameters and every response', () => {
    const list = document.paths['/api/exercises']?.get;
    const parameters = (list?.parameters ?? []).map((parameter) =>
      'name' in parameter ? parameter.name : parameter.$ref,
    );

    expect(parameters.sort()).toEqual([
      'equipment',
      'limit',
      'mine',
      'muscle',
      'offset',
      'q',
    ]);
    expect(Object.keys(list?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
    ]);
    expect(
      Object.keys(
        document.paths['/api/exercises/{id}']?.get?.responses ?? {},
      ).sort(),
    ).toEqual(['200', '400', '401', '404']);
    expect(
      Object.keys(
        document.paths['/api/exercise-dictionaries']?.get?.responses ?? {},
      ).sort(),
    ).toEqual(['200', '401']);
  });

  it('documents the routes that create, replace and archive an own exercise', () => {
    const exercises = document.paths['/api/exercises'];
    const one = document.paths['/api/exercises/{id}'];
    const input = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ExerciseInput' },
        },
      },
    };

    for (const operation of [exercises?.post, one?.put, one?.delete]) {
      expect(operation?.security).toEqual([{ bearer: [] }]);
    }
    expect(exercises?.post?.requestBody).toMatchObject(input);
    expect(one?.put?.requestBody).toMatchObject(input);
    expect(Object.keys(exercises?.post?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '401',
      '409',
    ]);
    expect(Object.keys(one?.put?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
    ]);
    expect(Object.keys(one?.delete?.responses ?? {}).sort()).toEqual([
      '204',
      '400',
      '401',
      '403',
      '404',
    ]);
  });

  it('documents PATCH /api/me with a bearer token and every response', () => {
    const patch = document.paths['/api/me']?.patch;

    expect(patch?.security).toEqual([{ bearer: [] }]);
    expect(patch?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/PatchCurrentUser' },
        },
      },
    });
    expect(Object.keys(patch?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '409',
    ]);
  });

  it('documents the routes that save, list, read and delete workouts', () => {
    const workouts = document.paths['/api/workouts'];
    const one = document.paths['/api/workouts/{id}'];

    for (const operation of [workouts?.get, one?.get, one?.put, one?.delete]) {
      expect(operation?.security).toEqual([{ bearer: [] }]);
    }
    expect(one?.put?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/WorkoutInput' },
        },
      },
    });
    expect(Object.keys(workouts?.get?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
    ]);
    expect(Object.keys(one?.put?.responses ?? {}).sort()).toEqual([
      '200',
      '201',
      '400',
      '401',
      '404',
      '409',
    ]);
    expect(Object.keys(one?.get?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
    ]);
    expect(Object.keys(one?.delete?.responses ?? {}).sort()).toEqual([
      '204',
      '400',
      '401',
      '404',
    ]);
  });
});
