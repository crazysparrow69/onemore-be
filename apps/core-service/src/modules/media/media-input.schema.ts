import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MEDIA_PURPOSES } from '../../db/schema/media';
import { createIdParamsDto } from '../../common/validation';

export const createUploadSchema = z
  .strictObject({ purpose: z.enum(MEDIA_PURPOSES) })
  .meta({ id: 'CreateMediaUpload' });

export const completeUploadSchema = z
  .strictObject({
    version: z.number().int().positive(),
    signature: z.string().min(1).max(200),
  })
  .meta({ id: 'CompleteMediaUpload' });

export class CreateUploadDto extends createZodDto(createUploadSchema) {}

export class CompleteUploadDto extends createZodDto(completeUploadSchema) {}

export class MediaIdParamsDto extends createIdParamsDto('MediaIdParams') {}

export type CompleteUpload = z.output<typeof completeUploadSchema>;
