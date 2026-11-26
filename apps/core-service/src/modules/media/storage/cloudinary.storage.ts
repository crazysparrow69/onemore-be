import { timingSafeEqual } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { UPLOAD_FORMATS } from '../media.constants';
import type {
  CreateUploadInput,
  MediaStorage,
  UploadTicket,
  VerifyUploadInput,
} from './media-storage';

export type CloudinaryOptions = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  now?: () => number;
};

export type CloudinaryUploader = {
  destroy(
    key: string,
    options: Record<string, unknown>,
  ): Promise<{ result?: unknown }>;
};

const REMOVED_RESULTS = ['ok', 'not found'];

export class CloudinaryStorage implements MediaStorage {
  private readonly now: () => number;

  constructor(
    private readonly options: CloudinaryOptions,
    private readonly uploader: CloudinaryUploader = cloudinary.uploader,
  ) {
    this.now = options.now ?? Date.now;
  }

  createUpload(input: CreateUploadInput): UploadTicket {
    const signed = {
      allowed_formats: UPLOAD_FORMATS.join(','),
      overwrite: 'false',
      public_id: input.key,
      timestamp: String(Math.floor(this.now() / 1000)),
      transformation: `c_limit,h_${String(input.maxSide)},w_${String(input.maxSide)}`,
    };
    return {
      url: `https://api.cloudinary.com/v1_1/${this.options.cloudName}/image/upload`,
      fields: {
        ...signed,
        api_key: this.options.apiKey,
        signature: this.sign(signed),
      },
    };
  }

  verifyUpload(input: VerifyUploadInput): boolean {
    const expected = Buffer.from(
      this.sign({ public_id: input.key, version: input.version }),
    );
    const received = Buffer.from(input.signature);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  async remove(key: string): Promise<void> {
    const response = await this.uploader.destroy(key, {
      resource_type: 'image',
      invalidate: true,
      cloud_name: this.options.cloudName,
      api_key: this.options.apiKey,
      api_secret: this.options.apiSecret,
    });
    if (
      typeof response.result !== 'string' ||
      !REMOVED_RESULTS.includes(response.result)
    ) {
      throw new Error('Cloudinary did not delete the file');
    }
  }

  private sign(params: Record<string, string | number>): string {
    return cloudinary.utils.api_sign_request(params, this.options.apiSecret);
  }
}
