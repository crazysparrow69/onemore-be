import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

export type PopularityRecount = { changed: number; removed: number };

export async function recountPopularity(
  connectionString: string,
): Promise<PopularityRecount> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    return await drizzle(pool).transaction(async (tx) => {
      const upserted = await tx.execute(sql`
        insert into core.exercise_stats (exercise_id, users_count)
        select se.exercise_id, count(distinct ws.owner_id)::int
        from core.session_exercises se
        join core.workout_sessions ws on ws.id = se.session_id
        group by se.exercise_id
        on conflict (exercise_id) do update
          set users_count = excluded.users_count
          where core.exercise_stats.users_count is distinct from excluded.users_count
        returning exercise_id`);
      const removed = await tx.execute(sql`
        delete from core.exercise_stats s
        where not exists (
          select 1 from core.session_exercises se where se.exercise_id = s.exercise_id
        )
        returning exercise_id`);
      return { changed: upserted.rows.length, removed: removed.rows.length };
    });
  } finally {
    await pool.end();
  }
}
