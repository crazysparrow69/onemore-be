import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// One advisory lock key per service, so two deploys never migrate at the same time.
const MIGRATION_LOCK_KEY = 7_251_001;

/**
 * Migrations need a session (SET, advisory lock), which the Neon transaction pooler does
 * not keep. Neon convention: the direct host is the pooled host without "-pooler".
 */
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
        migrationsSchema: 'core',
      });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
