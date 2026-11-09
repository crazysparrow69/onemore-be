import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import type { Database } from '../../db/database.module';
import { DB } from '../../db/database.constants';
import { users } from '../../db/schema/users';

export type UserRecord = {
  id: string;
  email: string;
  role: string;
  language: string;
  timeZone: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertUser = {
  id: string;
  email: string;
  language: string;
  timeZone: string;
};

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
          language: input.language,
          timeZone: input.timeZone,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: input.email,
            language: input.language,
            timeZone: input.timeZone,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) {
        throw new Error('upsert returned no row');
      }
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'EMAIL_TAKEN',
          'Email is already used',
        );
      }
      throw error;
    }
  }
}

function toRecord(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    language: row.language,
    timeZone: row.timeZone,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if ('code' in error && error.code === '23505') {
    return true;
  }
  return 'cause' in error && isUniqueViolation(error.cause);
}
