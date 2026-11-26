import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LOCALES } from '../../db/schema/locales';
import { UNITS } from '../../db/schema/users';
import { emptyToNull, ianaTimeZone } from '../../common/validation';

export const NICKNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const name = z.string().trim().max(100).nullable().transform(emptyToNull);

const nickname = z
  .string()
  .trim()
  .toLowerCase()
  .nullable()
  .transform(emptyToNull)
  .refine((value) => value === null || NICKNAME_PATTERN.test(value), {
    message: 'must be 3-20 characters: a-z, 0-9 and _',
  });

export const patchCurrentUserSchema = z
  .strictObject({
    name: name.optional(),
    nickname: nickname.optional(),
    language: z.enum(LOCALES).optional(),
    units: z.enum(UNITS).optional(),
    timeZone: ianaTimeZone.optional(),
    avatarId: z.uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      Object.values<unknown>(value).some((field) => field !== undefined),
    {
      message: 'must contain at least one field',
    },
  )
  .meta({ id: 'PatchCurrentUser' });

export class PatchCurrentUserDto extends createZodDto(patchCurrentUserSchema) {}

export type PatchCurrentUser = z.infer<typeof patchCurrentUserSchema>;
