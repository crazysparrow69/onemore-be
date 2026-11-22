import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UNITS } from '../../db/schema/users';
import { LANGUAGES, timeZone } from './update-current-user.schema';

export const NICKNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const name = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value));

const nickname = z
  .string()
  .trim()
  .toLowerCase()
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value))
  .refine((value) => value === null || NICKNAME_PATTERN.test(value), {
    message: 'must be 3-20 characters: a-z, 0-9 and _',
  });

export const patchCurrentUserSchema = z
  .strictObject({
    name: name.optional(),
    nickname: nickname.optional(),
    language: z.enum(LANGUAGES).optional(),
    units: z.enum(UNITS).optional(),
    timeZone: timeZone.optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'must contain at least one field',
    },
  )
  .meta({ id: 'PatchCurrentUser' });

export class PatchCurrentUserDto extends createZodDto(patchCurrentUserSchema) {}

export type PatchCurrentUser = z.infer<typeof patchCurrentUserSchema>;
