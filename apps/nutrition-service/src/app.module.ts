import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { validateEnv, type Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { createPinoHttpOptions } from './logger/pino-options';
import { AuthModule } from './modules/auth/auth.module';
import { BodyModule } from './modules/body/body.module';
import { FoodLogModule } from './modules/food-log/food-log.module';
import { FoodSuggestionsModule } from './modules/food-suggestions/food-suggestions.module';
import { GoalsModule } from './modules/goals/goals.module';
import { TargetsModule } from './modules/targets/targets.module';
import { WeightModule } from './modules/weight/weight.module';

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
    DatabaseModule,
    HealthModule,
    BodyModule,
    GoalsModule,
    WeightModule,
    TargetsModule,
    FoodLogModule,
    FoodSuggestionsModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
