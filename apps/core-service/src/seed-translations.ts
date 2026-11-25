import { resolve } from 'node:path';
import { envSchema } from './config/env';
import { loadSeed } from './seeds/exercises/load-seed';
import { runTranslationSeed } from './seeds/translations/import-translations';
import {
  buildTranslations,
  readTranslationFiles,
} from './seeds/translations/load-translations';

const seedEnvSchema = envSchema.pick({ DATABASE_URL: true });

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
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const folder = resolve(process.argv[2] ?? 'translations');
  const files = readTranslationFiles(folder);
  const rows = buildTranslations(files, loadSeed());
  log('INFO', 'Importing translations', {
    folder,
    locales: Object.keys(files),
    total: rows.length,
  });
  const summary = await runTranslationSeed(parsed.data.DATABASE_URL, rows);
  log('INFO', 'Translations imported', summary);
}

main().catch((error: unknown) => {
  log('ERROR', error instanceof Error ? error.message : 'Seed failed');
  process.exit(1);
});
