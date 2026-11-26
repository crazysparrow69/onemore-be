import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
import { lockXact } from '../../db/locks';
import {
  mediaAssets,
  type MediaPurpose,
  type MediaStatus,
} from '../../db/schema/media';

export type MediaRecord = typeof mediaAssets.$inferSelect;

export type NewMedia = {
  id: string;
  ownerId: string;
  purpose: MediaPurpose;
  storageKey: string;
  limit: number;
};

const OPEN_STATUSES: MediaStatus[] = ['pending', 'ready'];

@Injectable()
export class MediaRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createPending(media: NewMedia): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockXact(tx, `media-uploads:${media.ownerId}`);
      const [counted] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.ownerId, media.ownerId),
            inArray(mediaAssets.status, OPEN_STATUSES),
          ),
        );
      if ((counted?.total ?? 0) >= media.limit) {
        return false;
      }
      await tx.insert(mediaAssets).values({
        id: media.id,
        ownerId: media.ownerId,
        purpose: media.purpose,
        storageKey: media.storageKey,
        status: 'pending',
      });
      return true;
    });
  }

  async findOwned(id: string, ownerId: string): Promise<MediaRecord | null> {
    const [row] = await this.db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.ownerId, ownerId)))
      .limit(1);
    return row ?? null;
  }

  async markReady(
    id: string,
    ownerId: string,
    version: number,
  ): Promise<MediaRecord | null> {
    const [row] = await this.db
      .update(mediaAssets)
      .set({ status: 'ready', version })
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.ownerId, ownerId),
          eq(mediaAssets.status, 'pending'),
        ),
      )
      .returning();
    return row ?? null;
  }

  async transition(
    id: string,
    ownerId: string,
    from: MediaStatus,
    to: MediaStatus,
    purpose?: MediaPurpose,
  ): Promise<MediaRecord | null> {
    const [row] = await this.db
      .update(mediaAssets)
      .set({ status: to })
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.ownerId, ownerId),
          eq(mediaAssets.status, from),
          purpose === undefined ? undefined : eq(mediaAssets.purpose, purpose),
        ),
      )
      .returning();
    return row ?? null;
  }

  async trash(id: string, ownerId: string): Promise<MediaRecord | null> {
    const [row] = await this.db
      .update(mediaAssets)
      .set({ status: 'trash' })
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.ownerId, ownerId),
          inArray(mediaAssets.status, ['attached', 'ready', 'trash']),
        ),
      )
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  }

  async listGarbage(abandonedBefore: Date): Promise<MediaRecord[]> {
    return this.db
      .select()
      .from(mediaAssets)
      .where(
        sql`${mediaAssets.status} = 'trash' or (${mediaAssets.status} in ('pending', 'ready') and ${lt(mediaAssets.updatedAt, abandonedBefore)})`,
      );
  }
}
