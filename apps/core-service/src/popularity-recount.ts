import { envSchema } from './config/env';
import { recountPopularity } from './popularity/recount-popularity';

const recountEnvSchema = envSchema.pick({ DATABASE_URL: true });

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
  const parsed = recountEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const summary = await recountPopularity(parsed.data.DATABASE_URL);
  log('INFO', 'Popularity recount finished', summary);
}

main().catch((error: unknown) => {
  log('ERROR', error instanceof Error ? error.message : 'Recount failed');
  process.exit(1);
});
