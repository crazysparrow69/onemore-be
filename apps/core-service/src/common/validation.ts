import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MAX_NAME_LENGTH = 80;
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

export function emptyToNull(value: string | null): string | null {
  return value === null || value.length === 0 ? null : value;
}

export const optionalNotes = z
  .string()
  .trim()
  .max(MAX_NOTES_LENGTH)
  .refine((value) => !CONTROL_CHARACTER.test(value), {
    message: 'must not contain control characters',
  })
  .nullable()
  .default(null)
  .transform(emptyToNull);

export const ianaTimeZone = z
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

export const instant = z.iso.datetime({ offset: true });

export function idParams(name: string) {
  return z.object({ id: z.uuid() }).meta({ id: name });
}

export function createIdParamsDto(name: string) {
  return createZodDto(idParams(name));
}

export function paginationShape(options: {
  defaultLimit: number;
  maxLimit: number;
}) {
  return {
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(options.maxLimit)
      .default(options.defaultLimit),
  };
}

export function commaList<T extends z.ZodType<unknown, string>>(
  item: T,
  options: { min?: number; max: number },
) {
  const list = z.array(item);
  return z
    .string()
    .transform((value) => [
      ...new Set(value.split(',').filter((part) => part.length > 0)),
    ])
    .pipe(
      (options.min === undefined ? list : list.min(options.min)).max(
        options.max,
      ),
    );
}
