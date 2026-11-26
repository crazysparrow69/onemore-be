import { sql } from 'drizzle-orm';
import type { Database } from './database.module';

export async function lockXact(
  tx: Pick<Database, 'execute'>,
  key: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}
