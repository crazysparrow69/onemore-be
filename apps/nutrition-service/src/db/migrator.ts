import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const MIGRATION_LOCK_KEY = 7_251_002;

export function toDirectUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.hostname = url.hostname.replace('-pooler', '');
  return url.toString();
}

export async function runMigrations(
  connectionString: string,
  migrationsFolder: string,
): Promise<void> {
  const pool = new Pool({ connectionString: toDirectUrl(connectionString) });
  const client = await pool.connect();
  try {
    await client.query("SET lock_timeout = '5s'");
    await client.query("SET statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      await migrate(drizzle(client), {
        migrationsFolder,
        migrationsSchema: 'nutrition',
      });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
