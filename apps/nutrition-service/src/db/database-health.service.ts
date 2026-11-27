import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB } from './database.constants';
import type { Database } from './database.module';

@Injectable()
export class DatabaseHealthService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
    await this.db.execute(sql`select 1 from nutrition.body_profiles limit 1`);
  }
}
