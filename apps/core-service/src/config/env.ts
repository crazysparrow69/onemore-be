import { z } from 'zod';

const required = { error: 'is required' } as const;

const port = z.string(required).transform((value, ctx) => {
  if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535) {
    ctx.addIssue({
      code: 'custom',
      message: 'must be an integer between 1 and 65535',
    });
    return z.NEVER;
  }
  return Number(value);
});

const postgresUrl = z
  .string(required)
  .min(1, 'must not be empty')
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === 'postgresql:' || protocol === 'postgres:';
      } catch {
        return false;
      }
    },
    { message: 'must be a postgresql:// connection string' },
  );

const httpsUrl = z
  .string(required)
  .min(1, 'must not be empty')
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname.length > 0;
      } catch {
        return false;
      }
    },
    { message: 'must be an https URL' },
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production'], required),
  PORT: port,
  LOG_LEVEL: z.enum(
    ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    required,
  ),
  APP_VERSION: z.string(required).min(1, 'must not be empty'),
  DATABASE_URL: postgresUrl,
  NEON_AUTH_URL: httpsUrl,
});

export const ENV_KEYS = Object.keys(envSchema.shape);

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
