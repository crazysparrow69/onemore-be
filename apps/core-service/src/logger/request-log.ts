import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LevelWithSilent } from 'pino';

type Annotated = { user?: { id?: unknown } };

export function logLevelOf(
  _req: IncomingMessage,
  res: ServerResponse,
  error?: Error,
): LevelWithSilent {
  if (error !== undefined || res.statusCode >= 500) {
    return 'error';
  }
  return res.statusCode >= 400 ? 'warn' : 'info';
}

export function requestProps(
  req: IncomingMessage,
  res: ServerResponse,
): Record<string, unknown> {
  const userId = (req as IncomingMessage & Annotated).user?.id;
  const errorCode = (
    res as ServerResponse & { locals?: { errorCode?: string } }
  ).locals?.errorCode;
  return {
    ...(typeof userId === 'string' && { userId }),
    ...(errorCode !== undefined && { errorCode }),
  };
}
