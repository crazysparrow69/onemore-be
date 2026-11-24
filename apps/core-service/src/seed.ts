import { envSchema } from './config/env';
import { runExerciseSeed } from './seeds/exercises/import-exercises';
import { loadSeed } from './seeds/exercises/load-seed';

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
  const seed = loadSeed();
  log('INFO', 'Importing exercises', { total: seed.length });
  const summary = await runExerciseSeed(parsed.data.DATABASE_URL, seed);
  log('INFO', 'Exercises imported', summary);
}

main().catch((error: unknown) => {
  log('ERROR', error instanceof Error ? error.message : 'Seed failed');
  process.exit(1);
});
