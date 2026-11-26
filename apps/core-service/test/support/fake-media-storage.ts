import type {
  CreateUploadInput,
  MediaStorage,
  UploadTicket,
  VerifyUploadInput,
} from '../../src/modules/media/storage/media-storage';

export class FakeMediaStorage implements MediaStorage {
  readonly removed: string[] = [];
  failRemoval = false;

  createUpload(input: CreateUploadInput): UploadTicket {
    return {
      url: 'https://upload.example.test/v1_1/fake/image/upload',
      fields: {
        public_id: input.key,
        signature: this.signatureOf(input.key, 0),
      },
    };
  }

  verifyUpload(input: VerifyUploadInput): boolean {
    return input.signature === this.signatureOf(input.key, input.version);
  }

  remove(key: string): Promise<void> {
    if (this.failRemoval) {
      return Promise.reject(new Error('storage is down'));
    }
    this.removed.push(key);
    return Promise.resolve();
  }

  signatureOf(key: string, version: number): string {
    return `sig:${key}:${String(version)}`;
  }
}
