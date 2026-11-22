import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ZodSerializerInterceptor } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const row = {
  id: 'user-1',
  email: 'a@example.test',
  name: null,
  role: 'user',
  language: 'en',
  timeZone: 'Europe/Kyiv',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('UsersController response contract', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          // A field the contract does not list, as a leaked DB column would be.
          useValue: {
            getMe: vi
              .fn()
              .mockResolvedValue({ ...row, passwordHash: 'secret' }),
          },
        },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(
      (req: { user?: unknown }, _res: unknown, next: () => void): void => {
        req.user = { id: row.id, email: row.email, name: null };
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('drops fields that are not part of the contract', async () => {
    const response = await request(app.getHttpServer()).get('/me');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(row);
    expect(response.body).not.toHaveProperty('passwordHash');
  });
});
