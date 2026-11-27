import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { appError } from '../../common/errors';
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
    const { sub, email, name } = await this.payloadOf(token);
    if (!isNonEmpty(sub) || !isNonEmpty(email)) {
      throw appError('UNAUTHORIZED');
    }
    return { id: sub, email, name: typeof name === 'string' ? name : null };
  }

  private async payloadOf(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        algorithms: ['EdDSA'],
        issuer: this.origin,
        audience: this.origin,
      });
      return payload;
    } catch {
      throw appError('UNAUTHORIZED');
    }
  }
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
