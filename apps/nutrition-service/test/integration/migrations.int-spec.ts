import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrator';
import { firstRow } from '../support/rows';
import { NUTRITION_URL, startPostgres } from '../support/nutrition-app';

const repoRoot = join(process.cwd(), '..', '..');
const migrationsFolder = join(process.cwd(), 'src', 'db', 'migrations');

const USER = 'user-a';

describe('nutrition schema, role and migrations (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let url: string;
  let admin: Pool;
  let service: Pool;

  beforeAll(async () => {
    container = await startPostgres({ withCore: true });
    url = NUTRITION_URL(container);
    admin = new Pool({ connectionString: container.getConnectionUri() });
    service = new Pool({ connectionString: url });
  });

  afterAll(async () => {
    await service?.end();
    await admin?.end();
    await container?.stop();
  });

  it('applies migrations as nutrition_svc; two deploys at once are safe', async () => {
    await Promise.all([
      runMigrations(url, migrationsFolder),
      runMigrations(url, migrationsFolder),
    ]);

    const journal = await service.query<{ n: number }>(
      'select count(*)::int as n from nutrition.__drizzle_migrations',
    );
    expect(firstRow(journal).n).toBe(1);
  });

  it('is idempotent: running again changes nothing', async () => {
    await runMigrations(url, migrationsFolder);

    const journal = await service.query<{ n: number }>(
      'select count(*)::int as n from nutrition.__drizzle_migrations',
    );
    expect(firstRow(journal).n).toBe(1);
  });

  it('creates the six tables of the schema', async () => {
    const tables = await service.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'nutrition' and table_name not like '\\_\\_%'
       order by table_name`,
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      'body_profiles',
      'food_entries',
      'goals',
      'target_snapshots',
      'user_foods',
      'weight_entries',
    ]);
  });

  it('passes the isolation check of verify-nutrition.sql', async () => {
    const script = readFileSync(
      join(repoRoot, 'infra/db/verify-nutrition.sql'),
      'utf8',
    )
      .split('\n')
      .filter((line) => !line.startsWith('\\'))
      .join('\n');

    await expect(service.query(script)).resolves.toBeDefined();
  });

  it('keeps the core schema closed to nutrition_svc', async () => {
    await admin.query('create table core.probe (id integer)');

    await expect(service.query('select * from core.probe')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      service.query('create table core.stolen (id integer)'),
    ).rejects.toThrow(/permission denied/);
  });

  it('allows only male or female and the five activity levels', async () => {
    await expect(
      service.query(
        `insert into nutrition.body_profiles
           (user_id, sex, birth_date, height_cm, activity_level)
         values ('x', 'other', '1990-01-01', 180, 'light')`,
      ),
    ).rejects.toThrow(/body_profiles_sex_check/);
    await expect(
      service.query(
        `insert into nutrition.body_profiles
           (user_id, sex, birth_date, height_cm, activity_level)
         values ('x', 'male', '1990-01-01', 180, 'extreme')`,
      ),
    ).rejects.toThrow(/body_profiles_activity_check/);
  });

  it('needs a rate for lose and gain and none for maintain', async () => {
    await expect(
      service.query(
        `insert into nutrition.goals (id, user_id, type, effective_from)
         values (gen_random_uuid(), $1, 'lose', '2026-11-01')`,
        [USER],
      ),
    ).rejects.toThrow(/goals_rate_presence_check/);
    await expect(
      service.query(
        `insert into nutrition.goals
           (id, user_id, type, rate_kg_per_week, effective_from)
         values (gen_random_uuid(), $1, 'maintain', 0.5, '2026-11-01')`,
        [USER],
      ),
    ).rejects.toThrow(/goals_rate_presence_check/);
    await expect(
      service.query(
        `insert into nutrition.goals
           (id, user_id, type, rate_kg_per_week, effective_from)
         values (gen_random_uuid(), $1, 'gain', 1.5, '2026-11-01')`,
        [USER],
      ),
    ).rejects.toThrow(/goals_rate_range_check/);
  });

  it('keeps one goal, one weight and one target per user and day', async () => {
    await service.query(
      `insert into nutrition.goals (id, user_id, type, effective_from)
       values (gen_random_uuid(), $1, 'maintain', '2026-11-01')`,
      [USER],
    );
    await expect(
      service.query(
        `insert into nutrition.goals (id, user_id, type, effective_from)
         values (gen_random_uuid(), $1, 'recomp', '2026-11-01')`,
        [USER],
      ),
    ).rejects.toThrow(/goals_user_effective_from_unique/);

    await service.query(
      `insert into nutrition.weight_entries (id, user_id, local_date, weight_kg)
       values (gen_random_uuid(), $1, '2026-11-01', 80)`,
      [USER],
    );
    await expect(
      service.query(
        `insert into nutrition.weight_entries (id, user_id, local_date, weight_kg)
         values (gen_random_uuid(), $1, '2026-11-01', 81)`,
        [USER],
      ),
    ).rejects.toThrow(/weight_entries_user_date_unique/);
    await expect(
      service.query(
        `insert into nutrition.weight_entries (id, user_id, local_date, weight_kg)
         values (gen_random_uuid(), $1, '2026-11-02', 19)`,
        [USER],
      ),
    ).rejects.toThrow(/weight_entries_weight_check/);
  });

  it('ties the target source to the formula fields', async () => {
    await expect(
      service.query(
        `insert into nutrition.target_snapshots
           (id, user_id, effective_from, source, calories_kcal, protein_g, fat_g, carbs_g)
         values (gen_random_uuid(), $1, '2026-11-01', 'auto', 2000, 100, 60, 200)`,
        [USER],
      ),
    ).rejects.toThrow(/target_snapshots_source_shape_check/);
    await expect(
      service.query(
        `insert into nutrition.target_snapshots
           (id, user_id, effective_from, source, calories_kcal, protein_g, fat_g, carbs_g,
            formula_version, inputs)
         values (gen_random_uuid(), $1, '2026-11-01', 'manual', 2000, 100, 60, 200,
                 1, '{}')`,
        [USER],
      ),
    ).rejects.toThrow(/target_snapshots_source_shape_check/);
    await expect(
      service.query(
        `insert into nutrition.target_snapshots
           (id, user_id, effective_from, source, calories_kcal, protein_g, fat_g, carbs_g)
         values (gen_random_uuid(), $1, '2026-11-01', 'manual', 700, 100, 60, 200)`,
        [USER],
      ),
    ).rejects.toThrow(/target_snapshots_calories_check/);
  });

  it('takes a food entry with calories only, but amount and unit together', async () => {
    await service.query(
      `insert into nutrition.food_entries
         (id, user_id, local_date, meal, name, calories_kcal, source)
       values (gen_random_uuid(), $1, '2026-11-01', 'snack', 'Кава з молоком', 60, 'manual')`,
      [USER],
    );
    await expect(
      service.query(
        `insert into nutrition.food_entries
           (id, user_id, local_date, meal, name, amount, calories_kcal, source)
         values (gen_random_uuid(), $1, '2026-11-01', 'snack', 'Кава', 200, 60, 'manual')`,
        [USER],
      ),
    ).rejects.toThrow(/food_entries_amount_check/);
    await expect(
      service.query(
        `insert into nutrition.food_entries
           (id, user_id, local_date, meal, name, calories_kcal, source)
         values (gen_random_uuid(), $1, '2026-11-01', 'brunch', 'Кава', 60, 'manual')`,
        [USER],
      ),
    ).rejects.toThrow(/food_entries_meal_check/);
  });

  it('removes a suggestion without touching the entries that used it', async () => {
    const food = await service.query<{ id: string }>(
      `insert into nutrition.user_foods
         (id, user_id, name, name_key, calories_kcal, last_used_at)
       values (gen_random_uuid(), $1, 'Борщ', 'борщ', 250, now()) returning id`,
      [USER],
    );
    const foodId = firstRow(food).id;
    const entry = await service.query<{ id: string }>(
      `insert into nutrition.food_entries
         (id, user_id, local_date, meal, name, calories_kcal, source, user_food_id)
       values (gen_random_uuid(), $1, '2026-11-02', 'lunch', 'Борщ', 250, 'manual', $2)
       returning id`,
      [USER, foodId],
    );

    await service.query('delete from nutrition.user_foods where id = $1', [
      foodId,
    ]);

    const left = await service.query<{ user_food_id: string | null }>(
      'select user_food_id from nutrition.food_entries where id = $1',
      [firstRow(entry).id],
    );
    expect(firstRow(left).user_food_id).toBeNull();
  });
});
