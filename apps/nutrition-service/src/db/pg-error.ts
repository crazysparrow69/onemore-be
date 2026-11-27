export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

export type PgError = { code: string; constraint: string | undefined };

const SQLSTATE = /^[0-9A-Z]{5}$/;

export function pgErrorOf(error: unknown): PgError | undefined {
  let current = error;
  while (typeof current === 'object' && current !== null) {
    if (
      'code' in current &&
      typeof current.code === 'string' &&
      SQLSTATE.test(current.code)
    ) {
      return {
        code: current.code,
        constraint:
          'constraint' in current && typeof current.constraint === 'string'
            ? current.constraint
            : undefined,
      };
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}
