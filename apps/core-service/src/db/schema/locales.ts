export const LOCALES = ['en', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];
