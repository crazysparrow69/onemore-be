import { NestFactory } from '@nestjs/core';
import { describeError } from './modules/media/storage/describe-error';
import { AppModule } from './app.module';
import { ABANDONED_UPLOAD_HOURS } from './modules/media/media.constants';
import { MediaService } from './modules/media/media.service';

const HOUR_MS = 60 * 60 * 1000;

function log(
  severity: 'INFO' | 'ERROR',
  message: string,
  extra: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({ severity, service: 'core-service', message, ...extra }),
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  try {
    const abandonedBefore = new Date(
      Date.now() - ABANDONED_UPLOAD_HOURS * HOUR_MS,
    );
    const summary = await app.get(MediaService).collectGarbage(abandonedBefore);
    log('INFO', 'Media cleanup finished', summary);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  log('ERROR', describeError(error, 'Cleanup failed'));
  process.exit(1);
});
