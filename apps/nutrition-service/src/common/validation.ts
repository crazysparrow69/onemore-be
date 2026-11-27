import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MAX_NOTES_LENGTH = 1000;

const CONTROL_CHARACTER = /(?![\t\n\r\f\v])\p{Cc}/u;

export function cleanText({ min, max }: { min?: number; max: number }) {
  const trimmed = z.string().trim();
  return (min === undefined ? trimmed : trimmed.min(min))
    .max(max)
    .refine((value) => !CONTROL_CHARACTER.test(value), {
      message: 'must not contain control characters',
    })
    .transform((value) => value.replace(/\s+/g, ' '));
}

export function optionalText(max: number) {
  return cleanText({ max })
    .nullable()
    .default(null)
    .transform((value) =>
      value === null || value.length === 0 ? null : value,
    );
}

export const localDate = z.iso.date();

export function idParams(name: string) {
  return z.object({ id: z.uuid() }).meta({ id: name });
}

export function createIdParamsDto(name: string) {
  return createZodDto(idParams(name));
}
