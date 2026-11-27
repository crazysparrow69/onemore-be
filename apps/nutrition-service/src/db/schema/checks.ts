import { sql, type SQL } from 'drizzle-orm';

export function oneOf(column: string, values: readonly string[]): SQL {
  return sql.raw(
    `${column} in (${values.map((value) => `'${value}'`).join(', ')})`,
  );
}
