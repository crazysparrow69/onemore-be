const UPPER_LETTERS = 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЫЭЁ';
const LOWER_LETTERS = 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюяыэе';
const APOSTROPHES = 'ʼ’‘`';
const SEPARATORS = '-_()[]{},./\\:;!?"+&*';

export const TRANSLATE_FROM = `${UPPER_LETTERS}ё${APOSTROPHES}${SEPARATORS}`;
export const TRANSLATE_TO = `${LOWER_LETTERS}е${"'".repeat(APOSTROPHES.length)}${' '.repeat(SEPARATORS.length)}`;

const CHARACTER_MAP = new Map(
  Array.from(TRANSLATE_FROM).map((char, index) => [
    char,
    Array.from(TRANSLATE_TO)[index] ?? char,
  ]),
);

const MIN_STEM_LENGTH = 4;
const MAX_CUT = 3;
const MIN_LENGTH_FOR_STEMMING = 5;
const MAX_WORDS = 8;

export function normalizeText(value: string): string {
  return Array.from(value.toLowerCase())
    .map((char) => CHARACTER_MAP.get(char) ?? char)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 0);
}

export function searchWords(query: string | undefined): string[] {
  return tokenize(query ?? '').slice(0, MAX_WORDS);
}

export function wordVariants(word: string): string[] {
  const variants = [word];
  if (word.length < MIN_LENGTH_FOR_STEMMING) {
    return variants;
  }
  for (let cut = 1; cut <= MAX_CUT; cut += 1) {
    if (word.length - cut >= MIN_STEM_LENGTH) {
      variants.push(word.slice(0, word.length - cut));
    }
  }
  return variants;
}
