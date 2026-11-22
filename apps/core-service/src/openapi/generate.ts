import './generate-env';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { buildOpenApiDocument } from './build-document';

// Writes apps/core-service/openapi.json. Run with `pnpm openapi:generate`
// (it builds first, because Nest dependency injection needs the compiled
// decorator metadata).
//
// The app is created in `preview` mode: Nest scans the modules but creates no
// providers, so no database, no Neon and no secrets are needed.
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });
  configureApp(app);
  const document = buildOpenApiDocument(app);

  const target = join(__dirname, '..', '..', 'openapi.json');
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`Wrote ${target}\n`);
  await app.close();
}

void main();
