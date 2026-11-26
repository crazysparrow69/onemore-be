import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { PG_FOREIGN_KEY_VIOLATION } from '../../db/pg-error';
import type { MediaRecord, MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import type { MediaStorage } from './storage/media-storage';

const auth = { id: 'user-1', email: 'a@example.test', name: null };

function row(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: 'media-1',
    ownerId: 'user-1',
    purpose: 'avatar',
    storageKey: 'dev/u/user-1/avatar/media-1',
    status: 'pending',
    version: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function setup() {
  const repository = {
    createPending: vi.fn().mockResolvedValue(true),
    findOwned: vi.fn(),
    markReady: vi.fn(),
    transition: vi.fn(),
    trash: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    listGarbage: vi.fn(),
  };
  const storage = {
    createUpload: vi
      .fn()
      .mockReturnValue({ url: 'https://u.test', fields: { a: 'b' } }),
    verifyUpload: vi.fn().mockReturnValue(true),
    remove: vi.fn().mockResolvedValue(undefined),
  } satisfies MediaStorage;
  const config = { get: vi.fn().mockReturnValue('dev') };
  const service = new MediaService(
    repository as unknown as MediaRepository,
    storage,
    config as unknown as ConfigService<never, true>,
  );
  return { repository, storage, service };
}

describe('MediaService.createUpload', () => {
  it('stores a pending row under the user folder and returns the ticket', async () => {
    const { repository, storage, service } = setup();
    const result = await service.createUpload(auth, 'avatar');
    const [saved] = repository.createPending.mock.calls[0] as [
      { id: string; storageKey: string; limit: number },
    ];
    expect(saved.storageKey).toBe(`dev/u/user-1/avatar/${saved.id}`);
    expect(saved.limit).toBe(10);
    expect(storage.createUpload).toHaveBeenCalledWith({
      key: saved.storageKey,
      maxSide: 1024,
    });
    expect(result).toEqual({
      id: saved.id,
      purpose: 'avatar',
      upload: { url: 'https://u.test', fields: { a: 'b' } },
    });
  });

  it('uses the larger side for exercise photos', async () => {
    const { storage, service } = setup();
    await service.createUpload(auth, 'exercise_photo');
    expect(storage.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ maxSide: 1600 }),
    );
  });

  it('answers MEDIA_UPLOAD_LIMIT when too many uploads are open', async () => {
    const { repository, service } = setup();
    repository.createPending.mockResolvedValue(false);
    await expect(service.createUpload(auth, 'avatar')).rejects.toMatchObject({
      response: { code: 'MEDIA_UPLOAD_LIMIT' },
    });
  });

  it('answers PROFILE_REQUIRED when the user row is missing', async () => {
    const { repository, service } = setup();
    repository.createPending.mockRejectedValue({
      code: PG_FOREIGN_KEY_VIOLATION,
    });
    await expect(service.createUpload(auth, 'avatar')).rejects.toMatchObject({
      response: { code: 'PROFILE_REQUIRED' },
    });
  });
});

describe('MediaService.complete', () => {
  it('marks a verified upload ready', async () => {
    const { repository, storage, service } = setup();
    repository.findOwned.mockResolvedValue(row());
    repository.markReady.mockResolvedValue(
      row({ status: 'ready', version: 5 }),
    );
    await expect(
      service.complete(auth, 'media-1', { version: 5, signature: 'sig' }),
    ).resolves.toEqual({
      id: 'media-1',
      purpose: 'avatar',
      key: 'dev/u/user-1/avatar/media-1',
    });
    expect(storage.verifyUpload).toHaveBeenCalledWith({
      key: 'dev/u/user-1/avatar/media-1',
      version: 5,
      signature: 'sig',
    });
  });

  it('rejects a bad signature without changing the row', async () => {
    const { repository, storage, service } = setup();
    repository.findOwned.mockResolvedValue(row());
    storage.verifyUpload.mockReturnValue(false);
    await expect(
      service.complete(auth, 'media-1', { version: 5, signature: 'x' }),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_SIGNATURE_INVALID' } });
    expect(repository.markReady).not.toHaveBeenCalled();
  });

  it('is idempotent for a row that is already ready', async () => {
    const { repository, storage, service } = setup();
    repository.findOwned.mockResolvedValue(
      row({ status: 'ready', version: 5 }),
    );
    await service.complete(auth, 'media-1', { version: 5, signature: 'sig' });
    expect(storage.verifyUpload).not.toHaveBeenCalled();
    expect(repository.markReady).not.toHaveBeenCalled();
  });

  it.each([null, row({ status: 'trash' })])(
    'answers MEDIA_NOT_FOUND for %j',
    async (found) => {
      const { repository, service } = setup();
      repository.findOwned.mockResolvedValue(found);
      await expect(
        service.complete(auth, 'media-1', { version: 5, signature: 'sig' }),
      ).rejects.toMatchObject({ response: { code: 'MEDIA_NOT_FOUND' } });
    },
  );
});

describe('MediaService.claim', () => {
  it('succeeds when the ready row of the owner and purpose moves to attached', async () => {
    const { repository, service } = setup();
    repository.transition.mockResolvedValue(row({ status: 'attached' }));
    await expect(
      service.claim('user-1', 'media-1', 'avatar'),
    ).resolves.toBeUndefined();
    expect(repository.transition).toHaveBeenCalledWith(
      'media-1',
      'user-1',
      'ready',
      'attached',
      'avatar',
    );
  });

  it.each([
    [null, 'MEDIA_NOT_FOUND'],
    [row({ status: 'trash' }), 'MEDIA_NOT_FOUND'],
    [
      row({ status: 'ready', purpose: 'exercise_photo' }),
      'MEDIA_PURPOSE_MISMATCH',
    ],
    [row({ status: 'pending' }), 'MEDIA_NOT_READY'],
    [row({ status: 'attached' }), 'MEDIA_IN_USE'],
  ])('explains a failed claim of %j as %s', async (found, code) => {
    const { repository, service } = setup();
    repository.transition.mockResolvedValue(null);
    repository.findOwned.mockResolvedValue(found);
    await expect(
      service.claim('user-1', 'media-1', 'avatar'),
    ).rejects.toMatchObject({ response: { code } });
  });
});

describe('MediaService.release', () => {
  it('removes the file from the storage and deletes the row', async () => {
    const { repository, storage, service } = setup();
    repository.trash.mockResolvedValue(row({ status: 'trash' }));
    await service.release('user-1', 'media-1');
    expect(storage.remove).toHaveBeenCalledWith('dev/u/user-1/avatar/media-1');
    expect(repository.delete).toHaveBeenCalledWith('media-1');
  });

  it('keeps the trash row and does not throw when the storage is down', async () => {
    const { repository, storage, service } = setup();
    repository.trash.mockResolvedValue(row({ status: 'trash' }));
    storage.remove.mockRejectedValue(new Error('down'));
    await expect(service.release('user-1', 'media-1')).resolves.toBeUndefined();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown id', async () => {
    const { repository, storage, service } = setup();
    repository.trash.mockResolvedValue(null);
    await service.release('user-1', 'nope');
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('MediaService.collectGarbage', () => {
  it('counts removed and failed files', async () => {
    const { repository, storage, service } = setup();
    repository.listGarbage.mockResolvedValue([
      row({ id: 'a' }),
      row({ id: 'b' }),
    ]);
    storage.remove
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('x'));
    await expect(service.collectGarbage(new Date(0))).resolves.toEqual({
      removed: 1,
      failed: 1,
    });
  });
});
