import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import type { Database } from '../../db/database.module';
import { DB } from '../../db/database.constants';
import { users, type Units } from '../../db/schema/users';

export type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: string;
  language: string;
  units: string;
  timeZone: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertUser = {
  id: string;
  email: string;
  name?: string | null;
  language: string;
  timeZone: string;
  units?: Units;
};

export type UserPatch = {
  name?: string | null;
  nickname?: string | null;
  language?: string;
  units?: Units;
  timeZone?: string;
};

const EMAIL_UNIQUE = 'users_email_unique';
const NICKNAME_UNIQUE = 'users_nickname_unique';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async upsert(input: UpsertUser): Promise<UserRecord> {
    try {
      const [row] = await this.db
        .insert(users)
        .values({
          id: input.id,
          email: input.email,
          name: input.name ?? null,
          language: input.language,
          timeZone: input.timeZone,
          ...(input.units === undefined ? {} : { units: input.units }),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: input.email,
            language: input.language,
            timeZone: input.timeZone,
            ...(input.units === undefined ? {} : { units: input.units }),
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) {
        throw new Error('upsert returned no row');
      }
      return toRecord(row);
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async update(id: string, patch: UserPatch): Promise<UserRecord | null> {
    try {
      const [row] = await this.db
        .update(users)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      return row ? toRecord(row) : null;
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }
}

function toRecord(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    nickname: row.nickname,
    role: row.role,
    language: row.language,
    units: row.units,
    timeZone: row.timeZone,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function translateUniqueViolation(error: unknown): unknown {
  const constraint = uniqueViolationConstraint(error);
  if (constraint === NICKNAME_UNIQUE) {
    return new AppException(
      HttpStatus.CONFLICT,
      'NICKNAME_TAKEN',
      'Nickname is already used',
    );
  }
  if (constraint !== undefined) {
    return new AppException(
      HttpStatus.CONFLICT,
      'EMAIL_TAKEN',
      'Email is already used',
    );
  }
  return error;
}

function uniqueViolationConstraint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if ('code' in error && error.code === '23505') {
    const name =
      'constraint' in error && typeof error.constraint === 'string'
        ? error.constraint
        : EMAIL_UNIQUE;
    return name;
  }
  return 'cause' in error ? uniqueViolationConstraint(error.cause) : undefined;
}
