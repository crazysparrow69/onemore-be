import { Inject, Injectable } from '@nestjs/common';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { appError } from '../../common/errors';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
import { PG_UNIQUE_VIOLATION, pgErrorOf } from '../../db/pg-error';
import { mediaAssets } from '../../db/schema/media';
import { users, type Units } from '../../db/schema/users';

export type UserRecord = typeof users.$inferSelect & {
  avatarKey: string | null;
};

export type UpsertUser = {
  id: string;
  email: string;
  name?: string | null;
  language: string;
  timeZone: string;
  units?: Units;
};

export type UserPatch = Partial<
  Pick<
    UserRecord,
    'name' | 'nickname' | 'language' | 'units' | 'timeZone' | 'avatarId'
  >
>;

const EMAIL_UNIQUE = 'users_email_unique';
const NICKNAME_UNIQUE = 'users_nickname_unique';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select({
        ...getTableColumns(users),
        avatarKey: sql<string | null>`${mediaAssets.storageKey}`,
      })
      .from(users)
      .leftJoin(mediaAssets, eq(mediaAssets.id, users.avatarId))
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  async upsert(input: UpsertUser): Promise<UserRecord> {
    const { id, email, name, language, timeZone, units } = input;
    try {
      const [row] = await this.db
        .insert(users)
        .values({ id, email, name: name ?? null, language, timeZone, units })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, language, timeZone, units, updatedAt: new Date() },
        })
        .returning({ id: users.id });
      const saved = row ? await this.findById(row.id) : null;
      if (!saved) {
        throw new Error('upsert returned no row');
      }
      return saved;
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async update(id: string, patch: UserPatch): Promise<UserRecord | null> {
    try {
      const [row] = await this.db
        .update(users)
        .set(patch)
        .where(eq(users.id, id))
        .returning({ id: users.id });
      return row ? await this.findById(row.id) : null;
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }
}

function translateUniqueViolation(error: unknown): unknown {
  const pg = pgErrorOf(error);
  if (pg?.code !== PG_UNIQUE_VIOLATION) {
    return error;
  }
  switch (pg.constraint) {
    case NICKNAME_UNIQUE:
      return appError('NICKNAME_TAKEN');
    case EMAIL_UNIQUE:
      return appError('EMAIL_TAKEN');
    default:
      return appError('CONFLICT');
  }
}
