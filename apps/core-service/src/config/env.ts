import { z } from 'zod';

const port = z
  .string()
  .default('8080')
  .transform((value, ctx) => {
    if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535) {
      ctx.addIssue({
        code: 'custom',
        message: 'must be an integer between 1 and 65535',
      });
      return z.NEVER;
    }
    return Number(value);
  });

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: port,
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  APP_VERSION: z.string().min(1).default('dev'),
});

export const ENV_KEYS = Object.keys(envSchema.shape);

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
