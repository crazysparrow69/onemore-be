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
import { configureApp } from '../../src/app.setup';
import { runMigrations } from '../../src/db/migrator';
import { JWKS } from '../../src/modules/auth/auth.constants';
import { MAX_OPEN_UPLOADS } from '../../src/modules/media/media.constants';
import { MediaService } from '../../src/modules/media/media.service';
import { MEDIA_STORAGE } from '../../src/modules/media/storage/media-storage';
import { bodyOf } from '../support/body';
import { FakeMediaStorage } from '../support/fake-media-storage';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../support/jwt-fixture';

const repoRoot = join(process.cwd(), '..', '..');

const W1 = '0198f1c2-7d3a-7b5e-9c1d-2a4b6c8d0e01';

const hammer = {
  name: 'Жим у хамері однією рукою',
  type: 'weight_reps',
  primaryMuscles: ['chest'],
};

type Ticket = {
  id: string;
  purpose: string;
  upload: { fields: Record<string, string> };
};

describe('media (real Postgres, fake Cloudinary)', () => {
  let container: StartedPostgreSqlContainer;
  let admin: Pool;
  let app: NestExpressApplication;
  let jwt: TestJwt;
  let storage: FakeMediaStorage;
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

    storage = new FakeMediaStorage();
    jwt = await createTestJwt();
    const { AppModule } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JWKS)
      .useValue(jwt.jwks)
      .overrideProvider(MEDIA_STORAGE)
      .useValue(storage)
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
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    storage.removed.length = 0;
    storage.failRemoval = false;
    await admin.query('update core.users set avatar_id = null');
    await admin.query('update core.exercises set photo_id = null');
    await admin.query('delete from core.media_assets');
    await admin.query('delete from core.workout_sessions');
    await admin.query('delete from core.exercises where owner_id is not null');
  });

  function call(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    token?: string,
  ) {
    const pending = request(app.getHttpServer())[method](path);
    return token === undefined
      ? pending
      : pending.set('Authorization', `Bearer ${token}`);
  }

  async function ticket(purpose: string, token = tokenA): Promise<Ticket> {
    const response = await call('post', '/api/media/uploads', token).send({
      purpose,
    });
    expect(response.status).toBe(201);
    return response.body as Ticket;
  }

  async function complete(
    upload: Ticket,
    token = tokenA,
    version = 1_700_000_001,
  ) {
    const key = upload.upload.fields.public_id ?? '';
    return call('post', `/api/media/uploads/${upload.id}/complete`, token).send(
      {
        version,
        signature: storage.signatureOf(key, version),
      },
    );
  }

  async function readyMedia(
    purpose: string,
    token = tokenA,
  ): Promise<{ id: string; key: string }> {
    const upload = await ticket(purpose, token);
    const done = await complete(upload, token);
    expect(done.status).toBe(200);
    return { id: upload.id, key: bodyOf(done).key as string };
  }

  async function statusOf(id: string): Promise<string | null> {
    const result = await admin.query<{ status: string }>(
      'select status from core.media_assets where id = $1',
      [id],
    );
    return result.rows[0]?.status ?? null;
  }

  describe('authentication', () => {
    it.each([
      ['post', '/api/media/uploads'],
      ['post', `/api/media/uploads/${W1}/complete`],
    ] as const)('%s %s is 401 without a token', async (method, path) => {
      expect((await call(method, path)).status).toBe(401);
    });
  });

  describe('POST /api/media/uploads', () => {
    it('creates a pending row and returns the signed ticket', async () => {
      const upload = await ticket('avatar');

      expect(upload.purpose).toBe('avatar');
      expect(upload.upload.fields.public_id).toBe(
        `onemore-test/u/user-a/avatar/${upload.id}`,
      );
      expect(await statusOf(upload.id)).toBe('pending');
    });

    it.each([{ purpose: 'banner' }, {}, { purpose: 'avatar', extra: 1 }])(
      'rejects the body %j with 400',
      async (body) => {
        const response = await call('post', '/api/media/uploads', tokenA).send(
          body,
        );
        expect(response.status).toBe(400);
      },
    );

    it('is 409 PROFILE_REQUIRED without a profile', async () => {
      const response = await call(
        'post',
        '/api/media/uploads',
        tokenNoProfile,
      ).send({
        purpose: 'avatar',
      });
      expect(response.status).toBe(409);
      expect(bodyOf(response).code).toBe('PROFILE_REQUIRED');
    });

    it('is 429 MEDIA_UPLOAD_LIMIT after too many open uploads, and per user', async () => {
      for (let index = 0; index < MAX_OPEN_UPLOADS; index += 1) {
        await ticket('exercise_photo');
      }
      const response = await call('post', '/api/media/uploads', tokenA).send({
        purpose: 'exercise_photo',
      });
      expect(response.status).toBe(429);
      expect(bodyOf(response).code).toBe('MEDIA_UPLOAD_LIMIT');

      await ticket('exercise_photo', tokenB);
    });
  });

  describe('POST /api/media/uploads/{id}/complete', () => {
    it('marks the upload ready and returns its key', async () => {
      const upload = await ticket('avatar');
      const response = await complete(upload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: upload.id,
        purpose: 'avatar',
        key: `onemore-test/u/user-a/avatar/${upload.id}`,
      });
      expect(await statusOf(upload.id)).toBe('ready');
    });

    it('can be repeated', async () => {
      const upload = await ticket('avatar');
      expect((await complete(upload)).status).toBe(200);
      expect((await complete(upload)).status).toBe(200);
    });

    it('rejects a wrong signature and keeps the row pending', async () => {
      const upload = await ticket('avatar');
      const response = await call(
        'post',
        `/api/media/uploads/${upload.id}/complete`,
        tokenA,
      ).send({
        version: 5,
        signature: 'forged',
      });
      expect(response.status).toBe(400);
      expect(bodyOf(response).code).toBe('MEDIA_SIGNATURE_INVALID');
      expect(await statusOf(upload.id)).toBe('pending');
    });

    it("is 404 for another user's upload", async () => {
      const upload = await ticket('avatar');
      const response = await complete(upload, tokenB);
      expect(response.status).toBe(404);
      expect(bodyOf(response).code).toBe('MEDIA_NOT_FOUND');
    });
  });

  describe('avatar', () => {
    async function me(token = tokenA) {
      const response = await call('get', '/api/me', token);
      expect(response.status).toBe(200);
      return bodyOf(response);
    }

    it('has no avatar by default', async () => {
      expect((await me()).avatar).toBeNull();
    });

    it('is set by PATCH /api/me and shows the key', async () => {
      const media = await readyMedia('avatar');
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId: media.id,
      });

      expect(response.status).toBe(200);
      expect(bodyOf(response).avatar).toBe(media.key);
      expect((await me()).avatar).toBe(media.key);
      expect(await statusOf(media.id)).toBe('attached');
    });

    it('removes the old file when the avatar is replaced', async () => {
      const first = await readyMedia('avatar');
      await call('patch', '/api/me', tokenA).send({ avatarId: first.id });
      const second = await readyMedia('avatar');
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId: second.id,
      });

      expect(bodyOf(response).avatar).toBe(second.key);
      expect(storage.removed).toEqual([first.key]);
      expect(await statusOf(first.id)).toBeNull();
    });

    it('removes the avatar with null', async () => {
      const media = await readyMedia('avatar');
      await call('patch', '/api/me', tokenA).send({ avatarId: media.id });
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId: null,
      });

      expect(bodyOf(response).avatar).toBeNull();
      expect(storage.removed).toEqual([media.key]);
      expect(await statusOf(media.id)).toBeNull();
    });

    it('keeps the avatar when the same id is sent again', async () => {
      const media = await readyMedia('avatar');
      await call('patch', '/api/me', tokenA).send({ avatarId: media.id });
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId: media.id,
        name: 'Serhii',
      });

      expect(response.status).toBe(200);
      expect(bodyOf(response).avatar).toBe(media.key);
      expect(storage.removed).toEqual([]);
    });

    it('keeps the old avatar when the storage cannot delete the old file', async () => {
      const first = await readyMedia('avatar');
      await call('patch', '/api/me', tokenA).send({ avatarId: first.id });
      const second = await readyMedia('avatar');
      storage.failRemoval = true;
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId: second.id,
      });

      expect(response.status).toBe(200);
      expect(bodyOf(response).avatar).toBe(second.key);
      expect(await statusOf(first.id)).toBe('trash');
    });

    it.each([
      ['an unknown id', () => Promise.resolve(W1), 404, 'MEDIA_NOT_FOUND'],
      [
        'a photo of an exercise',
        async () => (await readyMedia('exercise_photo')).id,
        400,
        'MEDIA_PURPOSE_MISMATCH',
      ],
      [
        'an unfinished upload',
        async () => (await ticket('avatar')).id,
        409,
        'MEDIA_NOT_READY',
      ],
      [
        "another user's file",
        async () => (await readyMedia('avatar', tokenB)).id,
        404,
        'MEDIA_NOT_FOUND',
      ],
    ])('rejects %s', async (_label, makeId, status, code) => {
      const avatarId = await makeId();
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId,
      });
      expect(response.status).toBe(status);
      expect(bodyOf(response).code).toBe(code);
    });

    it('rejects a file that is already the avatar of someone else', async () => {
      const media = await readyMedia('avatar');
      await call('patch', '/api/me', tokenA).send({ avatarId: media.id });
      const response = await call('patch', '/api/me', tokenB).send({
        avatarId: media.id,
      });
      expect(response.status).toBe(404);
    });

    it('leaves the file ready when the rest of the patch fails', async () => {
      const media = await readyMedia('avatar');
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId: media.id,
        nickname: 'bad nick!',
      });
      expect(response.status).toBe(400);
      expect(await statusOf(media.id)).toBe('ready');
    });

    it('releases the file again when the update fails after the claim', async () => {
      await admin.query(
        `update core.users set nickname = 'taken' where id = 'user-b'`,
      );
      const media = await readyMedia('avatar');
      const response = await call('patch', '/api/me', tokenA).send({
        avatarId: media.id,
        nickname: 'taken',
      });
      expect(response.status).toBe(409);
      expect(bodyOf(response).code).toBe('NICKNAME_TAKEN');
      expect(await statusOf(media.id)).toBe('ready');
      await admin.query(
        `update core.users set nickname = null where id = 'user-b'`,
      );
    });
  });

  describe('exercise photo', () => {
    async function createExercise(photoId: string | null, token = tokenA) {
      return call('post', '/api/exercises', token).send({ ...hammer, photoId });
    }

    it('is attached on create and shows in the card, the list and the details', async () => {
      const media = await readyMedia('exercise_photo');
      const created = await createExercise(media.id);

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        image: media.key,
        imageKeys: [media.key],
        photoId: media.id,
      });
      const list = await call('get', '/api/exercises?mine=true', tokenA);
      expect(
        (list.body as { items: { image: string }[] }).items[0]?.image,
      ).toBe(media.key);
      expect(await statusOf(media.id)).toBe('attached');
    });

    it('has no photo when none is sent', async () => {
      const created = await createExercise(null);
      expect(created.body).toMatchObject({ image: null, photoId: null });
    });

    it('releases the file when the exercise cannot be created', async () => {
      const media = await readyMedia('exercise_photo');
      const response = await call('post', '/api/exercises', tokenA).send({
        ...hammer,
        primaryMuscles: [],
        photoId: media.id,
      });
      expect(response.status).toBe(400);
      expect(await statusOf(media.id)).toBe('ready');
    });

    it('rejects an avatar file, an unfinished upload and a used file', async () => {
      const avatar = await readyMedia('avatar');
      expect((await createExercise(avatar.id)).status).toBe(400);

      const pending = await ticket('exercise_photo');
      expect((await createExercise(pending.id)).status).toBe(409);

      const media = await readyMedia('exercise_photo');
      expect((await createExercise(media.id)).status).toBe(201);
      const again = await createExercise(media.id);
      expect(again.status).toBe(409);
      expect(bodyOf(again).code).toBe('MEDIA_IN_USE');
    });

    async function createWithPhoto() {
      const media = await readyMedia('exercise_photo');
      const created = await createExercise(media.id);
      return { media, id: bodyOf(created).id as string };
    }

    it('replaces the photo on PUT and removes the old file', async () => {
      const { media: first, id } = await createWithPhoto();
      const second = await readyMedia('exercise_photo');
      const response = await call('put', `/api/exercises/${id}`, tokenA).send({
        ...hammer,
        photoId: second.id,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        image: second.key,
        photoId: second.id,
      });
      expect(storage.removed).toEqual([first.key]);
    });

    it('keeps the photo when PUT sends the same id', async () => {
      const { media, id } = await createWithPhoto();
      const response = await call('put', `/api/exercises/${id}`, tokenA).send({
        ...hammer,
        name: 'Новий хамер',
        photoId: media.id,
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        image: media.key,
        photoId: media.id,
      });
      expect(storage.removed).toEqual([]);
    });

    it('removes the photo when PUT sends null', async () => {
      const { media, id } = await createWithPhoto();
      const response = await call('put', `/api/exercises/${id}`, tokenA).send({
        ...hammer,
        photoId: null,
      });
      expect(response.body).toMatchObject({ image: null, photoId: null });
      expect(storage.removed).toEqual([media.key]);
    });

    it('keeps the photo of an archived exercise', async () => {
      const { media, id } = await createWithPhoto();
      const response = await call('delete', `/api/exercises/${id}`, tokenA);
      expect(response.status).toBe(204);
      expect(storage.removed).toEqual([]);
      expect(await statusOf(media.id)).toBe('attached');
    });

    it('shows the photo in a finished workout', async () => {
      const { media, id } = await createWithPhoto();
      const start = '2026-11-20T07:00:00.000Z';
      const response = await call('put', `/api/workouts/${W1}`, tokenA).send({
        name: 'Груди',
        startedAt: start,
        endedAt: '2026-11-20T08:00:00.000Z',
        timeZone: 'Europe/Kyiv',
        exercises: [
          {
            exerciseId: id,
            sets: [
              {
                kind: 'working',
                completedAt: '2026-11-20T07:10:00.000Z',
                weightKg: 80,
                reps: 8,
              },
            ],
          },
        ],
      });
      expect(response.status).toBe(201);
      const details = response.body as {
        exercises: { image: string | null }[];
      };
      expect(details.exercises[0]?.image).toBe(media.key);
    });
  });

  describe('garbage collection', () => {
    it('removes abandoned uploads and trash, and keeps fresh and attached files', async () => {
      const service = app.get(MediaService);
      const stale = await ticket('avatar');
      const fresh = await ticket('avatar');
      const attached = await readyMedia('avatar');
      await call('patch', '/api/me', tokenA).send({ avatarId: attached.id });
      await admin.query(
        `update core.media_assets set updated_at = now() - interval '2 days' where id = $1`,
        [stale.id],
      );

      const summary = await service.collectGarbage(
        new Date(Date.now() - 24 * 3_600_000),
      );

      expect(summary).toEqual({ removed: 1, failed: 0 });
      expect(await statusOf(stale.id)).toBeNull();
      expect(await statusOf(fresh.id)).toBe('pending');
      expect(await statusOf(attached.id)).toBe('attached');
      expect(storage.removed).toEqual([stale.upload.fields.public_id]);
    });
  });
});
