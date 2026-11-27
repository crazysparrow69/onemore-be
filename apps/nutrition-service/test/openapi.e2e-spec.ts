import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { buildOpenApiDocument } from '../src/openapi/build-document';

function statuses(operation: { responses?: object } | undefined): string[] {
  return Object.keys(operation?.responses ?? {}).sort();
}

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
      '/api/body',
      '/api/goals/current',
      '/api/nutrition/days',
      '/api/nutrition/days/{date}',
      '/api/nutrition/entries/{id}',
      '/api/nutrition/suggestions',
      '/api/nutrition/suggestions/{id}',
      '/api/nutrition/target',
      '/api/nutrition/target/auto',
      '/api/nutrition/target/manual',
      '/api/weight',
      '/api/weight/latest',
      '/api/weight/{date}',
      '/health',
      '/health/ready',
    ]);
  });

  it('requires a bearer token on every /api route and on none of /health', () => {
    for (const [path, item] of Object.entries(document.paths)) {
      for (const operation of Object.values(item)) {
        const security = (operation as { security?: unknown }).security;
        if (path.startsWith('/api/')) {
          expect(security, path).toEqual([{ bearer: [] }]);
        } else {
          expect(security, path).toBeUndefined();
        }
      }
    }
  });

  it('documents the body and goal routes', () => {
    const body = document.paths['/api/body'];
    const goal = document.paths['/api/goals/current'];

    expect(statuses(body?.get)).toEqual(['200', '401', '404']);
    expect(statuses(body?.put)).toEqual(['200', '400', '401']);
    expect(statuses(goal?.get)).toEqual(['200', '401', '404']);
    expect(statuses(goal?.put)).toEqual(['200', '400', '401']);
  });

  it('documents the weight journal with 201 for a new day', () => {
    const one = document.paths['/api/weight/{date}'];

    expect(statuses(document.paths['/api/weight']?.get)).toEqual([
      '200',
      '400',
      '401',
    ]);
    expect(statuses(document.paths['/api/weight/latest']?.get)).toEqual([
      '200',
      '401',
      '404',
    ]);
    expect(statuses(one?.put)).toEqual(['200', '201', '400', '401']);
    expect(statuses(one?.delete)).toEqual(['204', '400', '401', '404']);
  });

  it('documents the target routes', () => {
    expect(statuses(document.paths['/api/nutrition/target']?.get)).toEqual([
      '200',
      '400',
      '401',
      '404',
    ]);
    expect(
      statuses(document.paths['/api/nutrition/target/manual']?.put),
    ).toEqual(['200', '400', '401']);
    expect(statuses(document.paths['/api/nutrition/target/auto']?.put)).toEqual(
      ['200', '400', '401', '409'],
    );
  });

  it('documents the diary, the calendar and the suggestions', () => {
    const entry = document.paths['/api/nutrition/entries/{id}'];

    expect(statuses(entry?.put)).toEqual([
      '200',
      '201',
      '400',
      '401',
      '404',
      '409',
    ]);
    expect(statuses(entry?.delete)).toEqual(['204', '400', '401', '404']);
    expect(statuses(document.paths['/api/nutrition/days']?.get)).toEqual([
      '200',
      '400',
      '401',
    ]);
    expect(statuses(document.paths['/api/nutrition/days/{date}']?.get)).toEqual(
      ['200', '400', '401'],
    );
    expect(statuses(document.paths['/api/nutrition/suggestions']?.get)).toEqual(
      ['200', '400', '401'],
    );
    expect(
      statuses(document.paths['/api/nutrition/suggestions/{id}']?.delete),
    ).toEqual(['204', '400', '401', '404']);
  });

  it('names the request bodies', () => {
    const refOf = (operation: unknown): unknown =>
      (
        operation as {
          requestBody?: {
            content: { 'application/json': { schema: { $ref: string } } };
          };
        }
      ).requestBody?.content['application/json'].schema.$ref;

    expect(refOf(document.paths['/api/body']?.put)).toBe(
      '#/components/schemas/BodyInput',
    );
    expect(refOf(document.paths['/api/goals/current']?.put)).toBe(
      '#/components/schemas/GoalInput',
    );
    expect(refOf(document.paths['/api/weight/{date}']?.put)).toBe(
      '#/components/schemas/WeightInput',
    );
    expect(refOf(document.paths['/api/nutrition/entries/{id}']?.put)).toBe(
      '#/components/schemas/FoodEntryInput',
    );
  });
});
