import { envSchema } from './config/env';
import { describeError } from './modules/media/storage/describe-error';
import { NAMED_TRANSFORMATIONS } from './modules/media/media.constants';
import { syncNamedTransformations } from './modules/media/storage/cloudinary-transformations';

const setupEnvSchema = envSchema.pick({
  CLOUDINARY_CLOUD_NAME: true,
  CLOUDINARY_API_KEY: true,
  CLOUDINARY_API_SECRET: true,
});

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
  const parsed = setupEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const summary = await syncNamedTransformations(
    {
      cloudName: parsed.data.CLOUDINARY_CLOUD_NAME,
      apiKey: parsed.data.CLOUDINARY_API_KEY,
      apiSecret: parsed.data.CLOUDINARY_API_SECRET,
    },
    NAMED_TRANSFORMATIONS,
  );
  log('INFO', 'Named transformations are ready', summary);
}

main().catch((error: unknown) => {
  log('ERROR', describeError(error, 'Setup failed'));
  process.exit(1);
});
