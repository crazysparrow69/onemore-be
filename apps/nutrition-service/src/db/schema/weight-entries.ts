import { sql } from 'drizzle-orm';
import { check, date, numeric, text, unique, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { nutritionSchema } from './nutrition-schema';

export const weightEntries = nutritionSchema.table(
  'weight_entries',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    weightKg: numeric('weight_kg', {
      precision: 7,
      scale: 3,
      mode: 'number',
    }).notNull(),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    unique('weight_entries_user_date_unique').on(table.userId, table.localDate),
    check(
      'weight_entries_weight_check',
      sql`${table.weightKg} between 20 and 400`,
    ),
    check(
      'weight_entries_note_check',
      sql`${table.note} is null or char_length(${table.note}) <= 200`,
    ),
  ],
);
