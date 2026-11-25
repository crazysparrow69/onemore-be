import { z } from 'zod';

export const BASE_LOCALE = 'en';

export const NAME_MAX_LENGTH = 200;
export const ALIASES_MAX = 10;

const aliases = z.array(z.string().trim().min(1).max(100)).max(ALIASES_MAX);

export const fullTranslationSchema = z.strictObject({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  instructions: z.array(z.string().trim().min(1)),
  aliases: aliases.default([]),
});

export const baseTranslationSchema = z.strictObject({
  aliases,
});

export const fullTranslationFileSchema = z.record(
  z.string(),
  fullTranslationSchema,
);
export const baseTranslationFileSchema = z.record(
  z.string(),
  baseTranslationSchema,
);

export type FullTranslation = z.infer<typeof fullTranslationSchema>;
