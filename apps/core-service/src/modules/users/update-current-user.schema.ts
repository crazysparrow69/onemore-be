import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UNITS } from '../../db/schema/users';

export const LANGUAGES = ['en', 'uk'] as const;

export const timeZone = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'must be a valid IANA time zone' },
  );

export const updateCurrentUserSchema = z
  .strictObject({
    language: z.enum(LANGUAGES),
    timeZone,
    units: z.enum(UNITS).optional(),
  })
  .meta({ id: 'UpdateCurrentUser' });

export class UpdateCurrentUserDto extends createZodDto(
  updateCurrentUserSchema,
) {}

export type UpdateCurrentUser = z.infer<typeof updateCurrentUserSchema>;
