import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appError } from '../../common/errors';
import { uuidV7 } from '../../common/uuid-v7';
import type { Env } from '../../config/env';
import { PG_FOREIGN_KEY_VIOLATION, pgErrorOf } from '../../db/pg-error';
import type { MediaPurpose } from '../../db/schema/media';
import type { AuthUser } from '../auth/auth.types';
import type { CompleteUpload } from './media-input.schema';
import { storageKeyOf } from './media-key';
import type { MediaAsset, MediaUpload } from './media.response';
import { MAX_OPEN_UPLOADS, UPLOAD_LIMITS } from './media.constants';
import { MediaRepository, type MediaRecord } from './media.repository';
import { describeError } from './storage/describe-error';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly media: MediaRepository,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createUpload(
    auth: AuthUser,
    purpose: MediaPurpose,
  ): Promise<MediaUpload> {
    const id = uuidV7();
    const key = storageKeyOf({
      folder: this.config.get('CLOUDINARY_FOLDER', { infer: true }),
      userId: auth.id,
      purpose,
      id,
    });
    let created: boolean;
    try {
      created = await this.media.createPending({
        id,
        ownerId: auth.id,
        purpose,
        storageKey: key,
        limit: MAX_OPEN_UPLOADS,
      });
    } catch (error) {
      if (pgErrorOf(error)?.code === PG_FOREIGN_KEY_VIOLATION) {
        throw appError('PROFILE_REQUIRED');
      }
      throw error;
    }
    if (!created) {
      throw appError('MEDIA_UPLOAD_LIMIT');
    }
    const upload = this.storage.createUpload({
      key,
      maxSide: UPLOAD_LIMITS[purpose].maxSide,
    });
    return { id, purpose, upload };
  }

  async complete(
    auth: AuthUser,
    id: string,
    input: CompleteUpload,
  ): Promise<MediaAsset> {
    const row = await this.media.findOwned(id, auth.id);
    if (!row || row.status === 'trash') {
      throw appError('MEDIA_NOT_FOUND');
    }
    if (row.status !== 'pending') {
      return toAsset(row);
    }
    const valid = this.storage.verifyUpload({
      key: row.storageKey,
      version: input.version,
      signature: input.signature,
    });
    if (!valid) {
      throw appError('MEDIA_SIGNATURE_INVALID');
    }
    const ready = await this.media.markReady(id, auth.id, input.version);
    if (ready) {
      return toAsset(ready);
    }
    const current = await this.media.findOwned(id, auth.id);
    if (!current || current.status === 'trash') {
      throw appError('MEDIA_NOT_FOUND');
    }
    return toAsset(current);
  }

  async claim(
    userId: string,
    id: string,
    purpose: MediaPurpose,
  ): Promise<void> {
    const claimed = await this.media.transition(
      id,
      userId,
      'ready',
      'attached',
      purpose,
    );
    if (claimed) {
      return;
    }
    const row = await this.media.findOwned(id, userId);
    if (!row || row.status === 'trash') {
      throw appError('MEDIA_NOT_FOUND');
    }
    if (row.purpose !== purpose) {
      throw appError('MEDIA_PURPOSE_MISMATCH');
    }
    throw appError(
      row.status === 'pending' ? 'MEDIA_NOT_READY' : 'MEDIA_IN_USE',
    );
  }

  async unclaim(userId: string, id: string): Promise<void> {
    await this.media.transition(id, userId, 'attached', 'ready');
  }

  async release(userId: string, id: string): Promise<void> {
    const row = await this.media.trash(id, userId);
    if (!row) {
      return;
    }
    await this.destroy(row);
  }

  async collectGarbage(
    abandonedBefore: Date,
  ): Promise<{ removed: number; failed: number }> {
    const rows = await this.media.listGarbage(abandonedBefore);
    let removed = 0;
    for (const row of rows) {
      if (await this.destroy(row)) {
        removed += 1;
      }
    }
    return { removed, failed: rows.length - removed };
  }

  private async destroy(row: MediaRecord): Promise<boolean> {
    try {
      await this.storage.remove(row.storageKey);
      await this.media.delete(row.id);
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not remove media ${row.id}: ${describeError(error, 'unknown error')}`,
      );
      return false;
    }
  }
}

function toAsset(row: MediaRecord): MediaAsset {
  return { id: row.id, purpose: row.purpose, key: row.storageKey };
}
