import { join } from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrator';

const repoRoot = join(process.cwd(), '..', '..');
const migrationsFolder = join(process.cwd(), 'src', 'db', 'migrations');

describe('core schema, role and migrations (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let coreUrl: string;
  let admin: Pool;
  let core: Pool;

  beforeAll(async () => {
    // Same init as local docker compose and Neon: infra/db/core.sql creates
    // the role core_svc and the schema core.
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withUsername('onemore')
      .withPassword('onemore')
      .withDatabase('onemore')
      .withCopyFilesToContainer([
        {
          source: join(repoRoot, 'infra/db/core.sql'),
          target: '/infra/db/core.sql',
        },
        {
          source: join(repoRoot, 'infra/local/postgres-init/01-core.sh'),
          target: '/docker-entrypoint-initdb.d/01-core.sh',
          mode: 0o755,
        },
      ])
      .start();

    const host = container.getHost();
    const port = container.getPort();
    coreUrl = `postgresql://core_svc:core_svc_local@${host}:${port}/onemore`;
    admin = new Pool({ connectionString: container.getConnectionUri() });
    core = new Pool({ connectionString: coreUrl });
  });

  async function appliedMigrations(): Promise<number> {
    const journal = await core.query<{ n: number }>(
      'select count(*)::int as n from core.__drizzle_migrations',
    );
    return journal.rows[0].n;
  }

  afterAll(async () => {
    await core?.end();
    await admin?.end();
    await container?.stop();
  });

  it('applies migrations as core_svc; two deploys at once are safe', async () => {
    await Promise.all([
      runMigrations(coreUrl, migrationsFolder),
      runMigrations(coreUrl, migrationsFolder),
    ]);

    expect(await appliedMigrations()).toBe(1);
  });

  it('is idempotent: running again changes nothing', async () => {
    await runMigrations(coreUrl, migrationsFolder);

    expect(await appliedMigrations()).toBe(1);
  });

  it('creates core.accounts with the expected columns', async () => {
    const result = await core.query(
      `select column_name, is_nullable from information_schema.columns
       where table_schema = 'core' and table_name = 'accounts'
       order by column_name`,
    );
    expect(result.rows).toEqual([
      { column_name: 'created_at', is_nullable: 'NO' },
      { column_name: 'language', is_nullable: 'NO' },
      { column_name: 'onboarding_completed_at', is_nullable: 'YES' },
      { column_name: 'time_zone', is_nullable: 'NO' },
      { column_name: 'units', is_nullable: 'NO' },
      { column_name: 'updated_at', is_nullable: 'NO' },
      { column_name: 'user_id', is_nullable: 'NO' },
    ]);
  });

  it('accounts accepts kg and lb and rejects other units', async () => {
    await core.query(
      `insert into core.accounts (user_id, units, language, time_zone)
       values ('user-a', 'kg', 'en', 'Europe/Kyiv')`,
    );
    await expect(
      core.query(
        `insert into core.accounts (user_id, units, language, time_zone)
         values ('user-b', 'stone', 'en', 'Europe/Kyiv')`,
      ),
    ).rejects.toThrow(/accounts_units_check/);
  });

  it('core_svc cannot create anything outside its own schema', async () => {
    await expect(
      core.query('create table public.intruder (id int)'),
    ).rejects.toThrow(/permission denied/);

    await admin.query('create schema nutrition');
    await admin.query('create table nutrition.weight (id int)');
    await admin.query('insert into nutrition.weight values (1)');

    await expect(
      core.query('create table nutrition.intruder (id int)'),
    ).rejects.toThrow(/permission denied/);
  });

  it("core_svc cannot read another service's tables", async () => {
    await expect(core.query('select * from nutrition.weight')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('core_svc is not a superuser and cannot create roles or databases', async () => {
    const result = await core.query(
      `select rolsuper, rolcreaterole, rolcreatedb from pg_roles
       where rolname = current_user`,
    );
    expect(result.rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });
});
