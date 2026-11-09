import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { AppException } from '../../common/app.exception';
import type { Env } from '../../config/env';
import { JWKS } from './auth.constants';
import type { AuthUser } from './auth.types';

@Injectable()
export class JwtVerifierService {
  private readonly origin: string;

  constructor(
    @Inject(JWKS) private readonly jwks: JWTVerifyGetKey,
    config: ConfigService<Env, true>,
  ) {
    this.origin = new URL(config.get('NEON_AUTH_URL', { infer: true })).origin;
  }

  async verify(token: string): Promise<AuthUser> {
    const payload = await this.loadPayload(token);
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
    };
  }

  private async loadPayload(token: string): Promise<NeonAuthJwtPayload> {
    try {
      const verified = await jwtVerify(token, this.jwks, {
        algorithms: ['EdDSA'],
        issuer: this.origin,
        audience: this.origin,
      });
      return narrowNeonAuthPayload(verified.payload);
    } catch {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Unauthorized',
      );
    }
  }
}

type NeonAuthJwtPayload = {
  sub: string;
  email: string;
  name?: string;
};

function narrowNeonAuthPayload(payload: JWTPayload): NeonAuthJwtPayload {
  const email = readClaim(payload, 'email');
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      'UNAUTHORIZED',
      'Unauthorized',
    );
  }
  if (typeof email !== 'string' || email.length === 0) {
    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      'UNAUTHORIZED',
      'Unauthorized',
    );
  }
  const name = readClaim(payload, 'name');
  return {
    sub,
    email,
    ...(typeof name === 'string' ? { name } : {}),
  };
}

function readClaim(payload: JWTPayload, key: string): unknown {
  if (key in payload) {
    return payload[key];
  }
  return undefined;
}
