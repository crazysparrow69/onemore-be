import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { JWTVerifyGetKey } from 'jose';
import type { Env } from '../../config/env';
import { UsersModule } from '../users/users.module';
import { JWKS } from './auth.constants';
import { JwtVerifierService } from './jwt-verifier.service';
import { createNeonJwks } from './neon-jwks.factory';
import { RolesGuard } from './roles.guard';
import { UserJwtGuard } from './user-jwt.guard';

@Module({
  imports: [UsersModule],
  providers: [
    {
      provide: JWKS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): JWTVerifyGetKey =>
        createNeonJwks(config.get('NEON_AUTH_URL', { infer: true })),
    },
    JwtVerifierService,
    UserJwtGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: UserJwtGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AuthModule {}
