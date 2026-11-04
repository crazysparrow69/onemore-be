import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import type { Env } from '../config/env';

type LoggerEnv = Pick<Env, 'NODE_ENV' | 'LOG_LEVEL' | 'APP_VERSION'>;

const severityByLevel: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export async function createPinoHttpOptions(
  env: LoggerEnv,
): Promise<Options | [Options, DestinationStream]> {
  const options: Options = {
    level: env.LOG_LEVEL,
    messageKey: 'message',
    base: {
      service: 'core-service',
      version: env.APP_VERSION,
    },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    formatters: {
      level(label) {
        return { severity: severityByLevel[label] ?? 'DEFAULT' };
      },
    },
    autoLogging: {
      ignore: (req) => req.url?.split('?')[0] === '/health',
    },
  };

  if (env.NODE_ENV !== 'development') {
    return options;
  }

  const { default: pretty } = await import('pino-pretty');
  return [options, pretty({ singleLine: true, colorize: true })];
}
