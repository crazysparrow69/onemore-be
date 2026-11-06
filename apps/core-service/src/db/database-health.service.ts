import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB } from './database.constants';
import type { Database } from './database.module';

@Injectable()
export class DatabaseHealthService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Throws if the database is unreachable. */
  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
