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

    expect(await appliedMigrations()).toBe(6);
  });

  it('is idempotent: running again changes nothing', async () => {
    await runMigrations(coreUrl, migrationsFolder);

    expect(await appliedMigrations()).toBe(6);
  });

  it('drops the unused core.accounts table', async () => {
    const result = await core.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema = 'core' and table_name = 'accounts'`,
    );
    expect(result.rows).toEqual([{ n: 0 }]);
  });

  it('creates core.users with the expected columns', async () => {
    const result = await core.query(
      `select column_name, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'core' and table_name = 'users'
       order by column_name`,
    );
    expect(result.rows).toEqual([
      { column_name: 'created_at', is_nullable: 'NO', column_default: 'now()' },
      { column_name: 'email', is_nullable: 'NO', column_default: null },
      { column_name: 'id', is_nullable: 'NO', column_default: null },
      { column_name: 'language', is_nullable: 'NO', column_default: null },
      { column_name: 'name', is_nullable: 'YES', column_default: null },
      { column_name: 'nickname', is_nullable: 'YES', column_default: null },
      {
        column_name: 'role',
        is_nullable: 'NO',
        column_default: "'user'::text",
      },
      { column_name: 'time_zone', is_nullable: 'NO', column_default: null },
      {
        column_name: 'units',
        is_nullable: 'NO',
        column_default: "'kg'::text",
      },
      { column_name: 'updated_at', is_nullable: 'NO', column_default: 'now()' },
    ]);
  });

  it('users defaults role to user, rejects other roles, and keeps email unique', async () => {
    await core.query(
      `insert into core.users (id, email, language, time_zone)
       values ('user-a', 'a@example.com', 'en', 'Europe/Kyiv')`,
    );
    const inserted = await core.query<{ role: string }>(
      `select role from core.users where id = 'user-a'`,
    );
    expect(inserted.rows[0]?.role).toBe('user');

    await expect(
      core.query(
        `insert into core.users (id, email, role, language, time_zone)
         values ('user-b', 'b@example.com', 'owner', 'en', 'Europe/Kyiv')`,
      ),
    ).rejects.toThrow(/users_role_check/);

    await expect(
      core.query(
        `insert into core.users (id, email, language, time_zone)
         values ('user-c', 'a@example.com', 'en', 'Europe/Kyiv')`,
      ),
    ).rejects.toThrow(/users_email_unique/);
  });

  it('users defaults units to kg and rejects other units', async () => {
    await core.query(
      `insert into core.users (id, email, language, time_zone)
       values ('user-u1', 'u1@example.com', 'en', 'Europe/Kyiv')`,
    );
    const inserted = await core.query<{ units: string }>(
      `select units from core.users where id = 'user-u1'`,
    );
    expect(inserted.rows[0]?.units).toBe('kg');

    await expect(
      core.query(
        `insert into core.users (id, email, units, language, time_zone)
         values ('user-u2', 'u2@example.com', 'stone', 'en', 'Europe/Kyiv')`,
      ),
    ).rejects.toThrow(/users_units_check/);
  });

  it('users keep nicknames unique and allow many without one', async () => {
    await core.query(
      `insert into core.users (id, email, nickname, language, time_zone)
       values ('user-n1', 'n1@example.com', 'ada', 'en', 'Europe/Kyiv')`,
    );
    await expect(
      core.query(
        `insert into core.users (id, email, nickname, language, time_zone)
         values ('user-n2', 'n2@example.com', 'ada', 'en', 'Europe/Kyiv')`,
      ),
    ).rejects.toThrow(/users_nickname_unique/);

    await core.query(
      `insert into core.users (id, email, language, time_zone)
       values ('user-n3', 'n3@example.com', 'en', 'Europe/Kyiv'),
              ('user-n4', 'n4@example.com', 'en', 'Europe/Kyiv')`,
    );
  });

  it('exercises enforce source, owner, muscles and slugs', async () => {
    const insert = (columns: string, values: string) =>
      core.query(
        `insert into core.exercises (id, ${columns}) values (gen_random_uuid(), ${values})`,
      );
    const system = `source, source_id, visibility, type, primary_muscles, secondary_muscles, equipment`;

    await insert(
      system,
      `'free-exercise-db', 'Ok', 'public', 'weight_reps', array['chest'], array['triceps'], 'barbell'`,
    );

    await expect(
      insert(
        system,
        `'free-exercise-db', 'Ok', 'public', 'weight_reps', array['chest'], array[]::text[], 'barbell'`,
      ),
    ).rejects.toThrow(/exercises_source_source_id_unique/);
    await expect(
      insert(
        system,
        `'free-exercise-db', 'Wing', 'public', 'weight_reps', array['wings'], array[]::text[], 'none'`,
      ),
    ).rejects.toThrow(/exercises_primary_muscles_check/);
    await expect(
      insert(
        system,
        `'free-exercise-db', 'Empty', 'public', 'weight_reps', array[]::text[], array[]::text[], 'none'`,
      ),
    ).rejects.toThrow(/exercises_primary_muscles_check/);
    await expect(
      insert(
        system,
        `'free-exercise-db', 'Overlap', 'public', 'weight_reps', array['chest'], array['chest'], 'none'`,
      ),
    ).rejects.toThrow(/exercises_secondary_muscles_check/);
    await expect(
      insert(
        system,
        `'free-exercise-db', 'CardioSecondary', 'public', 'duration', array['chest'], array['cardio'], 'none'`,
      ),
    ).rejects.toThrow(/exercises_secondary_muscles_check/);
    await expect(
      insert(
        system,
        `'free-exercise-db', 'Rocket', 'public', 'weight_reps', array['chest'], array[]::text[], 'rocket'`,
      ),
    ).rejects.toThrow(/exercises_equipment_check/);
    await expect(
      insert(
        system,
        `'free-exercise-db', 'Swim', 'public', 'swimming', array['chest'], array[]::text[], 'none'`,
      ),
    ).rejects.toThrow(/exercises_type_check/);
    await expect(
      insert(
        system,
        `'free-exercise-db', 'Hidden', 'private', 'weight_reps', array['chest'], array[]::text[], 'none'`,
      ),
    ).rejects.toThrow(/exercises_owner_check/);

    await core.query(
      `insert into core.users (id, email, language, time_zone)
       values ('user-e1', 'e1@example.com', 'en', 'Europe/Kyiv')`,
    );
    await insert(
      `owner_id, ${system}`,
      `'user-e1', 'user', null, 'private', 'duration', array['other'], array[]::text[], 'none'`,
    );
    await expect(
      insert(
        `owner_id, ${system}`,
        `'user-e1', 'free-exercise-db', 'Mine', 'private', 'duration', array['other'], array[]::text[], 'none'`,
      ),
    ).rejects.toThrow(/exercises_owner_check/);
  });

  it('exercise translations accept only known locales and go with the exercise', async () => {
    const created = await core.query<{ id: string }>(
      `insert into core.exercises (id, source, source_id, visibility, type, primary_muscles)
       values (gen_random_uuid(), 'onemore', 'Burpee', 'public', 'bodyweight_reps', array['full_body'])
       returning id`,
    );
    const id = created.rows[0].id;

    await core.query(
      `insert into core.exercise_translations (exercise_id, locale, name)
       values ($1, 'en', 'Burpee'), ($1, 'uk', 'Берпі')`,
      [id],
    );
    await expect(
      core.query(
        `insert into core.exercise_translations (exercise_id, locale, name)
         values ($1, 'de', 'Burpee')`,
        [id],
      ),
    ).rejects.toThrow(/exercise_translations_locale_check/);

    await core.query('delete from core.exercises where id = $1', [id]);
    const left = await core.query<{ n: number }>(
      'select count(*)::int as n from core.exercise_translations where exercise_id = $1',
      [id],
    );
    expect(left.rows[0].n).toBe(0);
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
