import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import type { Env } from '../../config/env';
import { bodyOf } from '../../../test/support/body';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../../../test/support/jwt-fixture';
import { UsersRepository, type UserRecord } from '../users/users.repository';
import { JWKS } from './auth.constants';
import { CurrentUser, Public, Roles } from './auth.decorators';
import type { AuthUser } from './auth.types';
import { JwtVerifierService } from './jwt-verifier.service';
import { RolesGuard } from './roles.guard';
import { UserJwtGuard } from './user-jwt.guard';

@Controller('probe')
class ProbeController {
  @Get()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Public()
  @Get('public')
  open(): { ok: true } {
    return { ok: true };
  }

  @Roles('admin')
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

function userRow(id: string, role: 'user' | 'admin'): UserRecord {
  return {
    id,
    email: `${id}@example.com`,
    role,
    language: 'en',
    timeZone: 'Europe/Kyiv',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('auth guards', () => {
  let app: NestExpressApplication;
  let jwt: TestJwt;
  const findById = vi.fn<(id: string) => Promise<UserRecord | null>>();

  beforeAll(async () => {
    jwt = await createTestJwt();
    findById.mockImplementation((id: string) => {
      if (id === 'admin-id') return Promise.resolve(userRow(id, 'admin'));
      if (id === 'user-id') return Promise.resolve(userRow(id, 'user'));
      return Promise.resolve(null);
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        JwtVerifierService,
        UserJwtGuard,
        RolesGuard,
        { provide: JWKS, useValue: jwt.jwks },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof Env) => {
              if (key === 'NEON_AUTH_URL') {
                return TEST_AUTH_URL;
              }
              throw new Error(`unexpected config key: ${String(key)}`);
            },
          },
        },
        { provide: UsersRepository, useValue: { findById } },
        { provide: APP_GUARD, useExisting: UserJwtGuard },
        { provide: APP_GUARD, useExisting: RolesGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a missing token', async () => {
    const response = await request(app.getHttpServer()).get('/probe');
    expect(response.status).toBe(401);
    expect(bodyOf(response)).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
  });

  it('rejects a malformed token', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(response.status).toBe(401);
    expect(bodyOf(response).code).toBe('UNAUTHORIZED');
  });

  it('rejects an expired token', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      expiresAt: Math.floor(Date.now() / 1000) - 10,
    });
    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it('rejects a token signed by another key', async () => {
    const token = await jwt.signWithOtherKey({
      sub: 'user-id',
      email: 'a@example.com',
    });
    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      issuer: 'https://other.example',
    });
    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      audience: 'https://other.example',
    });
    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(bodyOf(response).code).toBe('UNAUTHORIZED');
  });

  it('accepts a valid token', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      name: 'Ada',
    });
    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({
      id: 'user-id',
      email: 'a@example.com',
      name: 'Ada',
    });
  });

  it('allows a public route without a token', async () => {
    const response = await request(app.getHttpServer()).get('/probe/public');
    expect(response.status).toBe(200);
  });

  it('forbids a user role on an admin route', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
    });
    const response = await request(app.getHttpServer())
      .get('/probe/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(bodyOf(response)).toEqual({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
  });

  it('forbids an admin route when the user row does not exist', async () => {
    const token = await jwt.sign({
      sub: 'missing-id',
      email: 'a@example.com',
    });
    const response = await request(app.getHttpServer())
      .get('/probe/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('allows an admin', async () => {
    const token = await jwt.sign({
      sub: 'admin-id',
      email: 'admin@example.com',
    });
    const response = await request(app.getHttpServer())
      .get('/probe/admin')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
  });
});
