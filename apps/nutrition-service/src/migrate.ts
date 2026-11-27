import { join } from 'node:path';
import { envSchema } from './config/env';
import { runMigrations } from './db/migrator';

const migrateEnvSchema = envSchema.pick({ DATABASE_URL: true });

function log(severity: 'INFO' | 'ERROR', message: string): void {
  console.log(
    JSON.stringify({ severity, service: 'nutrition-service', message }),
  );
}

async function main(): Promise<void> {
  const parsed = migrateEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  log('INFO', 'Applying migrations');
  await runMigrations(
    parsed.data.DATABASE_URL,
    join(__dirname, 'db', 'migrations'),
  );
  log('INFO', 'Migrations applied');
}

main().catch((error: unknown) => {
  log('ERROR', error instanceof Error ? error.message : 'Migration failed');
  process.exit(1);
});
