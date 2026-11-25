import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { toDirectUrl } from '../db/migrator';

export async function withSeedTransaction<T>(
  connectionString: string,
  lockKey: number,
  work: (db: NodePgDatabase) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: toDirectUrl(connectionString) });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '30s'");
      await client.query("SET LOCAL statement_timeout = '60s'");
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
      const result = await work(drizzle(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}
