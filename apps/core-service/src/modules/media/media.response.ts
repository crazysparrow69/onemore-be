import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MEDIA_PURPOSES } from '../../db/schema/media';

export const mediaUploadSchema = z
  .object({
    id: z.uuid(),
    purpose: z.enum(MEDIA_PURPOSES),
    upload: z.object({
      url: z.url(),
      fields: z.record(z.string(), z.string()),
    }),
  })
  .meta({ id: 'MediaUpload' });

export const mediaAssetSchema = z
  .object({
    id: z.uuid(),
    purpose: z.enum(MEDIA_PURPOSES),
    key: z.string(),
  })
  .meta({ id: 'MediaAsset' });

export class MediaUploadDto extends createZodDto(mediaUploadSchema) {}

export class MediaAssetDto extends createZodDto(mediaAssetSchema) {}

export type MediaUpload = z.infer<typeof mediaUploadSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
