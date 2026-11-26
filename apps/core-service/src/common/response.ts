import { z } from 'zod';

export const instantResponse = z.string().meta({ format: 'date-time' });

export const dateResponse = z.string().meta({ format: 'date' });

export function pageResponse<T extends z.ZodType>(item: T, id: string) {
  return z
    .object({
      items: z.array(item),
      total: z.number().int(),
      nextOffset: z.number().int().nullable(),
    })
    .meta({ id });
}
