export const LOCALES = ['en', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];

export const FALLBACK_LOCALE: Locale = 'en';

export function toLocale(language: string | null | undefined): Locale {
  return LOCALES.find((locale) => locale === language) ?? FALLBACK_LOCALE;
}
