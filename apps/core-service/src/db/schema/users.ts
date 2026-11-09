import { sql } from 'drizzle-orm';
import { check, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const coreSchema = pgSchema('core');

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = coreSchema.table(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    role: text('role').notNull().default('user'),
    language: text('language').notNull(),
    timeZone: text('time_zone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [check('users_role_check', sql`role in ('user', 'admin')`)],
);
