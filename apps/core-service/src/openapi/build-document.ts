import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

// Bump only on a deliberate API version change. Keeping it constant keeps
// `openapi.json` deterministic.
const API_VERSION = '1';

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('core-service')
    .setDescription('Account, exercises and workouts')
    .setVersion(API_VERSION)
    .addBearerAuth()
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
