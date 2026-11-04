import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { ENV, type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { createPinoHttpOptions } from './logger/pino-options';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: async (env: Env) => ({
        pinoHttp: await createPinoHttpOptions(env),
      }),
    }),
    HealthModule,
  ],
})
export class AppModule {}
