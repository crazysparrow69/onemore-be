import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { configureApp } from './app.setup';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { buildOpenApiDocument } from './openapi/build-document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app));
  }
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
