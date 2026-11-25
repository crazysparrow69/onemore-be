import type { Equipment, PrimaryMuscle } from '../../db/schema/exercises';
import { LOCALES } from '../../db/schema/locales';
import { DICTIONARIES } from './dictionaries';
import { searchWords, tokenize, wordVariants } from './exercise-text';

export type SearchWord = {
  patterns: string[];
  muscles: PrimaryMuscle[];
  equipment: Equipment[];
};

export type SearchPlan = {
  words: SearchWord[];
  phrase: string;
};

type Tagged<T extends string> = { slug: T; tokens: string[] };

function tagged<T extends string>(
  labels: Record<T, string>,
  aliases: Record<T, readonly string[]>,
): Tagged<T>[] {
  return (Object.keys(labels) as T[]).map((slug) => ({
    slug,
    tokens: [labels[slug], ...aliases[slug]].flatMap(tokenize),
  }));
}

function mergeBySlug<T extends string>(groups: Tagged<T>[][]): Tagged<T>[] {
  const merged = new Map<T, string[]>();
  for (const group of groups) {
    for (const { slug, tokens } of group) {
      merged.set(slug, [...(merged.get(slug) ?? []), ...tokens]);
    }
  }
  return [...merged].map(([slug, tokens]) => ({ slug, tokens }));
}

const MUSCLE_TAGS = mergeBySlug(
  LOCALES.map((locale) =>
    tagged(DICTIONARIES[locale].muscles, DICTIONARIES[locale].muscleAliases),
  ),
);

const EQUIPMENT_TAGS = mergeBySlug(
  LOCALES.map((locale) =>
    tagged(
      DICTIONARIES[locale].equipment,
      DICTIONARIES[locale].equipmentAliases,
    ),
  ),
);

function matchingSlugs<T extends string>(
  tags: Tagged<T>[],
  variants: string[],
): T[] {
  return tags
    .filter(({ tokens }) =>
      variants.some((variant) =>
        tokens.some((token) => token.startsWith(variant)),
      ),
    )
    .map(({ slug }) => slug);
}

export function buildSearchPlan(query: string | undefined): SearchPlan {
  const words = searchWords(query).map((word): SearchWord => {
    const variants = wordVariants(word);
    return {
      patterns: variants.map((variant) => `% ${variant}%`),
      muscles: matchingSlugs(MUSCLE_TAGS, variants),
      equipment: matchingSlugs(EQUIPMENT_TAGS, variants),
    };
  });
  return {
    words,
    phrase: searchWords(query).join(' '),
  };
}
