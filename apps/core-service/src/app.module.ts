import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { createPinoHttpOptions } from './logger/pino-options';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService<Env, true>) => ({
        pinoHttp: await createPinoHttpOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
          APP_VERSION: config.get('APP_VERSION', { infer: true }),
        }),
      }),
    }),
    HealthModule,
  ],
})
export class AppModule {}
