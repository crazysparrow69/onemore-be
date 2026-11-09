import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LANGUAGES = ['en'] as const;

const timeZone = z
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

export const updateMeSchema = z.strictObject({
  language: z.enum(LANGUAGES),
  timeZone,
});

export class UpdateMeDto extends createZodDto(updateMeSchema) {}

export type UpdateMe = z.infer<typeof updateMeSchema>;
