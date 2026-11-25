import { describe, expect, it } from 'vitest';
import {
  normalizeText,
  searchWords,
  tokenize,
  TRANSLATE_FROM,
  TRANSLATE_TO,
  wordVariants,
} from './exercise-text';

describe('normalizeText', () => {
  it('lowercases Latin and Cyrillic letters', () => {
    expect(normalizeText('Жим Штанги ЛЕЖАчи')).toBe('жим штанги лежачи');
    expect(normalizeText('Barbell BENCH')).toBe('barbell bench');
  });

  it('folds ё into е and every apostrophe into one', () => {
    expect(normalizeText('Всё')).toBe('все');
    expect(normalizeText("Farmer’s ʼWalk` m'язи")).toBe(
      "farmer's 'walk' m'язи",
    );
  });

  it('turns punctuation into single spaces', () => {
    expect(normalizeText('T-Bar Row (wide), close/neutral')).toBe(
      't bar row wide close neutral',
    );
  });

  it('keeps the translate tables aligned for the SQL side', () => {
    expect(Array.from(TRANSLATE_FROM)).toHaveLength(
      Array.from(TRANSLATE_TO).length,
    );
  });
});

describe('tokenize', () => {
  it('drops characters that could act as LIKE wildcards', () => {
    expect(tokenize('100% bench_press #1 a\\b')).toEqual([
      '100',
      'bench',
      'press',
      '1',
      'a',
      'b',
    ]);
  });

  it('splits on characters it does not keep', () => {
    expect(tokenize('be%nch')).toEqual(['be', 'nch']);
  });

  it('returns nothing for blank input', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('searchWords', () => {
  it('handles a missing query', () => {
    expect(searchWords(undefined)).toEqual([]);
  });

  it('keeps at most eight words', () => {
    expect(searchWords('a b c d e f g h i j')).toHaveLength(8);
  });
});

describe('wordVariants', () => {
  it('keeps short words as they are', () => {
    expect(wordVariants('жим')).toEqual(['жим']);
    expect(wordVariants('bars')).toEqual(['bars']);
  });

  it('cuts up to three trailing letters but keeps four', () => {
    expect(wordVariants('гантелями')).toEqual([
      'гантелями',
      'гантелям',
      'гантеля',
      'гантел',
    ]);
    expect(wordVariants('біцепс')).toEqual(['біцепс', 'біцеп', 'біце']);
    expect(wordVariants('press')).toEqual(['press', 'pres']);
  });
});
