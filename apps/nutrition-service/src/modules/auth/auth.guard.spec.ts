import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import type { Env } from '../../config/env';
import { bodyOf } from '../../../test/support/body';
import {
  createTestJwt,
  TEST_AUTH_URL,
  type TestJwt,
} from '../../../test/support/jwt-fixture';
import { JWKS } from './auth.constants';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthUser } from './auth.types';
import { JwtVerifierService } from './jwt-verifier.service';
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
}

describe('auth guard', () => {
  let app: NestExpressApplication;
  let jwt: TestJwt;

  beforeAll(async () => {
    jwt = await createTestJwt();

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        JwtVerifierService,
        UserJwtGuard,
        { provide: JWKS, useValue: jwt.jwks },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof Env) => {
              if (key === 'NEON_AUTH_URL') {
                return TEST_AUTH_URL;
              }
              throw new Error(`unexpected config key: ${key}`);
            },
          },
        },
        { provide: APP_GUARD, useExisting: UserJwtGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function get(path: string, token?: string) {
    const call = request(app.getHttpServer()).get(path);
    return token === undefined
      ? call
      : call.set('Authorization', `Bearer ${token}`);
  }

  it('rejects a missing token', async () => {
    const response = await get('/probe');

    expect(response.status).toBe(401);
    expect(bodyOf(response)).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
  });

  it('rejects a malformed token', async () => {
    const response = await get('/probe', 'not-a-jwt');

    expect(response.status).toBe(401);
    expect(bodyOf(response).code).toBe('UNAUTHORIZED');
  });

  it('rejects an expired token', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      expiresAt: Math.floor(Date.now() / 1000) - 10,
    });

    expect((await get('/probe', token)).status).toBe(401);
  });

  it('rejects a token signed by another key', async () => {
    const token = await jwt.signWithOtherKey({
      sub: 'user-id',
      email: 'a@example.com',
    });

    expect((await get('/probe', token)).status).toBe(401);
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      issuer: 'https://other.example',
    });

    expect((await get('/probe', token)).status).toBe(401);
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      audience: 'https://other.example',
    });

    const response = await get('/probe', token);

    expect(response.status).toBe(401);
    expect(bodyOf(response).code).toBe('UNAUTHORIZED');
  });

  it('accepts a valid token and exposes the user', async () => {
    const token = await jwt.sign({
      sub: 'user-id',
      email: 'a@example.com',
      name: 'Ada',
    });

    const response = await get('/probe', token);

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({
      id: 'user-id',
      email: 'a@example.com',
      name: 'Ada',
    });
  });

  it('allows a public route without a token', async () => {
    expect((await get('/probe/public')).status).toBe(200);
  });
});
