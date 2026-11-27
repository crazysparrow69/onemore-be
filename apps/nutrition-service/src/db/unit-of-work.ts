import { Inject, Injectable } from '@nestjs/common';
import { DB } from './database.constants';
import type { Database } from './database.module';
import type { Executor, Transaction } from './executor';

@Injectable()
export class UnitOfWork {
  constructor(@Inject(DB) private readonly db: Database) {}

  get reader(): Executor {
    return this.db;
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }
}
