import { sql } from 'drizzle-orm';
import {
  check,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const coreSchema = pgSchema('core');

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const UNITS = ['kg', 'lb'] as const;
export type Units = (typeof UNITS)[number];

export const users = coreSchema.table(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    nickname: text('nickname'),
    role: text('role').notNull().default('user'),
    language: text('language').notNull(),
    units: text('units').notNull().default('kg'),
    timeZone: text('time_zone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('users_role_check', sql`role in ('user', 'admin')`),
    check('users_units_check', sql`units in ('kg', 'lb')`),
    uniqueIndex('users_nickname_unique').on(table.nickname),
  ],
);
