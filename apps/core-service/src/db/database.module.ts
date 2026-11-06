import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../config/env';
import { DatabaseHealthService } from './database-health.service';
import { DB, PG_POOL } from './database.constants';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

// One small pool per Cloud Run instance (the Neon pooler multiplexes the rest).
const POOL_MAX = 5;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Pool => {
        const pool = new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: POOL_MAX,
        });
        // An error on an idle client must not crash the process.
        pool.on('error', (error) => {
          new Logger('Database').error(`Idle client error: ${error.message}`);
        });
        return pool;
      },
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    DatabaseHealthService,
  ],
  exports: [DB, DatabaseHealthService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
