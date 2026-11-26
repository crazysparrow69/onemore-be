import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { coreSchema } from './core-schema';
import { users } from './users';

export const MEDIA_PURPOSES = ['avatar', 'exercise_photo'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_STATUSES = [
  'pending',
  'ready',
  'attached',
  'trash',
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const mediaAssets = coreSchema.table(
  'media_assets',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').$type<MediaPurpose>().notNull(),
    storageKey: text('storage_key').notNull().unique(),
    status: text('status').$type<MediaStatus>().notNull(),
    version: integer('version'),
    ...timestamps,
  },
  (table) => [
    index('media_assets_owner_status_idx').on(table.ownerId, table.status),
    index('media_assets_status_updated_idx').on(table.status, table.updatedAt),
    check(
      'media_assets_purpose_check',
      sql`${table.purpose} in ('avatar', 'exercise_photo')`,
    ),
    check(
      'media_assets_status_check',
      sql`${table.status} in ('pending', 'ready', 'attached', 'trash')`,
    ),
    check(
      'media_assets_version_check',
      sql`${table.status} = 'pending' or ${table.version} is not null`,
    ),
  ],
);
