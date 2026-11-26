import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ianaTimeZone } from '../../common/validation';
import { LOCALES } from '../../db/schema/locales';
import { UNITS } from '../../db/schema/users';

export const updateCurrentUserSchema = z
  .strictObject({
    language: z.enum(LOCALES),
    timeZone: ianaTimeZone,
    units: z.enum(UNITS).optional(),
  })
  .meta({ id: 'UpdateCurrentUser' });

export class UpdateCurrentUserDto extends createZodDto(
  updateCurrentUserSchema,
) {}

export type UpdateCurrentUser = z.infer<typeof updateCurrentUserSchema>;
