import { sql } from 'drizzle-orm';
import { check, text, timestamp } from 'drizzle-orm/pg-core';
import { coreSchema } from './core-schema';

// user_id is the `sub` of the Neon Auth JWT: a plain column, no FK to neon_auth.
export const accounts = coreSchema.table(
  'accounts',
  {
    userId: text('user_id').primaryKey(),
    units: text('units').notNull(),
    language: text('language').notNull(),
    // IANA time zone name, for example Europe/Kyiv.
    timeZone: text('time_zone').notNull(),
    // Set when onboarding is finished; the web sets it last.
    onboardingCompletedAt: timestamp('onboarding_completed_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [check('accounts_units_check', sql`units in ('kg', 'lb')`)],
);
