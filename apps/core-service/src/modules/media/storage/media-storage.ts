export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export type UploadTicket = {
  url: string;
  fields: Record<string, string>;
};

export type CreateUploadInput = {
  key: string;
  maxSide: number;
};

export type VerifyUploadInput = {
  key: string;
  version: number;
  signature: string;
};

export type MediaStorage = {
  createUpload(input: CreateUploadInput): UploadTicket;
  verifyUpload(input: VerifyUploadInput): boolean;
  remove(key: string): Promise<void>;
};
